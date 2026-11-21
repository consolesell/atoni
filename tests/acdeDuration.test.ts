import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AdaptiveContractDurationEngine,
  DEFAULT_DURATION_GOVERNANCE,
  PRESET_DURATIONS,
  formatDurationLabel,
  fromDerivDurationUnit,
  normalizeDurationUnit,
  toDerivDurationUnit,
} from '../src/lib/adaptiveDurationEngine.ts';
import { AutonomyManager } from '../src/lib/autonomyManager.ts';
import { ConfigurationManager } from '../src/lib/configurationManager.ts';
import { ExecutionBrokerAdapter, ExecutionController } from '../src/lib/executionController.ts';
import { PortfolioReconciler } from '../src/lib/portfolioReconciler.ts';
import { TradeReadinessGuard } from '../src/lib/readinessGuard.ts';
import { StrategyEvolutionManager, BASELINE_STRATEGY_PARAMETERS } from '../src/lib/strategyEvolutionManager.ts';
import { evaluateSniperConfluence } from '../src/lib/sniperEngine.ts';
import { runAlgorithmicDecisionEngine, DEFAULT_AGENTS } from '../src/lib/decisionEngine.ts';
import {
  BalanceSnapshot,
  Candle,
  DurationGovernancePolicy,
  DurationRecommendation,
  MarketRegime,
  TechnicalIndicators,
  TradeRecord,
} from '../src/types/trading.ts';

class InMemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  private map = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  public removeItem(key: string): void {
    this.map.delete(key);
  }
}

function createFreshBalanceSnapshot(amount = 500): BalanceSnapshot {
  const now = Date.now();
  return {
    account_id: 'VRTC9991',
    login_id: 'VRTC9991',
    account_type: 'demo',
    currency: 'USD',
    amount,
    freshness: 'LIVE',
    source: 'SUBSCRIPTION',
    connection_state: 'ONLINE',
    last_updated: now,
    session_generation: 1,
  };
}

function createSyntheticCandles(
  count: number,
  options?: { basePrice?: number; rangePct?: number; spikeLastPct?: number }
): Candle[] {
  const basePrice = options?.basePrice ?? 1000;
  const rangePct = options?.rangePct ?? 0.002;
  const candles: Candle[] = [];
  let price = basePrice;
  const startEpoch = Math.floor(Date.now() / 1000) - count * 60;

  for (let i = 0; i < count; i++) {
    const isLastWindow = options?.spikeLastPct && i >= count - 6;
    const stepRange = isLastWindow ? options.spikeLastPct! : rangePct;
    const dir = i % 2 === 0 ? 1 : -0.45;
    const delta = price * stepRange * dir;
    const open = price;
    const close = Number((open + delta).toFixed(4));
    const high = Number((Math.max(open, close) + price * stepRange * 0.4).toFixed(4));
    const low = Number((Math.min(open, close) - price * stepRange * 0.35).toFixed(4));
    candles.push({
      epoch: startEpoch + i * 60,
      open,
      high,
      low,
      close,
      volume: 10,
    });
    price = close;
  }
  return candles;
}

function createBasicIndicators(price = 1005, overrides?: Partial<TechnicalIndicators>): TechnicalIndicators {
  return {
    rsi: [52, 55, 58],
    rsiNow: 58,
    ma14: [1000, 1002, 1004],
    ma14Now: 1004,
    ma50: [995, 997, 999],
    ma50Now: 999,
    macd: { macdLine: [0.5], signalLine: [0.3], histogram: [0.2] },
    macdNow: 0.5,
    bb: [{ upper: 1015, middle: 1002, lower: 989 }],
    bbNow: { upper: 1015, middle: 1002, lower: 989 },
    atr: [2.1, 2.2, 2.3],
    atrNow: 2.3,
    volatility: 0.0023,
    currentPrice: price,
    pattern: {
      pattern: 'NONE',
      strength: 0.5,
      signal: 'NEUTRAL',
    },
    vwapAnalysis: {
      vwap: price,
      deviation: 0,
      signal: 'NEUTRAL',
      currentPrice: price,
    },
    mood: {
      mood: 'BULLISH',
      strength: 0.7,
      ratio: 0.7,
    },
    regime: { type: 'UPTREND', confidence: 0.75 },
    mtfAnalysis: {
      consistency: 0.82,
      direction: 'BULLISH',
      strength: 0.85,
    },
    microAnalysis: {
      momentum: 0.72,
      volatility: 0.002,
      prediction: 'BULLISH',
      confidence: 0.8,
    },
    ...overrides,
  };
}

