import test from 'node:test';
import assert from 'node:assert/strict';

import { AutonomyManager } from '../src/lib/autonomyManager.ts';
import { ConfigurationManager } from '../src/lib/configurationManager.ts';
import { ExecutionBrokerAdapter, ExecutionController } from '../src/lib/executionController.ts';
import { EarlySellingEngine } from '../src/lib/earlySellingEngine.ts';
import { IntelligenceManager } from '../src/lib/intelligenceManager.ts';
import { AIActionRegistry } from '../src/lib/aiActionRegistry.ts';
import { consumeSSEStream } from '../src/lib/sseParser.ts';
import { StrategyEvolutionManager, BASELINE_STRATEGY_PARAMETERS } from '../src/lib/strategyEvolutionManager.ts';
import { MemoryManager } from '../src/lib/memoryManager.ts';
import { SessionManager } from '../src/lib/sessionManager.ts';
import { FirebaseSyncManager, FirestoreSyncTransport } from '../src/lib/firebaseSyncManager.ts';
import { PortfolioReconciler } from '../src/lib/portfolioReconciler.ts';
import { TradeReadinessGuard } from '../src/lib/readinessGuard.ts';
import { BalanceSnapshot, TradeRecord } from '../src/types/trading.ts';

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

function createFreshBalanceSnapshot(amount = 100): BalanceSnapshot {
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

function createBrokerStub(overrides?: Partial<ExecutionBrokerAdapter>): {
  adapter: ExecutionBrokerAdapter;
  buyCalls: number;
  sellCalls: number;
} {
  const state = { buyCalls: 0, sellCalls: 0 };
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
    getBalanceSnapshot: () => createFreshBalanceSnapshot(100),
    areRequiredSubscriptionsActive: () => true,
    requestProposalQuote: async ({ amount, symbol }) => {
      const now = Date.now();
      return {
        proposalId: `prop_${now}`,
        askPrice: amount,
        payout: Number((amount * 1.95).toFixed(2)),
        spot: 1024.5,
        spotTimeMs: now,
        fetchedAt: now,
        expiresAt: now + 15_000,
        dateExpiryMs: now + 60_000,
        symbol,
      };
    },
    buyProposal: async (proposalId, maxPrice) => {
      state.buyCalls += 1;
      return {
        contract_id: `ct_${state.buyCalls}_${proposalId.slice(-4)}`,
        buy_price: maxPrice,
        payout: Number((maxPrice * 1.95).toFixed(2)),
        start_time: Math.floor(Date.now() / 1000),
      };
    },
    sellContract: async (_contractId, minPrice = 0) => {
      state.sellCalls += 1;
      return {
        sold_for: Math.max(minPrice, 1.45),
        transaction_id: `tx_${state.sellCalls}`,
      };
    },
    subscribeOpenContract: async () => {},
    reconcileBrokerState: async () => ({ openPortfolioContracts: [], settledTransactions: [] }),
    ...overrides,
  };

  return {
    adapter,
    get buyCalls() {
      return state.buyCalls;
    },
    get sellCalls() {
      return state.sellCalls;
    },
  };
}

