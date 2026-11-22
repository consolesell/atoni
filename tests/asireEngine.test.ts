import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SymbolIntelligenceEngine,
  RotationBrokerVerifier,
  computeSynchronizedCorrelation,
} from '../src/lib/symbolIntelligenceEngine.ts';
import { AutonomyManager } from '../src/lib/autonomyManager.ts';
import { ConfigurationManager } from '../src/lib/configurationManager.ts';
import { ExecutionBrokerAdapter, ExecutionController } from '../src/lib/executionController.ts';
import { MemoryManager } from '../src/lib/memoryManager.ts';
import { PortfolioReconciler } from '../src/lib/portfolioReconciler.ts';
import { TradeReadinessGuard } from '../src/lib/readinessGuard.ts';
import { BalanceSnapshot, Candle, TradeRecord } from '../src/types/trading.ts';

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

function buildTrendCandles(
  count: number,
  options?: {
    basePrice?: number;
    stepPct?: number;
    direction?: 1 | -1 | 0;
    noisePct?: number;
    endEpochSec?: number;
    granularitySec?: number;
  }
): Candle[] {
  const basePrice = options?.basePrice ?? 1000;
  const stepPct = options?.stepPct ?? 0.0025;
  const direction = options?.direction ?? 1;
  const noisePct = options?.noisePct ?? 0.0004;
  const gran = options?.granularitySec ?? 60;
  const endEpoch = options?.endEpochSec ?? Math.floor(Date.now() / 1000);
  const startEpoch = endEpoch - (count - 1) * gran;

  const candles: Candle[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const wave = i % 3 === 0 ? -noisePct : noisePct;
    const drift = direction === 0 ? (i % 2 === 0 ? stepPct : -stepPct) : direction * stepPct;
    const open = Number(price.toFixed(4));
    const close = Number((open * (1 + drift + wave)).toFixed(4));
    const high = Number((Math.max(open, close) * (1 + Math.abs(noisePct) + 0.0003)).toFixed(4));
    const low = Number((Math.min(open, close) * (1 - Math.abs(noisePct) - 0.0003)).toFixed(4));
    candles.push({
      epoch: startEpoch + i * gran,
      open,
      high,
      low,
      close,
    });
    price = close;
  }
  return candles;
}

function buildCorrelatedPair(count: number, gran = 60, endEpochSec = Math.floor(Date.now() / 1000)) {
  const startEpoch = endEpochSec - (count - 1) * gran;
  const candlesA: Candle[] = [];
  const candlesB: Candle[] = [];
  const candlesInverse: Candle[] = [];
  let pA = 1000;
  let pB = 500;
  let pInv = 800;

  for (let i = 0; i < count; i++) {
    const ret = (Math.sin(i * 0.65) * 0.003) + (i % 5 === 0 ? 0.004 : -0.0015);
    const nextA = Number((pA * (1 + ret)).toFixed(4));
    const nextB = Number((pB * (1 + ret * 1.15)).toFixed(4));
    const nextInv = Number((pInv * (1 - ret * 1.1)).toFixed(4));
    const epoch = startEpoch + i * gran;

    candlesA.push({ epoch, open: pA, high: Math.max(pA, nextA) + 0.5, low: Math.min(pA, nextA) - 0.5, close: nextA });
    candlesB.push({ epoch, open: pB, high: Math.max(pB, nextB) + 0.3, low: Math.min(pB, nextB) - 0.3, close: nextB });
    candlesInverse.push({ epoch, open: pInv, high: Math.max(pInv, nextInv) + 0.4, low: Math.min(pInv, nextInv) - 0.4, close: nextInv });

    pA = nextA;
    pB = nextB;
    pInv = nextInv;
  }

  return { candlesA, candlesB, candlesInverse };
}

function createBrokerVerifierStub(
  candlesBySymbol: Record<string, Candle[]>,
  overrides?: Partial<RotationBrokerVerifier>
): RotationBrokerVerifier {
  return {
    verifySymbolEligibility: async ({ symbol }) => ({
      eligible: true,
      reasons: [],
      brokerAvailable: true,
      contractsSupported: true,
      dataFresh: true,
      proposalVerified: true,
      askPrice: 1,
      payout: 1.95,
    }),
    fetchCandlesAsync: async (symbol) => candlesBySymbol[symbol] || [],
    getCachedSymbolCandles: (symbol) =>
      candlesBySymbol[symbol]
        ? { candles: candlesBySymbol[symbol], granularity: 60, updatedAt: Date.now() }
        : null,
    getCachedSymbolTick: (symbol) => {
      const c = candlesBySymbol[symbol];
      if (!c || c.length === 0) return null;
      const last = c[c.length - 1];
      return { epoch: last.epoch, quote: last.close, receivedAt: Date.now() };
    },
    isConnected: () => true,
    isAuthorized: () => true,
    ...overrides,
  };
}