function createBrokerStub(overrides?: Partial<ExecutionBrokerAdapter>): {
  adapter: ExecutionBrokerAdapter;
  quoteRequests: Array<{ symbol: string; duration: number; duration_unit: string }>;
} {
  const quoteRequests: Array<{ symbol: string; duration: number; duration_unit: string }> = [];
  let buySeq = 0;

  const adapter: ExecutionBrokerAdapter = {
    getConnectionState: () => 'ONLINE',
    getAuthSession: () => ({
      isAuthorized: true,
      loginid: 'VRTC9991',
      accountId: 'VRTC9991',
      currency: 'USD',
      accountType: 'demo',
    }),
    getSelectedAccountId: () => 'VRTC9991',
    getBalanceSnapshot: () => createFreshBalanceSnapshot(500),
    areRequiredSubscriptionsActive: () => true,
    requestProposalQuote: async ({ amount, symbol, duration, duration_unit }) => {
      const now = Date.now();
      quoteRequests.push({ symbol, duration, duration_unit });
      const unitSec =
        duration_unit === 'ticks'
          ? duration * 2
          : duration_unit === 'seconds'
          ? duration
          : duration_unit === 'minutes'
          ? duration * 60
          : duration_unit === 'hours'
          ? duration * 3600
          : duration * 86400;
      return {
        proposalId: `prop_${now}_${quoteRequests.length}`,
        askPrice: amount,
        payout: Number((amount * 1.95).toFixed(2)),
        spot: 1005.2,
        spotTimeMs: now,
        fetchedAt: now,
        expiresAt: now + 15_000,
        dateStartMs: now,
        dateExpiryMs: now + unitSec * 1000,
        symbol,
      };
    },
    buyProposal: async (proposalId, maxPrice) => {
      buySeq += 1;
      return {
        contract_id: `ct_${buySeq}_${proposalId.slice(-4)}`,
        buy_price: maxPrice,
        payout: Number((maxPrice * 1.95).toFixed(2)),
        start_time: Math.floor(Date.now() / 1000),
      };
    },
    sellContract: async (_contractId, minPrice = 0) => ({
      sold_for: Math.max(minPrice, 2.65),
      transaction_id: `tx_sell_${Date.now()}`,
    }),
    subscribeOpenContract: async () => {},
    reconcileBrokerState: async () => ({ openPortfolioContracts: [], settledTransactions: [] }),
    ...overrides,
  };

  return { adapter, quoteRequests };
}