test('1. Unified Execution Authority & Authoritative Global Stop cancel autonomous buys and preserve manual + early selling', async () => {
  const storage = new InMemoryStorage();
  const config = new ConfigurationManager(storage);
  config.update((prev) => ({
    risk: { ...prev.risk, maxDailyTrades: 50, sizingMode: 'FIXED', fixedStake: 2 },
  }));

  const autonomy = new AutonomyManager();
  const reconciler = new PortfolioReconciler();
  const readiness = new TradeReadinessGuard();
  const brokerHarness = createBrokerStub();

  const controller = new ExecutionController({
    broker: brokerHarness.adapter,
    autonomy,
    configManager: config,
    readinessGuard: readiness,
    reconciler,
  });

  // Autonomous sources blocked while autonomy is OFF
  for (const source of ['AUTO_BOT', 'SUBAGENT_MD', 'GEMINI_AI', 'COPILOT'] as const) {
    const res = await controller.executePurchase({
      source,
      symbol: 'R_100',
      contractType: 'CALL',
      stake: 2,
      duration: 5,
      durationUnit: 'ticks',
      confidence: 0.72,
    });
    assert.equal(res.executed, false);
    assert.equal(res.status, 'BLOCKED');
  }
  assert.equal(brokerHarness.buyCalls, 0);

  // Manual trade still works while autonomy is OFF
  const manualRes = await controller.executePurchase({
    source: 'MANUAL',
    symbol: 'R_100',
    contractType: 'CALL',
    stake: 2,
    duration: 5,
    durationUnit: 'ticks',
    confidence: 0.72,
  });
  assert.equal(manualRes.executed, true);
  assert.equal(manualRes.status, 'EXECUTED');
  assert.equal(brokerHarness.buyCalls, 1);

  // Start autonomy & register in-flight AbortController; then invoke stopAll mid-proposal!
  const started = autonomy.start({
    permissions: {
      allowAutoBot: true,
      allowSubagent: true,
      allowAiTriggers: true,
      allowEarlySelling: true,
    },
    reason: 'unit_test_start',
  });
  assert.equal(started.ok, true);
  const { controller: aiAbort } = autonomy.registerAbortController('ai_scan');

  let proposalStarted = false;
  let stopResult: ReturnType<AutonomyManager['stopAll']> | null = null;
  const raceBroker = createBrokerStub({
    requestProposalQuote: async ({ amount, symbol }) => {
      proposalStarted = true;
      stopResult = autonomy.stopAll('emergency_global_stop');
      const now = Date.now();
      return {
        proposalId: 'prop_late',
        askPrice: amount,
        payout: Number((amount * 1.9).toFixed(2)),
        spot: 100,
        spotTimeMs: now,
        fetchedAt: now,
        expiresAt: now + 15_000,
        symbol,
      };
    },
  });
  controller.setBrokerAdapter(raceBroker.adapter);

  const abortedAutoBuy = await controller.executePurchase({
    source: 'AUTO_BOT',
    symbol: 'R_100',
    contractType: 'CALL',
    stake: 2,
    duration: 5,
    durationUnit: 'ticks',
    confidence: 0.75,
    autonomyGeneration: started.generation,
  });

  assert.equal(proposalStarted, true);
  assert.ok(stopResult);
  assert.equal(aiAbort.signal.aborted, true);
  assert.equal(autonomy.getLifecycle(), 'OFF');
  assert.equal(autonomy.getSnapshot().permissions.allowEarlySelling, true);
  assert.equal(abortedAutoBuy.executed, false);
  assert.equal(abortedAutoBuy.status, 'BLOCKED');
  assert.equal(raceBroker.buyCalls, 0);

  // MANUAL_ONLY blocks autonomous start
  autonomy.setExecutionMode('MANUAL_ONLY', 'test_manual_only');
  const blockedStart = autonomy.start({ reason: 'should_block' });
  assert.equal(blockedStart.ok, false);
});