function setupAutonomousTestEnv(allowedSymbols = ['1HZ10V', 'R_25', 'R_50']) {
  const storage = new InMemoryStorage();
  const configManager = new ConfigurationManager(storage);
  configManager.update((prev) => ({
    autonomy: {
      ...prev.autonomy,
      allowedSymbols,
    },
    asire: {
      ...prev.asire,
      enabled: true,
      cooldownSeconds: 60,
      minScoreImprovement: 8,
      confirmationEvaluations: 2,
      maxRotationsPerSession: 4,
      minDataQualityThreshold: 0.45,
      quarantineFailureThreshold: 2,
      quarantineDurationMs: 60_000,
    },
  }));

  const autonomy = new AutonomyManager();
  autonomy.start({
    permissions: {
      allowAutoBot: true,
      allowSubagent: true,
      allowSymbolRotation: true,
      allowAiTriggers: true,
      allowEarlySelling: true,
    },
    reason: 'asire_test_start',
  });

  const memory = new MemoryManager(storage);
  return { storage, configManager, autonomy, memory };
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

function createExecutionBrokerStub(): ExecutionBrokerAdapter {
  return {
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
    requestProposalQuote: async ({ amount, symbol }) => {
      const now = Date.now();
      return {
        proposalId: `prop_${now}`,
        askPrice: amount,
        payout: Number((amount * 1.95).toFixed(2)),
        spot: 1020.5,
        spotTimeMs: now,
        fetchedAt: now,
        expiresAt: now + 15_000,
        dateStartMs: now,
        dateExpiryMs: now + 60_000,
        symbol,
        brokerDurationVerified: true,
      };
    },
    buyProposal: async (proposalId, maxPrice) => ({
      contract_id: 9001,
      buy_price: maxPrice,
      payout: Number((maxPrice * 1.95).toFixed(2)),
      start_time: Math.floor(Date.now() / 1000),
      transaction_id: 7771,
    }),
    sellContract: async (_id, price) => ({ sold_for: price || 1.5, transaction_id: 7772 }),
    subscribeOpenContract: async () => undefined,
    reconcileBrokerState: async () => ({ openPortfolioContracts: [], settledTransactions: [] }),
  };
}

test('K1. Authoritative Rotation Controller enforces allowSymbolRotation, MANUAL_ONLY, allowedSymbols, and stale generation', async () => {
  const { configManager, autonomy, memory, storage } = setupAutonomousTestEnv(['1HZ10V', 'R_25']);
  const c10 = buildTrendCandles(40, { direction: 0, stepPct: 0.001 });
  const c25 = buildTrendCandles(40, { direction: 1, stepPct: 0.003 });
  const c99 = buildTrendCandles(40, { direction: 1, stepPct: 0.003 });

  const engine = new SymbolIntelligenceEngine({
    autonomy,
    configManager,
    memory,
    storage,
    broker: createBrokerVerifierStub({ '1HZ10V': c10, R_25: c25, R_99: c99 }),
  });

  // Disallowed universe check
  const disallowed = await engine.requestAutonomousRotation({
    source: 'GEMINI_AI',
    targetSymbol: 'R_99',
    candlesBySymbol: { '1HZ10V': c10, R_99: c99 },
  });
  assert.equal(disallowed.switched, false);
  assert.equal(disallowed.action, 'BLOCKED');
  assert.equal(engine.getActiveSymbol(), '1HZ10V');

  // Stale generation check
  const staleGen = autonomy.getGeneration() - 1;
  const staleRes = await engine.requestAutonomousRotation({
    source: 'SUBAGENT_MD',
    targetSymbol: 'R_25',
    requestGeneration: staleGen,
    candlesBySymbol: { '1HZ10V': c10, R_25: c25 },
  });
  assert.equal(staleRes.switched, false);
  assert.equal(staleRes.action, 'BLOCKED');

  // allowSymbolRotation = false blocks autonomous rotation
  autonomy.updatePermissions({ allowSymbolRotation: false });
  const permBlocked = await engine.requestAutonomousRotation({
    source: 'SCANNER',
    targetSymbol: 'R_25',
    candlesBySymbol: { '1HZ10V': c10, R_25: c25 },
  });
  assert.equal(permBlocked.switched, false);
  assert.equal(permBlocked.action, 'BLOCKED');

  // MANUAL override works independently of allowSymbolRotation!
  let committedManual = '';
  const manualRes = await engine.requestAutonomousRotation({
    source: 'MANUAL',
    targetSymbol: 'R_25',
    onCommitSymbol: (sym) => {
      committedManual = sym;
    },
  });
  assert.equal(manualRes.switched, true);
  assert.equal(committedManual, 'R_25');
  assert.equal(engine.getActiveSymbol(), 'R_25');

  // MANUAL_ONLY blocks autonomous MARKET_STABILITY switch
  autonomy.updatePermissions({ allowSymbolRotation: true });
  autonomy.stopAll('manual_mode');
  const stoppedRes = await engine.requestAutonomousRotation({
    source: 'MARKET_STABILITY',
    targetSymbol: '1HZ10V',
    candlesBySymbol: { '1HZ10V': c10, R_25: c25 },
  });
  assert.equal(stoppedRes.switched, false);
  assert.equal(stoppedRes.action, 'BLOCKED');
  assert.equal(engine.getActiveSymbol(), 'R_25');
});

test('K2. Synchronized log-return Pearson correlation distinguishes HIGH, negative, and UNKNOWN without prefix guessing', () => {
  const { candlesA, candlesB, candlesInverse } = buildCorrelatedPair(45);

  const highCorr = computeSynchronizedCorrelation({
    symbolA: '1HZ10V',
    candlesA,
    symbolB: 'R_25', // Completely different prefix, yet synchronized correlated series
    candlesB,
    minSamples: 15,
    granularitySec: 60,
  });
  assert.equal(highCorr.status, 'HIGH');
  assert.ok((highCorr.pearsonCorrelation ?? 0) > 0.9);
  assert.ok((highCorr.volatilityAdjustedCorrelation ?? 0) > 0.9);
  assert.ok(highCorr.overlappingSamples >= 40);

  const invCorr = computeSynchronizedCorrelation({
    symbolA: '1HZ10V',
    candlesA,
    symbolB: '1HZ25V', // Same 1HZ prefix, yet strongly inversely correlated!
    candlesB: candlesInverse,
    minSamples: 15,
    granularitySec: 60,
  });
  assert.equal(invCorr.status, 'HIGH'); // abs(r) >= 0.7
  assert.ok((invCorr.pearsonCorrelation ?? 0) < -0.9);

  // Insufficient overlap -> explicit UNKNOWN
  const offsetCandles = candlesB.map((c) => ({ ...c, epoch: c.epoch + 60_000 }));
  const unknownCorr = computeSynchronizedCorrelation({
    symbolA: '1HZ10V',
    candlesA,
    symbolB: 'R_50',
    candlesB: offsetCandles,
    minSamples: 15,
    granularitySec: 60,
  });
  assert.equal(unknownCorr.status, 'UNKNOWN');
  assert.equal(unknownCorr.pearsonCorrelation, null);
  assert.equal(unknownCorr.overlappingSamples, 0);
});

test('K3. Eligibility verification separates broker/data failures from quantitative ranking and quarantines broken symbols', async () => {
  const { configManager, autonomy, memory, storage } = setupAutonomousTestEnv(['1HZ10V', 'R_25', 'R_50', 'R_75']);
  const now = Date.now();
  const freshEndSec = Math.floor(now / 1000);
  const staleEndSec = freshEndSec - 600; // 10 min stale

  const c10 = buildTrendCandles(40, { direction: 1, stepPct: 0.0025, endEpochSec: freshEndSec });
  const c25Stale = buildTrendCandles(40, { direction: 1, stepPct: 0.004, endEpochSec: staleEndSec });
  const c50BrokerDown = buildTrendCandles(40, { direction: 1, stepPct: 0.004, endEpochSec: freshEndSec });

  const engine = new SymbolIntelligenceEngine({
    autonomy,
    configManager,
    memory,
    storage,
    broker: createBrokerVerifierStub(
      { '1HZ10V': c10, R_25: c25Stale, R_50: c50BrokerDown },
      {
        verifySymbolEligibility: async ({ symbol }) => ({
          eligible: symbol !== 'R_50',
          reasons: symbol === 'R_50' ? ['Symbol suspended by Deriv'] : [],
          brokerAvailable: symbol !== 'R_50',
          contractsSupported: true,
          dataFresh: true,
          proposalVerified: symbol !== 'R_50',
        }),
      }
    ),
  });

  const { candidates } = engine.evaluateUniverse({
    activeSymbol: '1HZ10V',
    now,
    feeds: {
      '1HZ10V': { symbol: '1HZ10V', candles: c10, lastTickTimestamp: now, brokerAvailable: true },
      R_25: { symbol: 'R_25', candles: c25Stale, lastTickTimestamp: staleEndSec * 1000, brokerAvailable: true },
      R_50: { symbol: 'R_50', candles: c50BrokerDown, lastTickTimestamp: now, brokerAvailable: false },
      R_75: { symbol: 'R_75', candles: [], brokerAvailable: true },
    },
  });

  const eval25 = candidates.find((c) => c.symbol === 'R_25')!;
  const eval50 = candidates.find((c) => c.symbol === 'R_50')!;
  const eval75 = candidates.find((c) => c.symbol === 'R_75')!;
  assert.equal(eval25.eligible, false);
  assert.equal(eval25.eligibilityStatus, 'STALE_DATA');
  assert.equal(eval50.eligible, false);
  assert.equal(eval50.eligibilityStatus, 'UNAVAILABLE_BROKER');
  assert.equal(eval75.eligible, false);
  assert.equal(eval75.eligibilityStatus, 'DATA_UNAVAILABLE');

  // Repeated broker verification failures trigger quarantine
  const fail1 = await engine.requestAutonomousRotation({
    source: 'SCANNER',
    targetSymbol: 'R_50',
    candlesBySymbol: { '1HZ10V': c10, R_50: c50BrokerDown },
  });
  assert.equal(fail1.switched, false);
  assert.equal(fail1.rolledBack, true);

  const fail2 = await engine.requestAutonomousRotation({
    source: 'SCANNER',
    targetSymbol: 'R_50',
    candlesBySymbol: { '1HZ10V': c10, R_50: c50BrokerDown },
  });
  assert.equal(fail2.switched, false);
  assert.equal(fail2.rolledBack, true);

  const snapAfter = engine.getSnapshot();
  assert.equal(snapAfter.quarantinedSymbols['R_50']?.quarantined, true);

  // Quarantined symbol is blocked immediately before async broker call
  const blockedQ = await engine.requestAutonomousRotation({
    source: 'SCANNER',
    targetSymbol: 'R_50',
    candlesBySymbol: { '1HZ10V': c10, R_50: c50BrokerDown },
  });
  assert.equal(blockedQ.switched, false);
  assert.equal(blockedQ.action, 'BLOCKED');

  // Operator clearing quarantine restores eligibility check
  engine.clearQuarantine('R_50');
  assert.equal(engine.getSnapshot().quarantinedSymbols['R_50'], undefined);
});

test('K4. Hysteresis prevents thrashing on small deltas, enforces confirmation streak, cooldown, and session cap', async () => {
  const { configManager, autonomy, memory, storage } = setupAutonomousTestEnv(['1HZ10V', 'R_25']);
  configManager.update((prev) => ({
    asire: {
      ...prev.asire,
      cooldownSeconds: 120,
      minScoreImprovement: 10,
      confirmationEvaluations: 2,
      maxRotationsPerSession: 1,
    },
  }));

  const engine = new SymbolIntelligenceEngine({ autonomy, configManager, memory, storage });
  const autoSnap = autonomy.getSnapshot();
  const baseCandles = buildTrendCandles(30);
  const baseSnap = engine.buildMarketSnapshot({ symbol: '1HZ10V', candles: baseCandles, lastTickTimestamp: Date.now() });
  const altSnap = engine.buildMarketSnapshot({ symbol: 'R_25', candles: baseCandles, lastTickTimestamp: Date.now() });

  const makeCand = (symbol: string, overallScore: number) => ({
    symbol,
    eligibilityStatus: 'ELIGIBLE' as const,
    eligible: true,
    rejectionReasons: [],
    ranking: {
      signalQuality: 0.8,
      directionalAgreement: 0.8,
      stabilityScore: 0.8,
      volatilitySuitability: 0.8,
      strategyCompatibility: 0.8,
      historicalExpectancy: 0.5,
      recentPerformance: 0.5,
      dataFreshness: 0.95,
      riskExposure: 1,
      regimeCompatibility: 0.8,
      durationCompatibility: 0.8,
      evidenceScore: 0.85,
      historicalSamples: 0,
    },
    overallScore,
    recommendedAction: 'BUY' as const,
    acdeDuration: { value: 3, unit: 'minutes' as const, approved: true },
    quarantine: null,
    snapshot: symbol === '1HZ10V' ? baseSnap : altSnap,
    evaluatedAt: Date.now(),
  });

  // Small delta (+4 < +10) -> STAY
  const smallDelta = engine.evaluateRotationDecision({
    activeSymbol: '1HZ10V',
    candidates: [makeCand('R_25', 74), makeCand('1HZ10V', 70)],
    autonomySnapshot: autoSnap,
  });
  assert.equal(smallDelta.action, 'STAY');
  assert.equal(smallDelta.confirmationsCount, 0);

  // Large delta (+15 >= +10), evaluation 1/2 -> STAY awaiting confirmation
  const firstConfirm = engine.evaluateRotationDecision({
    activeSymbol: '1HZ10V',
    candidates: [makeCand('R_25', 85), makeCand('1HZ10V', 70)],
    autonomySnapshot: autoSnap,
  });
  assert.equal(firstConfirm.action, 'STAY');
  assert.equal(firstConfirm.confirmationsCount, 1);
  assert.ok(firstConfirm.blockers.includes('AWAITING_CONFIRMATION'));

  // Large delta (+15 >= +10), evaluation 2/2 -> SWITCH
  const secondConfirm = engine.evaluateRotationDecision({
    activeSymbol: '1HZ10V',
    candidates: [makeCand('R_25', 85), makeCand('1HZ10V', 70)],
    autonomySnapshot: autoSnap,
  });
  assert.equal(secondConfirm.action, 'SWITCH');
  assert.equal(secondConfirm.targetSymbol, 'R_25');
  assert.equal(secondConfirm.confirmationsCount, 2);

  // Perform 1 switch -> cooldown and maxRotationsPerSession (1/1) block next switch
  const c10 = buildTrendCandles(35);
  const c25 = buildTrendCandles(35);
  engine.setBrokerVerifier(createBrokerVerifierStub({ '1HZ10V': c10, R_25: c25 }));
  const switched = await engine.requestAutonomousRotation({
    source: 'SCANNER',
    targetSymbol: 'R_25',
    candlesBySymbol: { '1HZ10V': c10, R_25: c25 },
  });
  assert.equal(switched.switched, true);
  assert.equal(engine.getSnapshot().rotationsThisSession, 1);

  const capped = await engine.requestAutonomousRotation({
    source: 'SCANNER',
    targetSymbol: '1HZ10V',
    candlesBySymbol: { '1HZ10V': c10, R_25: c25 },
  });
  assert.equal(capped.switched, false);
  assert.equal(capped.action, 'HOLD');
  assert.ok(capped.blockers.includes('MAX_ROTATIONS_REACHED'));
});

test('K5. Safe two-phase transition locks purchases during PENDING_VERIFICATION, aborts cleanly on stopAll, and recomputes ACDE on commit', async () => {
  const { configManager, autonomy, memory, storage } = setupAutonomousTestEnv(['1HZ10V', 'R_25']);
  const c10 = buildTrendCandles(40, { direction: 0 });
  const c25 = buildTrendCandles(40, { direction: 1, stepPct: 0.003 });

  let resolveVerification!: (val: {
    eligible: boolean;
    reasons: string[];
    brokerAvailable: boolean;
    contractsSupported: boolean;
    dataFresh: boolean;
    proposalVerified: boolean;
  }) => void;

  const engine = new SymbolIntelligenceEngine({
    autonomy,
    configManager,
    memory,
    storage,
    broker: createBrokerVerifierStub(
      { '1HZ10V': c10, R_25: c25 },
      {
        verifySymbolEligibility: () =>
          new Promise((resolve) => {
            resolveVerification = resolve;
          }),
      }
    ),
  });

  const controller = new ExecutionController({
    broker: createExecutionBrokerStub(),
    autonomy,
    configManager,
    readinessGuard: new TradeReadinessGuard(),
    reconciler: new PortfolioReconciler(),
    transitionGuard: engine,
  });

  // Start async rotation -> immediately enters PENDING_VERIFICATION
  const rotationPromise = engine.requestAutonomousRotation({
    source: 'SCANNER',
    targetSymbol: 'R_25',
    candlesBySymbol: { '1HZ10V': c10, R_25: c25 },
  });

  assert.equal(engine.getTransitionState(), 'PENDING_VERIFICATION');

  // Purchase must be blocked while transition is PENDING_VERIFICATION
  const blockedBuy = await controller.executePurchase({
    source: 'AUTO_BOT',
    symbol: '1HZ10V',
    contractType: 'CALL',
    stake: 2,
    duration: 3,
    durationUnit: 'minutes',
  });
  assert.equal(blockedBuy.executed, false);
  assert.match(blockedBuy.reason || '', /pending verification/i);

  // Trigger emergency stop mid-verification -> resolves cleanly as rolledBack & preserves 1HZ10V
  autonomy.stopAll('emergency_stop');
  resolveVerification({
    eligible: true,
    reasons: [],
    brokerAvailable: true,
    contractsSupported: true,
    dataFresh: true,
    proposalVerified: true,
  });

  const abortedOutcome = await rotationPromise;
  assert.equal(abortedOutcome.switched, false);
  assert.equal(abortedOutcome.rolledBack, true);
  assert.equal(engine.getActiveSymbol(), '1HZ10V');
  assert.equal(engine.getTransitionState(), 'IDLE');

  // Re-arm and complete a verified switch -> ACDE recomputed on R_25
  autonomy.start({
    permissions: { allowAutoBot: true, allowSymbolRotation: true, allowAiTriggers: true },
    reason: 'resume',
  });
  engine.setBrokerVerifier(createBrokerVerifierStub({ '1HZ10V': c10, R_25: c25 }));

  let committedAcdeSymbol = '';
  const successOutcome = await engine.requestAutonomousRotation({
    source: 'SCANNER',
    targetSymbol: 'R_25',
    candlesBySymbol: { '1HZ10V': c10, R_25: c25 },
    onCommitSymbol: (_sym, ctx) => {
      committedAcdeSymbol = ctx.acdeResult?.recommendation?.symbol || '';
    },
  });
  assert.equal(successOutcome.switched, true);
  assert.equal(engine.getActiveSymbol(), 'R_25');
  assert.equal(committedAcdeSymbol, 'R_25');
  assert.equal(engine.getTransitionState(), 'IDLE');
});

test('K6. Out-of-sample learning & trade settlement attribution track post-rotation performance cleanly', async () => {
  const { configManager, autonomy, memory, storage } = setupAutonomousTestEnv(['1HZ10V', 'R_25']);
  const c10 = buildTrendCandles(40, { direction: 0 });
  const c25 = buildTrendCandles(40, { direction: 1, stepPct: 0.0035 });

  const engine = new SymbolIntelligenceEngine({
    autonomy,
    configManager,
    memory,
    storage,
    broker: createBrokerVerifierStub({ '1HZ10V': c10, R_25: c25 }),
  });

  const switched = await engine.requestAutonomousRotation({
    source: 'SCANNER',
    targetSymbol: 'R_25',
    candlesBySymbol: { '1HZ10V': c10, R_25: c25 },
  });
  assert.equal(switched.switched, true);

  const settledWin: TradeRecord = {
    id: '99001',
    timestamp: new Date(Date.now() + 1000).toISOString(),
    mode: 'DEMO',
    symbol: 'R_25',
    amount: 5,
    decision: 'CALL',
    result: 'WIN',
    profit: 4.75,
    payout: 9.75,
    entryPrice: 1005.2,
    confidence: 0.82,
    agent: 'ASIRE_SCANNER',
    regime: 'UPTREND',
    duration: 3,
    durationUnit: 'minutes',
    actualHoldingMs: 180_000,
  };
  engine.recordTradeSettlement(settledWin);

  const snap = engine.getSnapshot();
  assert.equal(snap.learningSummary.totalRotations, 1);
  assert.equal(snap.learningSummary.followedTrades, 1);
  assert.equal(snap.learningSummary.winRateAfterRotation, 100);
  assert.equal(snap.learningSummary.netPnLAfterRotation, 4.75);

  const recs = engine.getLearningRecords();
  assert.equal(recs[0].tradeId, '99001');
  assert.equal(recs[0].contractOutcome, 'WIN');
});