test('J1. All 6 execution sources (Manual, Auto-Bot, SBAgent, Copilot, Sniper, Gemini AI) route through ACDE & ExecutionController', async () => {
  const storage = new InMemoryStorage();
  const config = new ConfigurationManager(storage);
  config.update(() => ({
    risk: {
      sizingMode: 'FIXED',
      fixedStake: 2,
      maxDailyTrades: 50,
      maxOpenExposure: 100,
      maxConcurrentContracts: 5,
      maxDailyLoss: 50,
      maxSessionDrawdownPercent: 15,
      maxConsecutiveLosses: 5,
      maxStakePercent: 0.1,
      minStake: 0.35,
      strictDurationCompliance: true,
    },
  }));

  const autonomy = new AutonomyManager();
  autonomy.start({
    permissions: {
      allowAutoBot: true,
      allowSubagent: true,
      allowAiTriggers: true,
      allowEarlySelling: true,
      allowSymbolRotation: false,
    },
    reason: 'test_j1',
  });

  const broker = createBrokerStub();
  const reconciler = new PortfolioReconciler();
  const controller = new ExecutionController({
    broker: broker.adapter,
    autonomy,
    configManager: config,
    readinessGuard: new TradeReadinessGuard(),
    reconciler,
  });

  const now = Date.now();
  const makeRec = (source: DurationRecommendation['source']): DurationRecommendation => ({
    value: 5,
    unit: 'minutes',
    confidence: 82,
    strategyId: 'test_strat',
    strategyVersion: 'v4.1.0-baseline',
    symbol: '1HZ10V',
    marketRegime: 'STRONG_UPTREND',
    signalTimestamp: now - 1000,
    timeframeContext: 'Chart 60s (decoupled)',
    expectedHoldingWindow: '5m',
    validUntil: now + 60_000,
    rationale: 'Structured J1 test recommendation',
    source,
  });

  // Also test decisionEngine & sniperEngine structured duration output
  const candles = createSyntheticCandles(35);
  const indicators = createBasicIndicators(candles[candles.length - 1].close);
  const regime: MarketRegime = { type: 'STRONG_UPTREND', confidence: 0.85 };
  const decision = runAlgorithmicDecisionEngine(candles, indicators, DEFAULT_AGENTS, 0.38, 0, { symbol: '1HZ10V' });
  assert.ok(decision.durationRecommendation, 'Decision engine must produce structured DurationRecommendation');
  const sniper = evaluateSniperConfluence(candles[candles.length - 1].close, candles, indicators, regime, decision, DEFAULT_AGENTS, '1HZ10V', 60);
  assert.ok(sniper.recommendedDuration.unit, 'Sniper must carry explicit unit');

  const sources: Array<{ src: 'MANUAL' | 'AUTO_BOT' | 'SUBAGENT_MD' | 'COPILOT' | 'GEMINI_AI'; isSniper?: boolean; rec?: DurationRecommendation }> = [
    { src: 'MANUAL' },
    { src: 'AUTO_BOT', rec: decision.durationRecommendation },
    { src: 'SUBAGENT_MD', rec: makeRec('SUBAGENT_MD') },
    { src: 'COPILOT', rec: makeRec('COPILOT') },
    { src: 'AUTO_BOT', isSniper: true, rec: makeRec('SNIPER') },
    { src: 'GEMINI_AI', rec: makeRec('GEMINI_AI') },
  ];

  for (const item of sources) {
    const res = await controller.executePurchase({
      source: item.src,
      symbol: '1HZ10V',
      contractType: 'CALL',
      stake: 2,
      duration: 5,
      durationUnit: 'minutes',
      chartTimeframeSeconds: 60,
      isSniperTrade: item.isSniper,
      durationRecommendation: item.rec ?? null,
      autonomyGeneration: item.src === 'MANUAL' ? undefined : autonomy.getGeneration(),
    });
    assert.equal(res.executed, true, `${item.src} (sniper=${!!item.isSniper}) should execute cleanly: ${res.reason}`);
    assert.equal(res.tradeRecord?.requestedDuration, 5);
    assert.equal(res.tradeRecord?.requestedDurationUnit, 'minutes');
    assert.equal(res.tradeRecord?.chartTimeframeSeconds, 60);
  }

  assert.equal(broker.quoteRequests.length, 6);
});

test('J2. Unitless numeric AI duration is NEVER treated as minutes and is rejected', async () => {
  const engine = new AdaptiveContractDurationEngine();

  // Bare number rejected by validateStructuredRecommendation
  const bareNumberRes = engine.validateStructuredRecommendation(15 as any, { symbol: '1HZ10V' }, 'GEMINI_AI');
  assert.equal(bareNumberRes.valid, false);
  assert.match(bareNumberRes.reason || '', /unitless|Structured/i);

  // Object missing explicit unit is rejected
  const missingUnitRes = engine.validateStructuredRecommendation(
    { value: 15, symbol: '1HZ10V', validUntil: Date.now() + 60_000 },
    { symbol: '1HZ10V' },
    'GEMINI_AI'
  );
  assert.equal(missingUnitRes.valid, false);
  assert.match(missingUnitRes.reason || '', /unit|never interpreted as minutes/i);

  // ExecutionController blocks GEMINI_AI without structured DurationRecommendation
  const autonomy = new AutonomyManager();
  autonomy.start({
    permissions: { allowAutoBot: true, allowSubagent: true, allowAiTriggers: true, allowEarlySelling: true, allowSymbolRotation: false },
    reason: 'test_j2',
  });
  const config = new ConfigurationManager(new InMemoryStorage());
  const controller = new ExecutionController({
    broker: createBrokerStub().adapter,
    autonomy,
    configManager: config,
    readinessGuard: new TradeReadinessGuard(),
    reconciler: new PortfolioReconciler(),
  });

  const aiBlocked = await controller.executePurchase({
    source: 'GEMINI_AI',
    symbol: '1HZ10V',
    contractType: 'CALL',
    stake: 1,
    duration: 15,
    durationUnit: 'minutes',
    durationRecommendation: null,
    autonomyGeneration: autonomy.getGeneration(),
  });
  assert.equal(aiBlocked.executed, false);
  assert.equal(aiBlocked.status, 'BLOCKED');
  assert.match(aiBlocked.reason, /DurationRecommendation|minutes/i);
});