test('2. Purchase timeout enters RECONCILIATION_PENDING, blocks subsequent buys while unresolved, and unlocks once broker confirms clean', async () => {
  const storage = new InMemoryStorage();
  const config = new ConfigurationManager(storage);
  const autonomy = new AutonomyManager();
  const reconciler = new PortfolioReconciler();
  const readiness = new TradeReadinessGuard();

  let finishReconcile!: (val: { openPortfolioContracts: any[]; settledTransactions: any[] }) => void;
  let shouldTimeoutBuy = true;
  const timeoutBroker = createBrokerStub({
    buyProposal: async (proposalId, maxPrice) => {
      if (shouldTimeoutBuy) {
        throw new Error('Request timeout after 15000ms awaiting buy response');
      }
      return {
        contract_id: `ct_recovered_${proposalId.slice(-4)}`,
        buy_price: maxPrice,
        payout: Number((maxPrice * 1.95).toFixed(2)),
        start_time: Math.floor(Date.now() / 1000),
      };
    },
    reconcileBrokerState: () =>
      new Promise((resolve) => {
        finishReconcile = resolve;
      }),
  });

  const controller = new ExecutionController({
    broker: timeoutBroker.adapter,
    autonomy,
    configManager: config,
    readinessGuard: readiness,
    reconciler,
  });

  const timeoutRes = await controller.executePurchase({
    source: 'MANUAL',
    symbol: 'R_100',
    contractType: 'CALL',
    stake: 2,
    duration: 5,
    durationUnit: 'ticks',
  });

  assert.equal(timeoutRes.executed, false);
  assert.equal(timeoutRes.status, 'RECONCILIATION_PENDING');
  assert.equal(timeoutRes.reconciliationPending, true);

  // Second purchase while timeout reconciliation is still unresolved must stay BLOCKED
  const blockedRes = await controller.executePurchase({
    source: 'MANUAL',
    symbol: 'R_100',
    contractType: 'CALL',
    stake: 2,
    duration: 5,
    durationUnit: 'ticks',
  });
  assert.equal(blockedRes.executed, false);
  assert.equal(blockedRes.status, 'BLOCKED');

  // Resolve broker portfolio + statement check cleanly -> trading unlocks
  finishReconcile({ openPortfolioContracts: [], settledTransactions: [] });
  await new Promise((r) => setTimeout(r, 10));
  shouldTimeoutBuy = false;

  const unlockedRes = await controller.executePurchase({
    source: 'MANUAL',
    symbol: 'R_100',
    contractType: 'CALL',
    stake: 2,
    duration: 5,
    durationUnit: 'ticks',
  });
  assert.equal(unlockedRes.executed, true);
  assert.equal(unlockedRes.status, 'EXECUTED');
});

test('3. EarlySellingEngine & ExecutionController.executeSell enforce is_valid_to_sell, duplicate-sell lock, and profit policies', async () => {
  const engine = new EarlySellingEngine();
  const futureExpiry = Math.floor(Date.now() / 1000) + 120;

  const baseTrade: TradeRecord = {
    id: 'ct_1001',
    contract_id: 'ct_1001',
    timestamp: new Date().toISOString(),
    mode: 'DEMO',
    symbol: 'R_100',
    amount: 10,
    decision: 'CALL',
    result: 'PENDING',
    profit: 6.5,
    bidPrice: 16.5,
    isValidToSell: false,
    dateExpiry: futureExpiry,
    confidence: 0.72,
    agent: 'TestAgent',
    regime: 'TRENDING_BULL',
    duration: 120,
    entryPrice: 1000,
  };

  // isValidToSell = false cannot trigger SELL
  const invalidSellEval = engine.evaluateContract({
    trade: baseTrade,
    currentSpot: 1010,
  });
  assert.equal(invalidSellEval.evaluation.shouldSellNow, false);
  assert.equal(invalidSellEval.evaluation.decision, 'MONITOR');

  // Profit target hit with isValidToSell = true -> SELL
  const targetEval = engine.evaluateContract({
    trade: { ...baseTrade, isValidToSell: true },
    currentSpot: 1010,
  });
  assert.equal(targetEval.evaluation.shouldSellNow, true);
  assert.equal(targetEval.evaluation.decision, 'SELL');
  assert.equal(targetEval.evaluation.policyTriggered, 'PROFIT_TARGET');

  // Profit protection pullback: peak +50%, current +20% (below 30% floor with 40% drawdown allowance)
  const protectionEval = engine.evaluateContract({
    trade: {
      ...baseTrade,
      isValidToSell: true,
      peakProfit: 5.0, // +50%
      profit: 2.0, // +20%
      bidPrice: 12.0,
    },
    currentSpot: 1004,
  });
  assert.equal(protectionEval.evaluation.shouldSellNow, true);
  assert.equal(protectionEval.evaluation.policyTriggered, 'PROFIT_PROTECTION');

  // ExecutionController.executeSell rejects isValidToSell=false & deduplicates in-flight sells
  const storage = new InMemoryStorage();
  const config = new ConfigurationManager(storage);
  const autonomy = new AutonomyManager();
  let releaseSell!: () => void;
  const sellGate = new Promise<void>((resolve) => {
    releaseSell = resolve;
  });

  const brokerHarness = createBrokerStub({
    sellContract: async () => {
      await sellGate;
      return { sold_for: 16.4, transaction_id: 'tx_early_1' };
    },
  });
  const controller = new ExecutionController({
    broker: brokerHarness.adapter,
    autonomy,
    configManager: config,
    readinessGuard: new TradeReadinessGuard(),
    reconciler: new PortfolioReconciler(),
  });

  const rejectedNotValid = await controller.executeSell({
    source: 'EARLY_SELLING',
    trade: baseTrade, // isValidToSell is false
    reason: 'Attempt invalid sell',
  });
  assert.equal(rejectedNotValid.sold, false);
  assert.equal(rejectedNotValid.status, 'REJECTED');

  const firstSellPromise = controller.executeSell({
    source: 'EARLY_SELLING',
    trade: { ...baseTrade, isValidToSell: true },
    reason: 'Profit target captured',
    policyTriggered: 'PROFIT_TARGET',
  });
  const duplicateSellRes = await controller.executeSell({
    source: 'EARLY_SELLING',
    trade: { ...baseTrade, isValidToSell: true },
    reason: 'Duplicate click',
  });
  assert.equal(duplicateSellRes.sold, false);
  assert.equal(duplicateSellRes.status, 'IN_FLIGHT');

  releaseSell();
  const firstSellRes = await firstSellPromise;
  assert.equal(firstSellRes.sold, true);
  assert.equal(firstSellRes.status, 'SOLD');
  assert.equal(firstSellRes.profit, 6.4);
  assert.equal(controller.isSellPending('ct_1001'), false);
});