test('J3. Expired, stale, invalid-unit, and symbol-mismatched recommendations are rejected', () => {
  const engine = new AdaptiveContractDurationEngine();
  const now = Date.now();
  const baseValid: DurationRecommendation = {
    value: 5,
    unit: 'minutes',
    confidence: 80,
    strategyId: 'strat',
    strategyVersion: 'v4.1.0-baseline',
    symbol: '1HZ10V',
    marketRegime: 'NEUTRAL',
    signalTimestamp: now - 5_000,
    timeframeContext: 'Chart 60s',
    expectedHoldingWindow: '5m',
    validUntil: now + 60_000,
    rationale: 'Base valid',
    source: 'GEMINI_AI',
  };

  assert.equal(engine.validateStructuredRecommendation(baseValid, { symbol: '1HZ10V', now }).valid, true);

  // Expired validUntil
  const expired = engine.validateStructuredRecommendation(
    { ...baseValid, validUntil: now - 1 },
    { symbol: '1HZ10V', now }
  );
  assert.equal(expired.valid, false);
  assert.match(expired.reason || '', /expired/i);

  // Stale market context
  const stale = engine.validateStructuredRecommendation(
    { ...baseValid, signalTimestamp: now - 10 * 60_000 },
    { symbol: '1HZ10V', now, maxSignalAgeMs: 5 * 60_000 }
  );
  assert.equal(stale.valid, false);
  assert.match(stale.reason || '', /stale/i);

  // Invalid unit
  const badUnit = engine.validateStructuredRecommendation(
    { ...baseValid, unit: 'weeks' as any },
    { symbol: '1HZ10V', now }
  );
  assert.equal(badUnit.valid, false);
  assert.match(badUnit.reason || '', /unit/i);

  // Symbol mismatch
  const symMismatch = engine.validateStructuredRecommendation(
    { ...baseValid, symbol: 'R_100' },
    { symbol: '1HZ10V', now }
  );
  assert.equal(symMismatch.valid, false);
  assert.match(symMismatch.reason || '', /mismatch/i);
});

test('J4. Volatility normalization against symbol-specific historical ATR produces distinct adaptive durations', () => {
  const engine = new AdaptiveContractDurationEngine();
  const regime: MarketRegime = { type: 'SIDEWAYS', confidence: 0.7 };

  // Low-baseline quiet symbol experiencing a sharp 2.2x expansion spike in recent bars -> compressed duration
  const quietBaseExpanding = createSyntheticCandles(40, { rangePct: 0.001, spikeLastPct: 0.005 });
  // Naturally high-vol symbol where 0.005 is QUIET compared to its historical 0.015 baseline -> extended duration
  const wildBaseQuieting = createSyntheticCandles(40, { rangePct: 0.015, spikeLastPct: 0.005 });

  const expansionRes = engine.computeMarketAwareDuration({
    symbol: 'R_10',
    candles: quietBaseExpanding,
    indicators: createBasicIndicators(quietBaseExpanding[quietBaseExpanding.length - 1].close),
    regime,
    confidence: 0.75,
  });

  const contractionRes = engine.computeMarketAwareDuration({
    symbol: '1HZ100V',
    candles: wildBaseQuieting,
    indicators: createBasicIndicators(wildBaseQuieting[wildBaseQuieting.length - 1].close),
    regime,
    confidence: 0.75,
  });

  assert.ok(
    expansionRes.volatilityProfile.relativeAtrRatio > contractionRes.volatilityProfile.relativeAtrRatio,
    `Relative ATR ratio must normalize against each symbol's own baseline (${expansionRes.volatilityProfile.relativeAtrRatio} vs ${contractionRes.volatilityProfile.relativeAtrRatio})`
  );

  const expansionSec =
    expansionRes.unit === 'seconds' ? expansionRes.duration : expansionRes.duration * 60;
  const contractionSec =
    contractionRes.unit === 'seconds' ? contractionRes.duration : contractionRes.duration * 60;

  assert.ok(
    expansionSec < contractionSec,
    `Volatility-expanding symbol should receive shorter contract horizon (${expansionSec}s) than cooling high-vol symbol (${contractionSec}s)`
  );
});

test('J5. Chart granularity is decoupled from contract expiry duration', () => {
  const engine = new AdaptiveContractDurationEngine();
  const candles = createSyntheticCandles(40, { rangePct: 0.002 });
  const indicators = createBasicIndicators(candles[candles.length - 1].close);
  const regime: MarketRegime = { type: 'STRONG_UPTREND', confidence: 0.8 };

  const res1m = engine.computeMarketAwareDuration({
    symbol: '1HZ10V',
    candles,
    indicators,
    regime,
    confidence: 0.75,
    chartTimeframeSeconds: 60,
  });

  const res15m = engine.computeMarketAwareDuration({
    symbol: '1HZ10V',
    candles,
    indicators,
    regime,
    confidence: 0.75,
    chartTimeframeSeconds: 900,
  });

  assert.equal(res1m.duration, res15m.duration);
  assert.equal(res1m.unit, res15m.unit);
  assert.notEqual(res15m.duration, 15, '900s chart timeframe must NOT force 15m contract duration');
  assert.equal(res1m.chartTimeframeSeconds, 60);
  assert.equal(res15m.chartTimeframeSeconds, 900);
});

test('J6. ACDE returns HOLD on low confidence or tight Bollinger compression under HOLD policy', () => {
  const engine = new AdaptiveContractDurationEngine();
  const candles = createSyntheticCandles(40, { rangePct: 0.001 });
  const holdPolicy: DurationGovernancePolicy = {
    ...DEFAULT_DURATION_GOVERNANCE,
    confidenceThreshold: 65,
    fallbackBehavior: 'HOLD',
  };

  // Low confidence -> HOLD
  const lowConf = engine.computeMarketAwareDuration({
    symbol: '1HZ10V',
    candles,
    indicators: createBasicIndicators(candles[candles.length - 1].close),
    regime: { type: 'SIDEWAYS', confidence: 0.45 },
    confidence: 0.45,
    governance: holdPolicy,
  });
  assert.equal(lowConf.action, 'HOLD');
  assert.equal(lowConf.recommendation, null);
  assert.match(lowConf.holdReason || '', /confidence/i);

  // Extreme Bollinger squeeze -> HOLD
  const px = candles[candles.length - 1].close;
  const squeeze = engine.computeMarketAwareDuration({
    symbol: '1HZ10V',
    candles,
    indicators: createBasicIndicators(px, {
      bbNow: { upper: px + 0.05, middle: px, lower: px - 0.05 },
    }),
    regime: { type: 'CONSOLIDATION', confidence: 0.7 },
    confidence: 0.8,
    governance: holdPolicy,
  });
  assert.equal(squeeze.action, 'HOLD');
  assert.match(squeeze.holdReason || '', /Bollinger compression/i);
});

test('J7. MANUAL_OVERRIDE preserves operator duration within broker bounds and rejects illegal durations cleanly', () => {
  const engine = new AdaptiveContractDurationEngine();
  const govManual: DurationGovernancePolicy = {
    ...DEFAULT_DURATION_GOVERNANCE,
    mode: 'MANUAL_OVERRIDE',
    globalMinSeconds: 30,
    globalMaxSeconds: 3600,
  };

  const manualValid = engine.resolveExecutionDuration({
    source: 'MANUAL',
    symbol: '1HZ10V',
    contractType: 'CALL',
    requestedDuration: 10,
    requestedUnit: 'minutes',
    governance: govManual,
  });
  assert.equal(manualValid.approved, true);
  assert.equal(manualValid.duration, 10);
  assert.equal(manualValid.unit, 'minutes');
  assert.equal(manualValid.wasAdjusted, false);

  // Manual override below global/broker min is explicitly rejected (never silently changed)
  const manualIllegal = engine.resolveExecutionDuration({
    source: 'MANUAL',
    symbol: '1HZ10V',
    contractType: 'CALL',
    requestedDuration: 5,
    requestedUnit: 'seconds',
    governance: govManual,
  });
  assert.equal(manualIllegal.approved, false);
  assert.ok(manualIllegal.rejectionReason);

  // ADAPTIVE_AUTO clamps/adjusts cleanly with originalDuration audit trail
  const autoAdjusted = engine.resolveExecutionDuration({
    source: 'AUTO_BOT',
    symbol: '1HZ10V',
    contractType: 'CALL',
    requestedDuration: 5,
    requestedUnit: 'seconds',
    governance: { ...govManual, mode: 'ADAPTIVE_AUTO' },
  });
  assert.equal(autoAdjusted.approved, true);
  assert.equal(autoAdjusted.originalDuration, 5);
  assert.equal(autoAdjusted.originalUnit, 'seconds');
  assert.equal(autoAdjusted.duration, 30);
  assert.equal(autoAdjusted.unit, 'seconds');
  assert.equal(autoAdjusted.wasAdjusted, true);
  assert.ok(autoAdjusted.adjustmentReason);
});