test('4. AIActionRegistry, SSEStreamParser split-frame buffering, and IntelligenceManager freshness validation', async () => {
  // AIActionRegistry
  const registry = new AIActionRegistry();
  const missing = await registry.dispatch({ action: 'rotate_symbol', source: 'COPILOT' });
  assert.equal(missing.status, 'UNAVAILABLE');

  registry.registerHandler('rotate_symbol', async (args) => ({
    status: 'SUCCESS',
    action: 'rotate_symbol',
    message: `Rotated to ${args.symbol}`,
    data: { symbol: args.symbol },
    timestamp: Date.now(),
  }));
  const ok = await registry.dispatch({
    action: 'rotate_symbol',
    args: { symbol: 'R_75' },
    source: 'GEMINI_AI',
  });
  assert.equal(ok.status, 'SUCCESS');
  assert.equal(ok.data?.symbol, 'R_75');

  // SSEStreamParser: split UTF-8 + split JSON + multi-event single chunk + trailing EOF
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode('event: status\ndata: {"phase":"scan"}\n\ndata: {"delta":"Hel'),
    encoder.encode('lo "}\n\ndata: {"delta":"world"}\n\ndata: {"final":{"direction":"BUY"}}'), // intentionally no trailing \n\n
  ];
  let idx = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(chunks[idx++]);
      } else {
        controller.close();
      }
    },
  });
  const events: any[] = [];
  await consumeSSEStream(stream.getReader(), (evt) => {
    events.push(evt);
  });
  assert.equal(events.length, 4);
  assert.equal(events[0].eventType, 'status');
  assert.equal(events[0].json.phase, 'scan');
  assert.equal(events[1].json.delta, 'Hello ');
  assert.equal(events[2].json.delta, 'world');
  assert.equal(events[3].json.final.direction, 'BUY');

  // IntelligenceManager context validation
  const storage = new InMemoryStorage();
  const config = new ConfigurationManager(storage);
  const autonomy = new AutonomyManager();
  const intel = new IntelligenceManager({ autonomy, configManager: config });

  const { context } = intel.beginPredictionRequest({
    symbol: 'R_100',
    granularity: 60,
    strategyVersion: 'v4.1.0-baseline',
    ttlMs: 10_000,
  });

  // Symbol mismatch rejected
  const symMismatch = intel.validatePredictionContext(context, {
    symbol: 'R_50',
    granularity: 60,
    strategyVersion: 'v4.1.0-baseline',
    autonomyGeneration: context.autonomyGeneration,
    configRevision: context.configRevision,
  });
  assert.equal(symMismatch.valid, false);

  // Stop generation mismatch rejected
  const stopInfo = autonomy.stopAll('invalidate_intel');
  const genMismatch = intel.validatePredictionContext(context, {
    symbol: 'R_100',
    granularity: 60,
    strategyVersion: 'v4.1.0-baseline',
    autonomyGeneration: stopInfo.nextGeneration,
    configRevision: context.configRevision,
  });
  assert.equal(genMismatch.valid, false);

  // Expired rejected
  const expiredCheck = intel.validatePredictionContext(context, {
    symbol: 'R_100',
    granularity: 60,
    strategyVersion: 'v4.1.0-baseline',
    autonomyGeneration: context.autonomyGeneration,
    configRevision: context.configRevision,
    now: context.expiresAt + 1,
  });
  assert.equal(expiredCheck.valid, false);
});