test('J8. Broker contracts_for metadata validates symbol bounds and preserves adjustment audit trail', () => {
  const engine = new AdaptiveContractDurationEngine();
  engine.registerContractsForMetadata('frxEURUSD', [
    {
      contract_type: 'CALL',
      contract_category: 'callput',
      expiry_type: 'intraday',
      min_contract_duration: '15m',
      max_contract_duration: '4h',
    },
    {
      contract_type: 'PUT',
      contract_category: 'callput',
      expiry_type: 'intraday',
      min_contract_duration: '15m',
      max_contract_duration: '4h',
    },
  ]);

  const bounds = engine.getSymbolDurationBounds('frxEURUSD', 'CALL');
  assert.equal(bounds.source, 'DERIV_CONTRACTS_FOR');
  assert.equal(bounds.minTimeSeconds, 900);
  assert.equal(bounds.effectiveBounds.minSeconds, 900);
  assert.equal(bounds.effectiveBounds.maxSeconds, 14400);

  // Requesting 5 ticks on a forex symbol that does not allow ticks adjusts cleanly
  const normalized = engine.normalizeToLegalDuration({
    symbol: 'frxEURUSD',
    requestedDuration: 5,
    requestedUnit: 'ticks',
    contractType: 'CALL',
  });
  assert.equal(normalized.valid, true);
  assert.equal(normalized.adjusted, true);
  assert.equal(normalized.originalDuration, 5);
  assert.equal(normalized.originalUnit, 'ticks');
  assert.equal(normalized.duration, 15);
  assert.equal(normalized.unit, 'minutes');
  assert.match(normalized.adjustmentReason || '', /does not permit tick contracts/i);
});

test('J9. Proposal expiry mismatch rejects quote on time-based contract before purchase', async () => {
  const now = Date.now();
  const broker = createBrokerStub({
    requestProposalQuote: async ({ amount, symbol }) => ({
      proposalId: 'prop_mismatch',
      askPrice: amount,
      payout: amount * 1.95,
      spot: 1000,
      spotTimeMs: now,
      fetchedAt: now,
      expiresAt: now + 15_000,
      dateStartMs: now,
      // Requested 5 minutes (300s) but broker returned 60s expiry
      dateExpiryMs: now + 60_000,
      symbol,
    }),
  });

  const autonomy = new AutonomyManager();
  const controller = new ExecutionController({
    broker: broker.adapter,
    autonomy,
    configManager: new ConfigurationManager(new InMemoryStorage()),
    readinessGuard: new TradeReadinessGuard(),
    reconciler: new PortfolioReconciler(),
  });

  const res = await controller.executePurchase({
    source: 'MANUAL',
    symbol: '1HZ10V',
    contractType: 'CALL',
    stake: 1,
    duration: 5,
    durationUnit: 'minutes',
  });

  assert.equal(res.executed, false);
  assert.equal(res.status, 'BLOCKED');
  assert.match(res.reason, /expiry mismatch|60.*300/i);
});

test('J10. Tick contract validates integer bounds, fresh timestamps, and future date_expiry WITHOUT comparing ticks to wall-clock seconds', async () => {
  const engine = new AdaptiveContractDurationEngine();
  const now = Date.now();

  // Broker returns date_expiry = +12s while requested = 5 ticks (must pass without 5 vs 12 mismatch)
  const tickVerify = engine.verifyBrokerProposalExpiry({
    symbol: '1HZ10V',
    requestedDuration: 5,
    requestedUnit: 'ticks',
    dateStartMs: now,
    dateExpiryMs: now + 12_000,
    spotTimeMs: now - 500,
    brokerQuoteExpiresAtMs: now + 15_000,
    fetchedAt: now,
    now,
  });
  assert.equal(tickVerify.verified, true);
  assert.equal(tickVerify.observedHorizonSeconds, undefined);
  assert.equal(tickVerify.brokerDurationUnit, 't');

  // Out-of-bounds tick count (e.g., 15 ticks) is rejected
  const badTickCount = engine.verifyBrokerProposalExpiry({
    symbol: '1HZ10V',
    requestedDuration: 15,
    requestedUnit: 'ticks',
    dateStartMs: now,
    dateExpiryMs: now + 15_000,
    spotTimeMs: now,
    fetchedAt: now,
    now,
  });
  assert.equal(badTickCount.verified, false);
  assert.match(badTickCount.note || '', /tick bounds/i);

  // Full ExecutionController purchase for 5 ticks succeeds cleanly
  const broker = createBrokerStub();
  const controller = new ExecutionController({
    broker: broker.adapter,
    autonomy: new AutonomyManager(),
    configManager: new ConfigurationManager(new InMemoryStorage()),
    readinessGuard: new TradeReadinessGuard(),
    reconciler: new PortfolioReconciler(),
  });

  const tickTrade = await controller.executePurchase({
    source: 'MANUAL',
    symbol: '1HZ10V',
    contractType: 'CALL',
    stake: 1,
    duration: 5,
    durationUnit: 'ticks',
    chartTimeframeSeconds: 300,
  });
  assert.equal(tickTrade.executed, true);
  assert.equal(tickTrade.tradeRecord?.requestedDuration, 5);
  assert.equal(tickTrade.tradeRecord?.requestedDurationUnit, 'ticks');
  assert.equal(tickTrade.tradeRecord?.chartTimeframeSeconds, 300);
});

test('J11. Separated persistence preserves requested duration, broker expiry, chart timeframe, and actual early-exit holding time independently', async () => {
  const broker = createBrokerStub();
  const controller = new ExecutionController({
    broker: broker.adapter,
    autonomy: new AutonomyManager(),
    configManager: new ConfigurationManager(new InMemoryStorage()),
    readinessGuard: new TradeReadinessGuard(),
    reconciler: new PortfolioReconciler(),
  });

  const buyRes = await controller.executePurchase({
    source: 'MANUAL',
    symbol: '1HZ10V',
    contractType: 'CALL',
    stake: 2,
    duration: 15,
    durationUnit: 'minutes',
    chartTimeframeSeconds: 60,
  });
  assert.equal(buyRes.executed, true);
  const openTrade = buyRes.tradeRecord!;
  const origBrokerExpiry = openTrade.brokerConfirmedExpiryMs;
  assert.ok(origBrokerExpiry && origBrokerExpiry > Date.now() + 800_000);

  const saleTs = Date.parse(openTrade.timestamp) + 23_000;
  const sellRes = await controller.executeSell({
    source: 'EARLY_SELLING',
    trade: { ...openTrade, isValidToSell: true },
    minPrice: 0,
    reason: 'Profit Lock Secured',
    now: saleTs,
  });

  assert.equal(sellRes.sold, true);
  assert.equal(sellRes.actualSaleTime, saleTs);
  assert.equal(sellRes.actualHoldingMs, 23_000);
  // Original requested duration and broker expiry on openTrade remain completely untouched
  assert.equal(openTrade.requestedDuration, 15);
  assert.equal(openTrade.requestedDurationUnit, 'minutes');
  assert.equal(openTrade.brokerConfirmedExpiryMs, origBrokerExpiry);
  assert.equal(openTrade.chartTimeframeSeconds, 60);
});