test('5. StrategyEvolutionManager blocks Martingale escalation, promotes safe candidates, and auto-rolls back on degradation', () => {
  const storage = new InMemoryStorage();
  const evo = new StrategyEvolutionManager(storage);

  // Build baseline metrics with 5 winning trades (100% WR)
  for (let i = 0; i < 5; i += 1) {
    evo.recordCompletedTrade({
      id: `win_${i}`,
      timestamp: new Date().toISOString(),
      mode: 'DEMO',
      symbol: 'R_100',
      amount: 1,
      decision: 'CALL',
      result: 'WIN',
      profit: 0.95,
      confidence: 0.72,
      regime: 'TRENDING_BULL',
      agent: 'TestAgent',
      duration: 5,
      entryPrice: 1000,
      strategyVersion: 'v4.1.0-baseline',
    });
  }
  const baseMetrics = evo.getActiveVersion().metrics;
  assert.equal(baseMetrics.tradesCount, 5);
  assert.equal(baseMetrics.winRate, 1);

  // Reject loss-recovery Martingale escalation
  const unsafeProposal = evo.validateCandidateProposal({
    proposedParameters: { ...BASELINE_STRATEGY_PARAMETERS },
    rationale: 'Double after loss',
    closedTrades: [],
    lossRecoveryEscalationRequested: true,
  });
  assert.equal(unsafeProposal.riskCheckPassed, false);
  assert.ok(unsafeProposal.riskRejectionReasons.length >= 1);

  // Approve and promote safe candidate
  const safeProposal = evo.validateCandidateProposal({
    proposedParameters: {
      ...BASELINE_STRATEGY_PARAMETERS,
      minConfidence: 0.52,
    },
    rationale: 'Raise min confidence to 52%',
    closedTrades: [],
  });
  assert.equal(safeProposal.riskCheckPassed, true);

  const promoted = evo.promoteProposal(safeProposal.id);
  assert.equal(promoted.ok, true);
  assert.equal(evo.getActiveVersion().version, safeProposal.candidateVersion);
  assert.equal(evo.getActiveVersion().parentVersion, 'v4.1.0-baseline');

  // Record 5 consecutive losses on new candidate -> triggers automatic degradation rollback
  let rolledBack = false;
  for (let i = 0; i < 5; i += 1) {
    const res = evo.recordCompletedTrade({
      id: `loss_${i}`,
      timestamp: new Date().toISOString(),
      mode: 'DEMO',
      symbol: 'R_100',
      amount: 1,
      decision: 'CALL',
      result: 'LOSS',
      profit: -1,
      confidence: 0.6,
      regime: 'VOLATILE',
      agent: 'TestAgent',
      duration: 5,
      entryPrice: 1000,
      strategyVersion: safeProposal.candidateVersion,
    });
    if (res.rollbackTriggered) {
      rolledBack = true;
    }
  }
  assert.equal(rolledBack, true);
  assert.equal(evo.getActiveVersion().version, 'v4.1.0-baseline');
});

test('6. SessionManager & MemoryManager preserve security hygiene, trust hierarchy, and non-auto-executing startup recovery', () => {
  const storage = new InMemoryStorage();
  const sessions = new SessionManager(storage);

  const snapshot = sessions.saveSession({
    accountRef: {
      accountId: 'VRTC9991',
      loginId: 'VRTC9991',
      accountType: 'demo',
      currency: 'USD',
      // inject secret via cast to verify sanitizer strips it
      ...({ apiToken: 'SECRET_SHOULD_STRIP', pat: 'PAT_SHOULD_STRIP' } as any),
    },
    symbol: 'R_100',
    granularity: 60,
    activeStrategyVersion: 'v4.1.0-baseline',
    executionMode: 'SUPERVISED_AUTO',
    autonomyLifecycle: 'ACTIVE',
    autonomyPermissions: {
      allowAutoBot: true,
      allowSubagent: true,
      allowAiTriggers: true,
      allowEarlySelling: true,
      allowSymbolRotation: true,
    },
    openTrades: [
      {
        id: 'ct_open_1',
        contract_id: 'ct_open_1',
        timestamp: new Date().toISOString(),
        mode: 'DEMO',
        symbol: 'R_100',
        amount: 2,
        decision: 'CALL',
        result: 'PENDING',
        profit: 0,
        confidence: 0.7,
        agent: 'TestAgent',
        regime: 'NEUTRAL',
        duration: 5,
        entryPrice: 1000,
      },
    ],
    pendingIntentIds: ['intent_unresolved_1'],
  });

  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes('SECRET_SHOULD_STRIP'), false);
  assert.equal(serialized.includes('PAT_SHOULD_STRIP'), false);

  const recovery = sessions.buildStartupRecoveryPlan();
  assert.equal(recovery.hasRecoverableSession, true);
  assert.equal(recovery.resumeOpenContractMonitoringCount, 1);
  assert.equal(recovery.requiresReconciliation, true);
  assert.equal(recovery.requiresExplicitAutonomyResume, true);

  // MemoryManager trust hierarchy: AI_OBSERVATION cannot overwrite VERIFIED_FACT or USER_DECISION
  const memory = new MemoryManager(storage);
  const verifiedRes = memory.upsert({
    category: 'OPERATIONAL',
    trustSource: 'VERIFIED_FACT',
    key: 'r100_max_loss_cap',
    title: 'Daily Loss Limit',
    summary: 'User hard daily loss limit is $20.',
    symbol: 'R_100',
    relevanceScore: 95,
  });
  assert.equal(verifiedRes.stored, true);

  const overwriteAttempt = memory.upsert({
    category: 'OPERATIONAL',
    trustSource: 'AI_OBSERVATION',
    key: 'r100_max_loss_cap',
    title: 'Relaxed Loss Limit',
    summary: 'AI thinks daily loss limit can be $200.',
    symbol: 'R_100',
  });
  assert.equal(overwriteAttempt.stored, false);
  assert.ok(overwriteAttempt.reason?.includes('Trust boundary'));

  const compact = memory.selectCompactContext({ symbol: 'R_100', maxItems: 3 });
  assert.equal(compact.length, 1);
  assert.equal(compact[0].trust, 'VERIFIED_FACT');
});