test('J12. StrategyEvolutionManager chronological 70/30 OOS attribution flags < minSampleCount as uncalibrated', () => {
  const sem = new StrategyEvolutionManager(new InMemoryStorage());
  const baseTs = Date.now() - 100 * 60_000;

  const makeClosed = (i: number, duration: number, isWin: boolean): TradeRecord => ({
    id: `t_${i}`,
    timestamp: new Date(baseTs + i * 60_000).toISOString(),
    symbol: '1HZ10V',
    decision: 'CALL',
    amount: 1,
    confidence: 0.8,
    entryPrice: 1000,
    exitPrice: isWin ? 1005 : 995,
    profit: isWin ? 0.95 : -1,
    result: isWin ? 'WIN' : 'LOSS',
    duration,
    durationUnit: 'minutes',
    requestedDuration: duration,
    requestedDurationUnit: 'minutes',
    chartTimeframeSeconds: 60,
    agent: 'Consensus',
    regime: 'STRONG_UPTREND',
    mode: 'DEMO',
    strategyVersion: 'v4.1.0-baseline',
  });

  // Small sample bucket (4 trades < 8 minSampleCount) -> must be marked uncalibrated even with 100% win rate
  const smallTrades = [0, 1, 2, 3].map((i) => makeClosed(i, 2, true));
  const smallEval = sem.evaluateDurationHorizons({
    symbol: '1HZ10V',
    regime: 'STRONG_UPTREND',
    minSamples: 8,
    closedTrades: smallTrades,
  });
  assert.equal(smallEval.uncalibrated, true);
  assert.equal(smallEval.bestBucket, null);
  assert.equal(smallEval.buckets[0]?.uncalibrated, true);

  // Calibrated bucket (10 trades >= 8, chronological 70/30 OOS positive) + uncalibrated bucket
  const mixedTrades: TradeRecord[] = [
    ...smallTrades,
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => makeClosed(i + 10, 5, i !== 2)),
  ];
  const calEval = sem.evaluateDurationHorizons({
    symbol: '1HZ10V',
    regime: 'STRONG_UPTREND',
    minSamples: 8,
    outOfSampleRatio: 0.3,
    closedTrades: mixedTrades,
  });
  assert.equal(calEval.uncalibrated, false);
  assert.equal(calEval.bestBucket?.duration, 5);
  assert.equal(calEval.bestBucket?.outOfSampleTrades, 3);
  assert.ok((calEval.bestBucket?.outOfSampleExpectancy ?? 0) > 0);
});

test('J13. Hard guard forbids lengthening duration after losses in StrategyEvolutionManager and ACDE', () => {
  const sem = new StrategyEvolutionManager(new InMemoryStorage());
  const rejected = sem.validateCandidateProposal({
    proposedParameters: { ...BASELINE_STRATEGY_PARAMETERS },
    rationale: 'Extend horizon to 60m after consecutive losses',
    closedTrades: [],
    postLossDurationLengtheningRequested: true,
  });
  assert.equal(rejected.riskCheckPassed, false);
  assert.ok(
    rejected.riskRejectionReasons.some((r) => /Lengthening contract duration|recover losses/i.test(r))
  );

  // ACDE caps duration <= lastLossDuration when consecutiveLosses > 0
  const engine = new AdaptiveContractDurationEngine();
  const candles = createSyntheticCandles(40, { rangePct: 0.002 });
  const capped = engine.computeMarketAwareDuration({
    symbol: '1HZ10V',
    candles,
    indicators: createBasicIndicators(candles[candles.length - 1].close),
    regime: { type: 'STRONG_UPTREND', confidence: 0.85 },
    confidence: 0.85,
    consecutiveLosses: 2,
    lastLossDuration: { value: 60, unit: 'seconds' },
    governance: {
      ...DEFAULT_DURATION_GOVERNANCE,
      recalibrationPolicy: { minSampleCount: 8, outOfSampleRatio: 0.3, neverLengthenAfterLoss: true },
    },
  });
  const cappedSec = capped.unit === 'seconds' ? capped.duration : capped.duration * 60;
  assert.ok(cappedSec <= 60, `Expected ACDE horizon <= 60s post-loss, got ${cappedSec}s`);
});

test('J14. UI unit labels, Deriv wire codes, and canonical presets cover ticks, seconds, minutes, hours, and days', () => {
  assert.equal(formatDurationLabel(1, 'ticks'), '1 Tick');
  assert.equal(formatDurationLabel(5, 'ticks'), '5 Ticks');
  assert.equal(formatDurationLabel(30, 'seconds'), '30s');
  assert.equal(formatDurationLabel(15, 'minutes'), '15m');
  assert.equal(formatDurationLabel(4, 'hours'), '4h');
  assert.equal(formatDurationLabel(1, 'days'), '1d');

  assert.equal(toDerivDurationUnit('ticks'), 't');
  assert.equal(toDerivDurationUnit('seconds'), 's');
  assert.equal(toDerivDurationUnit('minutes'), 'm');
  assert.equal(toDerivDurationUnit('hours'), 'h');
  assert.equal(toDerivDurationUnit('days'), 'd');

  assert.equal(fromDerivDurationUnit('h'), 'hours');
  assert.equal(fromDerivDurationUnit('d'), 'days');
  assert.equal(normalizeDurationUnit('invalid'), null);

  const unitsInPresets = new Set(PRESET_DURATIONS.map((p) => p.unit));
  assert.deepEqual(
    ['ticks', 'seconds', 'minutes', 'hours', 'days'].every((u) => unitsInPresets.has(u as any)),
    true
  );
});