test('7. FirebaseSyncManager offline queue, conflict resolution, failure marking, and secret stripping', async () => {
  const storage = new InMemoryStorage();
  const remoteDocs = new Map<string, Record<string, any>>();
  let shouldFailWrites = false;

  const transport: FirestoreSyncTransport = {
    readDoc: async (segments) => remoteDocs.get(segments.join('/')) ?? null,
    writeDoc: async (segments, data) => {
      if (shouldFailWrites) {
        throw new Error('Simulated network failure');
      }
      remoteDocs.set(segments.join('/'), data);
    },
  };

  const syncMgr = new FirebaseSyncManager({
    storage,
    transport,
    isOnline: false,
  });

  // Queue while offline with a secret field attached -> sanitized before persisting
  const queuedOffline = await syncMgr.enqueueSync({
    uid: 'user_123',
    collectionName: 'sessions',
    docId: 'latest',
    version: 2,
    updatedAt: 2000,
    data: {
      symbol: 'R_100',
      apiToken: 'deriv_secret_should_be_stripped',
    },
  });
  assert.equal(queuedOffline.queued, true);
  assert.equal(queuedOffline.status, 'PENDING_SYNC');
  assert.equal('apiToken' in queuedOffline.sanitizedPayload, false);

  // Reconnect with write failure -> marks SYNC_FAILED rather than dropping
  shouldFailWrites = true;
  await syncMgr.setOnline(true);
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(syncMgr.getStatus().status, 'SYNC_FAILED');
  assert.equal(syncMgr.getStatus().pendingCount, 1);

  // Next retry backoff: verify newer remote version skips overwrite idempotently when recovered
  shouldFailWrites = false;
  remoteDocs.set('users/user_123/sessions/latest', {
    symbol: 'R_75',
    version: 5,
    updatedAt: 5000,
  });
  await syncMgr.flushQueue(Date.now() + 60_000);
  assert.equal(syncMgr.getStatus().status, 'SYNCED');
  assert.equal(syncMgr.getStatus().pendingCount, 0);
  // Newer remote version preserved
  assert.equal(remoteDocs.get('users/user_123/sessions/latest')?.symbol, 'R_75');
});

test('8. ConfigurationManager legacy migration & Small-Balance Verification ($3 / $5 / $10 / $50)', () => {
  const storage = new InMemoryStorage();
  storage.setItem(
    'terminal_settings_v4',
    JSON.stringify({
      executionMode: 'SUPERVISED_AUTO',
      general: { defaultStake: 1.5, confirmTradeBeforeExecute: true, soundEffects: true, voiceNarration: false },
      risk: {
        sizingMode: 'KELLY_HALF',
        maxStakePercent: 0.05,
        minStake: 0.35,
        maxDailyLoss: 25,
        maxDailyTrades: 30,
        maxConsecutiveLosses: 4,
        maxSessionDrawdownPercent: 8,
        maxOpenExposure: 20,
        maxConcurrentContracts: 2,
        strictDurationCompliance: true,
      },
    })
  );

  const config = new ConfigurationManager(storage);
  const snap = config.getSnapshot();
  assert.equal(snap.migratedFromLegacy, true);
  assert.equal(snap.risk.sizingMode, 'KELLY_HALF');
  assert.equal(snap.risk.minStake, 0.35);

  // With 5% maxStakePercent ($0.15 on $3, $0.25 on $5) -> below $0.35 Deriv minimum floor!
  const check3 = config.evaluateSmallBalanceStake({
    balance: 3,
    requestedStake: 1,
    sizingMode: 'KELLY_HALF',
    winRate: 0.64,
  });
  assert.equal(check3.allowed, false);
  assert.equal(check3.blockingSetting, 'risk.maxStakePercent');

  const check5 = config.evaluateSmallBalanceStake({
    balance: 5,
    requestedStake: 1,
    sizingMode: 'EQUITY_PERCENT',
  });
  assert.equal(check5.allowed, false);
  assert.equal(check5.blockingSetting, 'risk.maxStakePercent');

  // At $10 with 5% cap ($0.50 >= $0.35 Deriv floor) and positive Kelly edge -> allowed!
  const check10 = config.evaluateSmallBalanceStake({
    balance: 10,
    requestedStake: 1,
    sizingMode: 'KELLY_HALF',
    winRate: 0.65,
    confidence: 0.8,
  });
  assert.equal(check10.allowed, true);
  assert.ok(check10.effectiveStake >= 0.35 && check10.effectiveStake <= 0.5);

  // At $50 -> allowed under FIXED, EQUITY_PERCENT, KELLY_HALF, KELLY_QUARTER
  for (const mode of ['FIXED', 'EQUITY_PERCENT', 'KELLY_HALF', 'KELLY_QUARTER'] as const) {
    const res50 = config.evaluateSmallBalanceStake({
      balance: 50,
      requestedStake: 1,
      sizingMode: mode,
      winRate: 0.65,
      confidence: 0.8,
    });
    assert.equal(res50.allowed, true, `Expected $50 balance to be allowed under ${mode}: ${res50.reason}`);
    assert.ok(res50.effectiveStake >= 0.35);
  }
});
