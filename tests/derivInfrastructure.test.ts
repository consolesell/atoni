import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DerivServerAuthVault,
  computeS256CodeChallenge,
  redactSecrets,
} from '../serverDerivOAuth.ts';
import {
  isDemoAccount,
  maskSecret,
  normalizeDiscoveredAccounts,
  selectDerivAccount,
} from '../src/lib/derivAccounts.ts';
import { BalanceManager } from '../src/lib/balanceManager.ts';
import { PortfolioReconciler } from '../src/lib/portfolioReconciler.ts';
import { calculateDynamicStake, validateTradeRiskGate } from '../src/lib/riskEngine.ts';
import { TradeReadinessGuard, TradeReadinessInput } from '../src/lib/readinessGuard.ts';
import { SBAgent } from '../src/lib/sbagentAutonomyEngine.ts';
import { calculateDerivRealtimePnL } from '../src/lib/derivPnL.ts';
import { DerivWebSocketClient, WebSocketLike } from '../src/lib/derivWS.ts';

class MockWebSocket implements WebSocketLike {
  public url: string;
  public readyState = 0; // CONNECTING
  public sentPayloads: any[] = [];
  public closedCount = 0;
  public onopen: ((ev: any) => any) | null = null;
  public onmessage: ((ev: any) => any) | null = null;
  public onerror: ((ev: any) => any) | null = null;
  public onclose: ((ev: any) => any) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  public send(data: string): void {
    this.sentPayloads.push(JSON.parse(data));
  }

  public close(code?: number, reason?: string): void {
    this.readyState = 3; // CLOSED
    this.closedCount++;
    if (this.onclose) {
      this.onclose({ code: code ?? 1000, reason: reason ?? '' });
    }
  }

  public triggerOpen(): void {
    this.readyState = 1; // OPEN
    if (this.onopen) this.onopen({});
  }

  public triggerMessage(payload: any): void {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(payload) });
    }
  }

  public triggerClose(code = 1006, reason = 'closed'): void {
    this.readyState = 3;
    if (this.onclose) this.onclose({ code, reason });
  }
}

test('1. PKCE S256 challenge, cryptographic state, and single-use replay rejection', async () => {
  let capturedTokenBody = '';
  const mockFetch = (async (url: string, init?: RequestInit) => {
    if (url.includes('/oauth2/token')) {
      capturedTokenBody = String(init?.body || '');
      return new Response(
        JSON.stringify({
          access_token: 'oauth_access_token_secret_123',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/trading/v1/options/accounts')) {
      return new Response(
        JSON.stringify({
          data: [
            { account_id: 'VRTC1001', account_type: 'demo', currency: 'USD', balance: 10000 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  const vault = new DerivServerAuthVault({ signingSecret: 'test-secret', fetchImpl: mockFetch });
  const req = vault.createPkceAuthRequest({
    clientId: '33zsnNh6YJ2HWm30oZZJR',
    redirectUri: 'https://deriv-ai-trader-pro.ai.studio/',
    scope: 'read trade',
  });

  const parsedUrl = new URL(req.url);
  assert.equal(parsedUrl.origin + parsedUrl.pathname, 'https://auth.deriv.com/oauth2/auth');
  assert.equal(parsedUrl.searchParams.get('response_type'), 'code');
  assert.equal(parsedUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(parsedUrl.searchParams.get('state'), req.state);
  assert.ok((parsedUrl.searchParams.get('code_challenge') || '').length >= 43);

  // Wrong state rejected
  const badStateRes = await vault.exchangeAuthorizationCode({
    code: 'auth_code_1',
    state: 'forged_state',
  });
  assert.equal(badStateRes.ok, false);
  if (!badStateRes.ok) {
    assert.equal(badStateRes.code, 'INVALID_OR_EXPIRED_STATE');
  }

  // Valid exchange succeeds and sends code_verifier matching S256 challenge
  const okRes = await vault.exchangeAuthorizationCode({
    code: 'auth_code_1',
    state: req.state,
  });
  assert.equal(okRes.ok, true);
  const bodyParams = new URLSearchParams(capturedTokenBody);
  const verifier = bodyParams.get('code_verifier') || '';
  assert.ok(verifier.length >= 32);
  assert.equal(computeS256CodeChallenge(verifier), parsedUrl.searchParams.get('code_challenge'));

  // Replay with same state must be rejected (single-use)
  const replayRes = await vault.exchangeAuthorizationCode({
    code: 'auth_code_1',
    state: req.state,
  });
  assert.equal(replayRes.ok, false);
});

test('2. Token expiry -> AUTH_REQUIRED and stops WS reconnect loop', async () => {
  const mockFetch = (async (url: string) => {
    if (url.includes('/trading/v1/options/accounts')) {
      return new Response(
        JSON.stringify({
          data: [{ account_id: 'VRTC2001', account_type: 'demo', currency: 'USD', balance: 5000 }],
        }),
        { status: 200 }
      );
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  const vault = new DerivServerAuthVault({ signingSecret: 'test-secret', fetchImpl: mockFetch });
  const now = 1_700_000_000_000;
  const pat = await vault.createPatSession({
    token: 'pat_test_secret_token',
    appId: '33zsnNh6YJ2HWm30oZZJR',
    now,
  });
  assert.equal(pat.ok, true);
  if (pat.ok) {
    pat.session.expiresAt = now + 1000;
    assert.equal(vault.getSession(pat.session.sid, now + 500).expired, false);
    const expiredLookup = vault.getSession(pat.session.sid, now + 2000);
    assert.equal(expiredLookup.expired, true);
    assert.equal(expiredLookup.session, null);
  }

  // WS client receiving InvalidToken transitions to AUTH_REQUIRED and refuses reconnect
  const sockets: MockWebSocket[] = [];
  const balMgr = new BalanceManager();
  const wsClient = new DerivWebSocketClient({
    wsFactory: (u) => {
      const s = new MockWebSocket(u);
      sockets.push(s);
      return s;
    },
    balanceManager: balMgr,
    portfolioReconciler: new PortfolioReconciler(),
  });

  wsClient.connectWithLegacyToken('legacy_tok_abc12345', '1089');
  assert.equal(sockets.length, 1);
  sockets[0].triggerOpen();
  sockets[0].triggerMessage({
    msg_type: 'authorize',
    error: { code: 'InvalidToken', message: 'Token expired' },
  });

  assert.equal(wsClient.getConnectionState(), 'AUTH_REQUIRED');
  assert.equal(wsClient.isTokenExpired(), true);
  assert.equal(wsClient.isAuthorized(), false);

  // Calling reconnect() must NOT open another socket when AUTH_REQUIRED
  wsClient.reconnect();
  assert.equal(sockets.length, 1);
});

test('3. Account normalization and deterministic selection never silently flips REAL -> DEMO', () => {
  const raw = [
    { account_id: 'CR99999', account_type: 'real', currency: 'USD', balance: '250.50', token: 'secret_t1' },
    { account_id: 'VRTC88888', account_type: 'demo', currency: 'USD', balance: 10000, token: 'secret_t2' },
  ];

  const sanitized = normalizeDiscoveredAccounts(raw, { sanitizeForClient: true });
  assert.equal(sanitized.length, 2);
  assert.equal(sanitized[0].token, undefined);
  assert.equal(sanitized[0].isProvisionalBalance, true);
  assert.equal(isDemoAccount(sanitized[0]), false);
  assert.equal(isDemoAccount(sanitized[1]), true);

  // Saved REAL account must be restored instead of flipping to DEMO
  const savedReal = selectDerivAccount(sanitized, 'CR99999');
  assert.equal(savedReal.reason, 'SAVED_ACCOUNT_RESTORED');
  assert.equal(savedReal.selectedAccount?.account, 'CR99999');

  // Unsaved defaults to first DEMO account
  const firstDemo = selectDerivAccount(sanitized, null);
  assert.equal(firstDemo.reason, 'FIRST_DEMO_SELECTED');
  assert.equal(firstDemo.selectedAccount?.account, 'VRTC88888');

  // When only REAL accounts exist, selects first available
  const realOnly = selectDerivAccount([sanitized[0]], null);
  assert.equal(realOnly.reason, 'FIRST_AVAILABLE_SELECTED');
  assert.equal(realOnly.selectedAccount?.account, 'CR99999');
});

test('4 & 5. Connection state lifecycle & stale generation event rejection', async () => {
  const sockets: MockWebSocket[] = [];
  const balMgr = new BalanceManager();
  const observedStates: string[] = [];

  const wsClient = new DerivWebSocketClient({
    wsFactory: (u) => {
      const s = new MockWebSocket(u);
      sockets.push(s);
      return s;
    },
    balanceManager: balMgr,
    portfolioReconciler: new PortfolioReconciler(),
  });

  wsClient.subscribe((m) => {
    if (m.msg_type === 'connection_state') observedStates.push(m.state);
  });

  assert.equal(wsClient.getConnectionState(), 'OFFLINE');
  wsClient.connectWithLegacyToken('tok_gen_1_abcdef', '1089');
  assert.equal(wsClient.getConnectionState(), 'CONNECTING');
  const sock1 = sockets[0];
  sock1.triggerOpen();
  sock1.triggerMessage({
    msg_type: 'authorize',
    authorize: { loginid: 'VRTC111', currency: 'USD', is_virtual: 1, balance: 500 },
  });
  assert.equal(wsClient.getConnectionState(), 'ONLINE');

  // Rotate session generation via reconnect()
  wsClient.reconnect();
  const sock2 = sockets[1];
  assert.ok(sock2);

  // Late message & close from stale socket 1 must be completely ignored
  sock1.triggerMessage({
    msg_type: 'balance',
    balance: { balance: 999999, currency: 'USD', loginid: 'VRTC111' },
  });
  sock1.triggerClose(1006, 'stale socket closed');
  assert.notEqual(balMgr.getSnapshot().amount, 999999);

  // Socket 2 authenticates cleanly and abnormal close triggers RECONNECTING
  sock2.triggerOpen();
  sock2.triggerMessage({
    msg_type: 'authorize',
    authorize: { loginid: 'VRTC111', currency: 'USD', is_virtual: 1, balance: 500 },
  });
  sock2.triggerClose(1006, 'network drop');
  assert.equal(wsClient.getConnectionState(), 'RECONNECTING');

  // Clean close with 4001 transitions to AUTH_REQUIRED
  assert.ok(observedStates.includes('CONNECTING'));
  assert.ok(observedStates.includes('ONLINE'));
  assert.ok(observedStates.includes('RECONNECTING'));

  await wsClient.logout();
});

test('6 & 7. req_id correlation, request timeout rejection, and client rate budgeting', async () => {
  const sockets: MockWebSocket[] = [];
  const wsClient = new DerivWebSocketClient({
    wsFactory: (u) => {
      const s = new MockWebSocket(u);
      sockets.push(s);
      return s;
    },
    balanceManager: new BalanceManager(),
    portfolioReconciler: new PortfolioReconciler(),
    requestTimeoutMs: 40,
  });

  wsClient.connectWithLegacyToken('tok_reqid_123456', '1089');
  const sock = sockets[0];
  sock.triggerOpen();

  // Correlated request resolves when matching req_id arrives
  const p1 = wsClient.request<{ portfolio: { contracts: any[] } }>({ portfolio: 1 });
  const sentReq = sock.sentPayloads.find((p) => p.portfolio === 1);
  assert.ok(typeof sentReq?.req_id === 'number');
  sock.triggerMessage({ req_id: sentReq.req_id, msg_type: 'portfolio', portfolio: { contracts: [{ contract_id: 42 }] } });
  const res1 = await p1;
  assert.equal(res1.portfolio.contracts[0].contract_id, 42);

  // Unanswered request rejects after timeout
  await assert.rejects(
    wsClient.request({ statement: 1 }),
    /timed out/i
  );

  // Rate budget check (trading category allows 8 per 5000ms)
  const t0 = 100_000;
  for (let i = 0; i < 8; i++) {
    assert.equal(wsClient.checkRateLimit('trading', t0 + i * 10).allowed, true);
  }
  const blocked = wsClient.checkRateLimit('trading', t0 + 100);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);
  assert.equal(wsClient.checkRateLimit('trading', t0 + 5001).allowed, true);

  await wsClient.logout();
});

test('8 & 9. OTP WS flow connects WITHOUT blind authorize and maintains duplicate-free subscription registry', async () => {
  const sockets: MockWebSocket[] = [];
  const mockFetch = (async (url: string) => {
    if (url.includes('/otp')) {
      return new Response(
        JSON.stringify({ ok: true, wsUrl: 'wss://api.derivws.com/trading/v1/options/ws/otp?token=otp_xyz' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  const balMgr = new BalanceManager();
  const wsClient = new DerivWebSocketClient({
    wsFactory: (u) => {
      const s = new MockWebSocket(u);
      sockets.push(s);
      return s;
    },
    fetchImpl: mockFetch,
    balanceManager: balMgr,
    portfolioReconciler: new PortfolioReconciler(),
  });

  const sessionRes = await wsClient.completeServerSession({
    authMethod: 'oauth2_pkce',
    appId: '33zsnNh6YJ2HWm30oZZJR',
    accounts: [{ account: 'VRTC555', account_id: 'VRTC555', account_type: 'demo', currency: 'USD', balance: 10000 }],
    selectedAccountId: 'VRTC555',
  });
  assert.equal(sessionRes.ok, true);
  assert.equal(sockets.length, 1);
  assert.ok(sockets[0].url.includes('/options/ws/otp'));

  const sock1 = sockets[0];
  sock1.triggerOpen();

  // MUST NOT send blind post-connect { authorize } on OTP socket
  const hasAuthorizePayload = sock1.sentPayloads.some((p) => 'authorize' in p);
  assert.equal(hasAuthorizePayload, false);

  // Must subscribe to balance, transaction, and proposal_open_contract
  assert.equal(sock1.sentPayloads.filter((p) => p.balance === 1 && p.subscribe === 1).length, 1);
  assert.equal(sock1.sentPayloads.filter((p) => p.transaction === 1 && p.subscribe === 1).length, 1);
  assert.equal(sock1.sentPayloads.filter((p) => p.proposal_open_contract === 1 && p.subscribe === 1).length, 1);

  // Duplicate ensureSubscription while active must NOT send another payload
  const countBefore = sock1.sentPayloads.length;
  wsClient.ensureSubscription('balance', { balance: 1, subscribe: 1 });
  assert.equal(sock1.sentPayloads.length, countBefore);

  // Track subscription ID and test forgetSubscription
  sock1.triggerMessage({ msg_type: 'balance', balance: { balance: 9876.54, currency: 'USD', loginid: 'VRTC555' }, subscription: { id: 'sub_bal_1' } });
  wsClient.ensureSubscription('ticks:1HZ10V', { ticks: '1HZ10V', subscribe: 1 });
  sock1.triggerMessage({ msg_type: 'tick', tick: { symbol: '1HZ10V', quote: 100 }, subscription: { id: 'sub_tick_1' } });
  wsClient.forgetSubscription('ticks:1HZ10V');
  assert.ok(sock1.sentPayloads.some((p) => p.forget === 'sub_tick_1'));
  assert.equal(wsClient.getRegisteredSubscriptions().some((s) => s.key === 'ticks:1HZ10V'), false);

  // Reconnect restores registered subscriptions cleanly once per logical key
  wsClient.reconnect();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(sockets.length, 2);
  const sock2 = sockets[1];
  sock2.triggerOpen();
  assert.equal(sock2.sentPayloads.filter((p) => p.balance === 1 && p.subscribe === 1).length, 1);
  assert.equal(sock2.sentPayloads.some((p) => 'authorize' in p), false);

  await wsClient.logout();
});

test('10. BalanceManager provisional SYNCING vs LIVE, STALE threshold, and cross-account isolation', () => {
  const mgr = new BalanceManager(30_000);
  const t0 = 1_000_000;

  // Discovery seeds provisional SYNCING balance
  mgr.applyDiscoveryAccount(
    { account: 'CR100', account_id: 'CR100', account_type: 'real', currency: 'USD', balance: 500 },
    t0
  );
  assert.equal(mgr.getSnapshot(t0).freshness, 'SYNCING');
  assert.equal(mgr.isFreshForTrading(t0), false);

  // Cross-account update for VRTC999 must be rejected when CR100 is active
  const crossRes = mgr.applyLiveBalanceUpdate(
    { amount: 10000, login_id: 'VRTC999', source: 'SUBSCRIPTION' },
    t0 + 100
  );
  assert.equal(crossRes.accepted, false);
  assert.equal(mgr.getSnapshot(t0 + 100).amount, 500);

  // Matching account live stream promotes to LIVE
  const liveRes = mgr.applyLiveBalanceUpdate(
    { amount: 512.34, login_id: 'CR100', source: 'SUBSCRIPTION' },
    t0 + 200
  );
  assert.equal(liveRes.accepted, true);
  assert.equal(mgr.getSnapshot(t0 + 200).freshness, 'LIVE');
  assert.equal(mgr.isFreshForTrading(t0 + 200), true);

  // Exceeding stale threshold marks snapshot STALE and blocks trading
  assert.equal(mgr.getSnapshot(t0 + 35_000).freshness, 'STALE');
  assert.equal(mgr.isFreshForTrading(t0 + 35_000), false);
});

test('11. RiskEngine & SBAgent enforce balance <= 0, maxStakePercent >= minStake, and negative Kelly blocks', () => {
  // Zero balance
  const zeroBal = calculateDynamicStake({ balance: 0, winRate: 0.7, mode: 'KELLY_HALF' });
  assert.equal(zeroBal.recommendedStake, 0);
  assert.equal(zeroBal.blocked, true);

  // Small balance where 3% cap ($0.30) is below $1.00 minStake — minStake MUST NOT override cap
  const smallBal = calculateDynamicStake({
    balance: 10,
    winRate: 0.7,
    confidence: 0.7,
    maxStakePercent: 0.03,
    minStake: 1.0,
    mode: 'KELLY_HALF',
  });
  assert.equal(smallBal.recommendedStake, 0);
  assert.equal(smallBal.blocked, true);

  // Negative Kelly expectancy must block trade (rawKelly <= 0)
  const negKelly = calculateDynamicStake({
    balance: 1000,
    winRate: 0.35,
    confidence: 0.35,
    payoutRate: 0.95,
    mode: 'KELLY_HALF',
  });
  assert.ok(negKelly.rawKellyFraction <= 0);
  assert.equal(negKelly.recommendedStake, 0);
  assert.equal(negKelly.blocked, true);

  // SBAgent self-configuration blocks $0 balance
  SBAgent.onAutonomyGranted({
    symbol: '1HZ10V',
    balance: 0,
    accountMode: 'DEMO',
    regime: 'TREND',
    openExposure: 0,
    risk: {
      sizingMode: 'CONSERVATIVE_KELLY',
      maxStake: 10,
      maxExposure: 25,
      sessionDrawdownCap: 5,
      maxConsecutiveLosses: 3,
    },
    allowedSymbols: ['1HZ10V'],
    strategyRef: 'sbagent.md-v4.1',
  });
  const cfgFail = SBAgent.configureForAutonomy({
    symbol: '1HZ10V',
    balance: 0,
    accountMode: 'DEMO',
    regime: 'TREND',
    openExposure: 0,
    risk: {
      sizingMode: 'CONSERVATIVE_KELLY',
      maxStake: 10,
      maxExposure: 25,
      sessionDrawdownCap: 5,
      maxConsecutiveLosses: 3,
    },
    allowedSymbols: ['1HZ10V'],
    strategyRef: 'sbagent.md-v4.1',
  });
  assert.equal(cfgFail.ok, false);
  SBAgent.onAutonomyRevoked('test_cleanup');
});

test('12. Central TradeReadinessGuard enforces all 10 flags before execution', () => {
  const guard = new TradeReadinessGuard();
  const now = 2_000_000;
  const baseInput: TradeReadinessInput = {
    hasValidAuth: true,
    tokenExpired: false,
    selectedAccountId: 'VRTC100',
    confirmedAccountId: 'VRTC100',
    connectionState: 'ONLINE',
    isSessionAuthenticated: true,
    balanceSnapshot: {
      account_id: 'VRTC100',
      login_id: 'VRTC100',
      account_type: 'demo',
      currency: 'USD',
      amount: 1000,
      last_updated: now,
      source: 'SUBSCRIPTION',
      connection_state: 'ONLINE',
      freshness: 'LIVE',
    },
    requiredSubscriptionsActive: true,
    hasUnresolvedPurchaseTimeout: false,
    hasPendingReconciliation: false,
    emergencyStopActive: false,
    symbol: '1HZ10V',
    stake: 5,
    winRate: 0.65,
    confidence: 0.65,
    sizingMode: 'KELLY_HALF',
    maxStakePercent: 0.05,
    minStake: 0.35,
    openExposure: 0,
    maxOpenExposure: 100,
    openContractsCount: 0,
    maxConcurrentContracts: 3,
    dailyLoss: 0,
    maxDailyLoss: 50,
    drawdownPercent: 0,
    maxDrawdownPercent: 5,
    consecutiveLosses: 0,
    maxConsecutiveLosses: 3,
    now,
  };

  const pass = guard.evaluate(baseInput);
  assert.equal(pass.ready, true);
  assert.equal(Object.values(pass.flags).every(Boolean), true);

  const cases: Array<[string, Partial<TradeReadinessInput>, keyof typeof pass.flags]> = [
    ['VALID_AUTHENTICATION', { hasValidAuth: false }, 'VALID_AUTHENTICATION'],
    ['VALID_SELECTED_ACCOUNT', { selectedAccountId: null }, 'VALID_SELECTED_ACCOUNT'],
    ['ACCOUNT_IDENTITY_CONFIRMED', { confirmedAccountId: 'CR_OTHER' }, 'ACCOUNT_IDENTITY_CONFIRMED'],
    ['AUTHENTICATED_SESSION', { connectionState: 'RECONNECTING' }, 'AUTHENTICATED_SESSION'],
    [
      'FRESH_BALANCE',
      { balanceSnapshot: { ...baseInput.balanceSnapshot, freshness: 'SYNCING' } },
      'FRESH_BALANCE',
    ],
    ['REQUIRED_SUBSCRIPTIONS_ACTIVE', { requiredSubscriptionsActive: false }, 'REQUIRED_SUBSCRIPTIONS_ACTIVE'],
    ['NO_UNRESOLVED_PURCHASE_TIMEOUT', { hasUnresolvedPurchaseTimeout: true }, 'NO_UNRESOLVED_PURCHASE_TIMEOUT'],
    ['NO_PENDING_RECONCILIATION', { hasPendingReconciliation: true }, 'NO_PENDING_RECONCILIATION'],
    ['RISK_ENGINE_APPROVAL', { consecutiveLosses: 3 }, 'RISK_ENGINE_APPROVAL'],
    ['EMERGENCY_STOP_INACTIVE', { emergencyStopActive: true }, 'EMERGENCY_STOP_INACTIVE'],
  ];

  for (const [, patch, expectedFalseFlag] of cases) {
    const res = guard.evaluate({ ...baseInput, ...patch });
    assert.equal(res.ready, false);
    assert.equal(res.flags[expectedFalseFlag], false);
  }
});

test('13 & 14. Duplicate-intent lock, timeout RECONCILIATION_PENDING, strict PnL buckets, and isValidToSell gating', () => {
  const reconciler = new PortfolioReconciler();

  const first = reconciler.registerIntent({
    intentId: 'int_1',
    accountId: 'VRTC100',
    symbol: '1HZ10V',
    contractType: 'CALL',
    amount: 5,
    duration: 5,
    durationUnit: 'ticks',
  });
  assert.equal(first.ok, true);

  // Duplicate in-flight intent blocked
  const dup = reconciler.registerIntent({
    intentId: 'int_2',
    accountId: 'VRTC100',
    symbol: '1HZ10V',
    contractType: 'CALL',
    amount: 5,
    duration: 5,
    durationUnit: 'ticks',
  });
  assert.equal(dup.ok, false);

  // Timeout enters RECONCILIATION_PENDING
  reconciler.markIntentTimedOut('int_1');
  assert.equal(reconciler.hasUnresolvedTimeout(), true);
  assert.equal(reconciler.hasPendingReconciliation(), true);

  // Reconcile resolves timeout when broker portfolio snapshot arrives
  const rec = reconciler.reconcile({
    openTrades: [],
    broker: {
      openPortfolioContracts: [
        { contract_id: 9001, symbol: '1HZ10V', buy_price: 5, date_start: Math.floor(Date.now() / 1000) },
      ],
    },
  });
  assert.deepEqual(rec.matchedOpenContractIds, [9001]);
  assert.equal(reconciler.hasUnresolvedTimeout(), false);
  assert.equal(reconciler.hasPendingReconciliation(), false);

  // Strict PnL separation & broker-only isValidToSell
  const nonLiveOpenTrade: any = {
    id: 't1',
    timestamp: new Date().toISOString(),
    mode: 'DEMO',
    symbol: '1HZ10V',
    amount: 5,
    decision: 'BUY',
    result: 'PENDING',
    profit: 3.5, // stale non-stream profit must NOT leak into liveDerivPnL or calculateDerivRealtimePnL
    isDerivRealTime: false,
    isValidToSell: false,
    confidence: 0.7,
    agent: 'SB',
    regime: 'TREND',
    duration: 5,
    entryPrice: 100,
  };
  const liveOpenTrade: any = {
    ...nonLiveOpenTrade,
    id: 't2',
    profit: 4.2,
    isDerivRealTime: true,
    isValidToSell: true,
    bidPrice: 9.2,
  };
  const settledClosedTrade: any = {
    ...nonLiveOpenTrade,
    id: 't3',
    result: 'WIN',
    profit: 4.75,
  };

  assert.equal(calculateDerivRealtimePnL(nonLiveOpenTrade, 102).isRealDerivStream, false);
  assert.equal(calculateDerivRealtimePnL(nonLiveOpenTrade, 102).isValidToSell, false);
  assert.equal(calculateDerivRealtimePnL(nonLiveOpenTrade, 102).profit, 0);
  assert.equal(calculateDerivRealtimePnL(liveOpenTrade, 102).isValidToSell, true);
  assert.equal(calculateDerivRealtimePnL(liveOpenTrade, 102).profit, 4.2);

  const summary = reconciler.computePnLSummary([nonLiveOpenTrade, liveOpenTrade], [settledClosedTrade]);
  assert.equal(summary.liveDerivPnL, 4.2);
  assert.equal(summary.realizedPnL, 4.75);
  assert.equal(summary.estimatedPnL, 0);
});

test('15 & 16. Zero bearer token leaks and conditional Deriv-App-ID header on PAT vs OAuth 2.0', async () => {
  const secretToken = 'SUPER_SECRET_DERIV_TOKEN_XYZ_789';
  const vault = new DerivServerAuthVault({ signingSecret: 'sec' });

  const patHeaders = vault.buildRestHeaders({
    authMethod: 'pat',
    accessToken: secretToken,
    appId: '33zsnNh6YJ2HWm30oZZJR',
  });
  assert.equal(patHeaders.Authorization, `Bearer ${secretToken}`);
  assert.equal(patHeaders['Deriv-App-ID'], '33zsnNh6YJ2HWm30oZZJR');

  const oauthHeaders = vault.buildRestHeaders({
    authMethod: 'oauth2_pkce',
    accessToken: secretToken,
    appId: '33zsnNh6YJ2HWm30oZZJR',
  });
  assert.equal(oauthHeaders.Authorization, `Bearer ${secretToken}`);
  assert.equal('Deriv-App-ID' in oauthHeaders, false);

  // Public session view never exposes secret token
  const publicView = vault.toPublicView({
    sid: 'sid_1',
    authMethod: 'pat',
    accessToken: secretToken,
    appId: '33zsnNh6YJ2HWm30oZZJR',
    expiresAt: null,
    accounts: [{ account: 'VRTC1', account_id: 'VRTC1', currency: 'USD', isVirtual: true, token: secretToken }],
    selectedAccountId: 'VRTC1',
    createdAt: 1,
    updatedAt: 1,
  });
  assert.equal(JSON.stringify(publicView).includes(secretToken), false);

  // Secret redaction & masking
  assert.equal(redactSecrets(`Bearer ${secretToken} failed`).includes(secretToken), false);
  assert.equal(maskSecret(secretToken).includes('SECRET_DERIV'), false);

  // DerivWebSocketClient never returns raw volatile token in diagnostics or credentials
  const wsClient = new DerivWebSocketClient({
    wsFactory: (u) => new MockWebSocket(u),
    balanceManager: new BalanceManager(),
    portfolioReconciler: new PortfolioReconciler(),
  });
  wsClient.connectWithLegacyToken(secretToken, '1089');
  assert.equal(wsClient.getCredentials().token, '');
  assert.equal(wsClient.getCredentials().hasVolatileToken, true);
  assert.equal(JSON.stringify(wsClient.getDiagnostics()).includes(secretToken), false);

  await wsClient.logout();
});

test('17. Balance freshness transitions SYNCING -> LIVE on demo balance ($9,866.97), unblocks TradeReadinessGuard, and survives re-session/authorize', async () => {
  const sockets: MockWebSocket[] = [];
  const mockFetch = (async (url: string) => {
    if (url.includes('/otp')) {
      return new Response(
        JSON.stringify({ ok: true, wsUrl: 'wss://api.derivws.com/trading/v1/options/ws/otp?token=otp_demo' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/accounts/select')) {
      return new Response(
        JSON.stringify({
          ok: true,
          selectedAccount: { account: 'VRTC9866', account_id: 'acct-uuid-9866', account_type: 'demo', currency: 'USD', balance: 9866.97 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  const balMgr = new BalanceManager(30_000);
  const snapshots: string[] = [];
  const unsub = balMgr.subscribe((s) => snapshots.push(`${s.connection_state}:${s.freshness}:${s.amount}`));

  const wsClient = new DerivWebSocketClient({
    wsFactory: (u) => {
      const s = new MockWebSocket(u);
      sockets.push(s);
      return s;
    },
    fetchImpl: mockFetch,
    balanceManager: balMgr,
    portfolioReconciler: new PortfolioReconciler(),
  });

  // Unauthenticated / offline baseline must remain UNAVAILABLE
  assert.equal(balMgr.getSnapshot().freshness, 'UNAVAILABLE');

  await wsClient.completeServerSession({
    authMethod: 'oauth2_pkce',
    appId: '33zsnNh6YJ2HWm30oZZJR',
    accounts: [
      { account: 'VRTC9866', account_id: 'acct-uuid-9866', account_type: 'demo', currency: 'USD', balance: 9866.97 },
    ],
    selectedAccountId: 'VRTC9866',
  });

  assert.equal(sockets.length, 1);
  sockets[0].triggerOpen();

  // Immediately after open, connection is ONLINE with $9,866.97 displayed as SYNCING (readiness blocked)
  assert.equal(wsClient.getConnectionState(), 'ONLINE');
  assert.equal(balMgr.getSnapshot().amount, 9866.97);
  assert.equal(balMgr.getSnapshot().freshness, 'SYNCING');

  const guard = new TradeReadinessGuard();
  const evalReadiness = () =>
    guard.evaluate({
      hasValidAuth: wsClient.hasRealToken() && !wsClient.isTokenExpired(),
      tokenExpired: wsClient.isTokenExpired(),
      selectedAccountId: wsClient.getSelectedAccount()?.account || null,
      confirmedAccountId: wsClient.getConfirmedAccountId(),
      connectionState: wsClient.getConnectionState(),
      isSessionAuthenticated: wsClient.isAuthorized(),
      balanceSnapshot: wsClient.getBalanceSnapshot(),
      requiredSubscriptionsActive: wsClient.getSubscriptionStatus().requiredSubscriptionsActive,
      hasUnresolvedPurchaseTimeout: false,
      hasPendingReconciliation: false,
      emergencyStopActive: false,
      symbol: '1HZ10V',
      stake: 5,
      winRate: 0.65,
      confidence: 0.65,
      sizingMode: 'KELLY_HALF',
      maxStakePercent: 0.05,
      minStake: 0.35,
      openExposure: 0,
      maxOpenExposure: 1000,
      openContractsCount: 0,
      maxConcurrentContracts: 3,
      dailyLoss: 0,
      maxDailyLoss: 500,
      drawdownPercent: 0,
      maxDrawdownPercent: 5,
      consecutiveLosses: 0,
      maxConsecutiveLosses: 3,
    });

  assert.equal(evalReadiness().flags.FRESH_BALANCE, false);
  assert.equal(evalReadiness().ready, false);

  // Live balance frame arrives -> immediately transitions to LIVE and unblocks TradeReadinessGuard
  sockets[0].triggerMessage({
    msg_type: 'balance',
    balance: { balance: 9866.97, currency: 'USD', loginid: 'VRTC9866' },
    subscription: { id: 'sub_demo_1' },
  });

  assert.equal(balMgr.getSnapshot().freshness, 'LIVE');
  assert.equal(balMgr.getSnapshot().amount, 9866.97);
  assert.ok(snapshots.includes('ONLINE:LIVE:9866.97'));
  assert.equal(evalReadiness().flags.FRESH_BALANCE, true);
  assert.equal(evalReadiness().ready, true);

  // Duplicate authorize in the same generation must NOT downgrade LIVE back to SYNCING
  sockets[0].triggerMessage({
    msg_type: 'authorize',
    authorize: { loginid: 'VRTC9866', account_id: 'acct-uuid-9866', currency: 'USD', is_virtual: 1, balance: 9866.97 },
  });
  assert.equal(balMgr.getSnapshot().freshness, 'LIVE');

  // Rotating session / re-running completeServerSession MUST reset subscriptions so balance: 1 is re-sent on new socket
  await wsClient.completeServerSession({
    authMethod: 'oauth2_pkce',
    appId: '33zsnNh6YJ2HWm30oZZJR',
    accounts: [
      { account: 'VRTC9866', account_id: 'acct-uuid-9866', account_type: 'demo', currency: 'USD', balance: 9866.97 },
    ],
    selectedAccountId: 'VRTC9866',
  });
  assert.equal(sockets.length, 2);
  sockets[1].triggerOpen();
  assert.equal(balMgr.getSnapshot().freshness, 'SYNCING');
  const balSubReq = sockets[1].sentPayloads.find((p) => p.balance === 1 && p.subscribe === 1);
  assert.ok(balSubReq, 'New socket must send { balance: 1, subscribe: 1 } after rotation');

  // If subscribe returns AlreadySubscribed error, fallback one-shot { balance: 1 } must be dispatched
  sockets[1].triggerMessage({
    msg_type: 'balance',
    echo_req: balSubReq,
    error: { code: 'AlreadySubscribed', message: 'Already subscribed' },
  });
  assert.ok(
    sockets[1].sentPayloads.some((p) => p.balance === 1 && p.subscribe === undefined),
    'Fallback one-shot { balance: 1 } must be sent on AlreadySubscribed'
  );

  // One-shot balance payload (even without subscription.id) promotes to LIVE
  sockets[1].triggerMessage({
    msg_type: 'balance',
    balance: { amount: 9866.97, currency: 'USD', account_id: 'acct-uuid-9866' },
  });
  assert.equal(balMgr.getSnapshot().freshness, 'LIVE');
  assert.equal(evalReadiness().ready, true);

  unsub();
  await wsClient.logout();
  assert.equal(balMgr.getSnapshot().freshness, 'UNAVAILABLE');
});

test('18. BalanceManager enforces sessionGeneration, timestamp monotonicity, account identity, and non-revivable STALE guards', () => {
  const mgr = new BalanceManager(30_000);
  const t0 = 5_000_000;

  // Reject live update when no account is selected
  assert.equal(
    mgr.applyLiveBalanceUpdate({ amount: 100, login_id: 'VRTC1', sessionGeneration: 0 }, t0).accepted,
    false
  );

  mgr.beginSession(2, { account_id: 'acct-2', login_id: 'VRTC2' }, t0);
  mgr.applyAuthorize(
    { account_id: 'acct-2', login_id: 'VRTC2', is_virtual: true, currency: 'USD', balance: 9866.97, sessionGeneration: 2 },
    t0
  );
  assert.equal(mgr.getSnapshot(t0).freshness, 'SYNCING');

  // Stale sessionGeneration rejected
  const staleGenRes = mgr.applyLiveBalanceUpdate(
    { amount: 9999, login_id: 'VRTC2', sessionGeneration: 1 },
    t0 + 100
  );
  assert.equal(staleGenRes.accepted, false);
  assert.equal(mgr.getSnapshot(t0 + 100).freshness, 'SYNCING');

  // Invalid / expired eventTimestamp rejected
  const staleTsRes = mgr.applyLiveBalanceUpdate(
    { amount: 9866.97, login_id: 'VRTC2', sessionGeneration: 2, eventTimestamp: t0 - 40_000 },
    t0 + 100
  );
  assert.equal(staleTsRes.accepted, false);
  assert.equal(mgr.getSnapshot(t0 + 100).freshness, 'SYNCING');

  // Mismatched account_id even with matching login_id rejected
  const badAcctRes = mgr.applyLiveBalanceUpdate(
    { amount: 9866.97, login_id: 'VRTC2', account_id: 'acct-OTHER', sessionGeneration: 2 },
    t0 + 100
  );
  assert.equal(badAcctRes.accepted, false);

  // Valid update transitions to LIVE
  const validRes = mgr.applyLiveBalanceUpdate(
    { amount: 9866.97, login_id: 'VRTC2', account_id: 'acct-2', sessionGeneration: 2 },
    t0 + 200
  );
  assert.equal(validRes.accepted, true);
  assert.equal(mgr.getSnapshot(t0 + 200).freshness, 'LIVE');

  // Out-of-order older timestamp rejected once LIVE
  const oooRes = mgr.applyLiveBalanceUpdate(
    { amount: 9000, login_id: 'VRTC2', sessionGeneration: 2 },
    t0 + 150
  );
  assert.equal(oooRes.accepted, false);
  assert.equal(mgr.getSnapshot(t0 + 200).amount, 9866.97);

  // Heartbeat AFTER staleThresholdMs cannot revive stale snapshot back to LIVE
  mgr.touchHeartbeat(t0 + 35_000, 2);
  assert.equal(mgr.getSnapshot(t0 + 35_000).freshness, 'STALE');
  assert.equal(mgr.isFreshForTrading(t0 + 35_000), false);
});

test('19. Options API underlying_symbol proposal, verified quote expiry, correlated buyProposal, and POC monitoring cleanup', async () => {
  const sockets: MockWebSocket[] = [];
  const mockFetch = (async (url: string) => {
    if (url.includes('/otp')) {
      return new Response(
        JSON.stringify({ ok: true, wsUrl: 'wss://api.derivws.com/trading/v1/options/ws/otp?token=otp_buy_test' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  const wsClient = new DerivWebSocketClient({
    wsFactory: (u) => {
      const s = new MockWebSocket(u);
      sockets.push(s);
      return s;
    },
    fetchImpl: mockFetch,
    balanceManager: new BalanceManager(),
    portfolioReconciler: new PortfolioReconciler(),
  });

  await wsClient.completeServerSession({
    authMethod: 'oauth2_pkce',
    appId: '33zsnNh6YJ2HWm30oZZJR',
    accounts: [{ account: 'VRTC777', account_id: 'acct-777', account_type: 'demo', currency: 'USD', balance: 5000 }],
    selectedAccountId: 'VRTC777',
  });
  const sock = sockets[0];
  sock.triggerOpen();
  sock.triggerMessage({
    msg_type: 'balance',
    balance: { balance: 5000, currency: 'USD', loginid: 'VRTC777', account_id: 'acct-777' },
    subscription: { id: 'sub_bal_777' },
  });

  // 1. Options API OTP session sends underlying_symbol (not legacy symbol)
  const propPromise = wsClient.requestProposalQuote({
    symbol: '1HZ10V',
    amount: 5,
    contract_type: 'CALL',
    duration: 5,
    duration_unit: 't',
  });
  const propReq = sock.sentPayloads.find((p) => p.proposal === 1);
  assert.ok(propReq, 'Proposal payload must be sent');
  assert.equal(propReq.underlying_symbol, '1HZ10V');
  assert.equal('symbol' in propReq, false);

  const nowSec = Math.floor(Date.now() / 1000);
  sock.triggerMessage({
    req_id: propReq.req_id,
    msg_type: 'proposal',
    proposal: {
      id: 'prop_abc_123',
      ask_price: 5.05,
      payout: 9.75,
      spot: 100.25,
      spot_time: nowSec,
      date_start: nowSec,
      date_expiry: nowSec + 10,
      valid_until: nowSec + 8,
      underlying_symbol: '1HZ10V',
    },
  });

  const quote = await propPromise;
  assert.equal(quote.proposalId, 'prop_abc_123');
  assert.equal(quote.askPrice, 5.05);
  assert.ok(quote.expiresAt <= (nowSec + 8) * 1000);
  assert.ok(quote.spotTimeMs);

  // Stale quote rejection in validateTradeRiskGate
  const staleGate = validateTradeRiskGate({
    balance: 5000,
    balanceFreshness: 'LIVE',
    stake: 5,
    symbol: '1HZ10V',
    openExposure: 0,
    maxOpenExposure: 500,
    openContractsCount: 0,
    maxConcurrentContracts: 3,
    dailyLoss: 0,
    maxDailyLoss: 200,
    drawdownPercent: 0,
    maxDrawdownPercent: 5,
    consecutiveLosses: 0,
    maxConsecutiveLosses: 3,
    proposal: quote,
    now: (nowSec + 9) * 1000,
  });
  assert.equal(staleGate.approved, false);
  assert.ok(staleGate.blockers.some((b) => /expired|stale/i.test(b)));

  // Rejects proposal with stale spot_time directly from requestProposalQuote
  const stalePropPromise = wsClient.requestProposalQuote({
    symbol: '1HZ10V',
    amount: 5,
    contract_type: 'CALL',
    duration: 5,
    duration_unit: 't',
  });
  const stalePropReq = sock.sentPayloads.filter((p) => p.proposal === 1).pop();
  sock.triggerMessage({
    req_id: stalePropReq.req_id,
    msg_type: 'proposal',
    proposal: {
      id: 'prop_stale_spot',
      ask_price: 5.0,
      spot_time: nowSec - 30,
      date_expiry: nowSec + 60,
    },
  });
  await assert.rejects(stalePropPromise, /stale/i);

  // 2. buyProposal uses proposal ID, quote askPrice as max price, attaches req_id, and subscribes POC by contract_id
  const buyPromise = wsClient.buyProposal({
    proposalId: quote.proposalId,
    maxPrice: quote.askPrice,
  });
  const buyReq = sock.sentPayloads.find((p) => p.buy === 'prop_abc_123');
  assert.ok(buyReq, 'Buy payload must reference proposalId');
  assert.equal(buyReq.price, 5.05);
  assert.equal(typeof buyReq.req_id, 'number');

  sock.triggerMessage({
    req_id: buyReq.req_id,
    msg_type: 'buy',
    buy: {
      contract_id: 888999,
      buy_price: 5.05,
      payout: 9.75,
      balance_after: 4994.95,
      transaction_id: 555111,
    },
  });
  const buyRes = await buyPromise;
  assert.equal(buyRes.contractId, 888999);
  assert.equal(buyRes.buyPrice, 5.05);

  // Must subscribe proposal_open_contract for exact contract_id
  const pocSubReq = sock.sentPayloads.find(
    (p) => p.proposal_open_contract === 1 && p.contract_id === 888999 && p.subscribe === 1
  );
  assert.ok(pocSubReq, 'Must subscribe to proposal_open_contract for purchased contract_id');

  // Tracking subscription id and cleaning up on settlement
  sock.triggerMessage({
    msg_type: 'proposal_open_contract',
    subscription: { id: 'sub_poc_888999' },
    proposal_open_contract: { contract_id: 888999, is_sold: 0, is_valid_to_sell: 1, profit: 0.45 },
  });
  assert.ok(wsClient.getRegisteredSubscriptions().some((s) => s.key === 'poc:888999' && s.subscriptionId === 'sub_poc_888999'));

  sock.triggerMessage({
    msg_type: 'proposal_open_contract',
    proposal_open_contract: { contract_id: 888999, is_sold: 1, status: 'won', profit: 4.7, balance_after: 5004.7 },
  });
  assert.ok(sock.sentPayloads.some((p) => p.forget === 'sub_poc_888999'));
  assert.equal(wsClient.getRegisteredSubscriptions().some((s) => s.key === 'poc:888999'), false);

  await wsClient.logout();
});

test('20. Purchase timeout reconciliation requires verified account statement + portfolio check before unlocking retry', async () => {
  const reconciler = new PortfolioReconciler();
  const t0 = Date.now();

  const reg = reconciler.registerIntent({
    intentId: 'int_timeout_stmt',
    accountId: 'VRTC100',
    symbol: '1HZ10V',
    contractType: 'CALL',
    amount: 10,
    duration: 1,
    durationUnit: 'ticks',
    proposalId: 'prop_timeout_1',
    now: t0,
  });
  assert.equal(reg.ok, true);
  reconciler.markIntentTimedOut('int_timeout_stmt');
  assert.equal(reconciler.hasPendingReconciliation(), true);

  // If statement query failed (statementChecked: false), empty portfolio must NOT unlock blind retry!
  const unverifiedRec = reconciler.reconcile({
    openTrades: [],
    broker: {
      openPortfolioContracts: [],
      settledTransactions: [],
      portfolioChecked: true,
      statementChecked: false,
    },
  });
  assert.equal(unverifiedRec.stillPendingReconciliation, true);
  assert.equal(reconciler.hasPendingReconciliation(), true);

  // Once account statement confirms a settled transaction matching the timed-out purchase, record & resolve cleanly
  const stmtMatchRec = reconciler.reconcile({
    openTrades: [],
    broker: {
      openPortfolioContracts: [],
      settledTransactions: [
        {
          contract_id: 444555,
          action_type: 'buy',
          amount: -10,
          shortcode: 'CALL_1HZ10V_10_1T',
          transaction_time: Math.floor(t0 / 1000) + 1,
          balance_after: 9990,
        },
      ],
      portfolioChecked: true,
      statementChecked: true,
    },
  });
  assert.deepEqual(stmtMatchRec.newlySettledContractIds, [444555]);
  assert.equal(stmtMatchRec.stillPendingReconciliation, false);
  assert.equal(reconciler.hasPendingReconciliation(), false);
});

test('21. BalanceManager & DerivWebSocketClient correlate connection_id and req_id for SYNCING -> LIVE while rejecting stale or mismatched connections', async () => {
  const sockets: MockWebSocket[] = [];
  const mockFetch = (async (url: string) => {
    if (url.includes('/otp')) {
      return new Response(
        JSON.stringify({ ok: true, wsUrl: 'wss://api.derivws.com/trading/v1/options/ws/otp?token=otp_corr' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  const balMgr = new BalanceManager(30_000);
  const wsClient = new DerivWebSocketClient({
    wsFactory: (u) => {
      const s = new MockWebSocket(u);
      sockets.push(s);
      return s;
    },
    fetchImpl: mockFetch,
    balanceManager: balMgr,
    portfolioReconciler: new PortfolioReconciler(),
  });

  // 1) Simulate REST /options/accounts returning UUID account_id without loginid
  await wsClient.completeServerSession({
    authMethod: 'oauth2_pkce',
    appId: '33zsnNh6YJ2HWm30oZZJR',
    accounts: [
      { account: 'acct-uuid-555', account_id: 'acct-uuid-555', account_type: 'demo', currency: 'USD', balance: 4250.5 },
    ],
    selectedAccountId: 'acct-uuid-555',
  });

  const conn1 = wsClient.getActiveConnectionId();
  assert.ok(conn1, 'Active connection_id must be allocated on session start');
  assert.equal(balMgr.getSnapshot().connection_id, conn1);

  sockets[0].triggerOpen();
  assert.equal(balMgr.getSnapshot().freshness, 'SYNCING');

  const balReq1 = sockets[0].sentPayloads.find((p) => p.balance === 1 && p.subscribe === 1);
  assert.ok(balReq1 && typeof balReq1.req_id === 'number', 'Must assign numeric req_id to outbound balance subscription');
  assert.equal(balMgr.hasRegisteredBalanceRequest(balReq1.req_id, wsClient.getSessionGeneration(), conn1), true);

  // 2) Mismatched connection_id on incoming payload must be rejected cleanly
  const badConnRes = balMgr.applyLiveBalanceUpdate({
    amount: 9999,
    login_id: 'VRTC555',
    source: 'SUBSCRIPTION',
    sessionGeneration: wsClient.getSessionGeneration(),
    req_id: balReq1.req_id,
    connection_id: 'conn_wrong_socket',
  });
  assert.equal(badConnRes.accepted, false);
  assert.equal(balMgr.getSnapshot().freshness, 'SYNCING');

  // 3) Valid correlated WS balance response (even when WS returns VRTC555 instead of REST UUID acct-uuid-555)
  // must bind login_id, promote SYNCING -> LIVE immediately, and satisfy TradeReadinessGuard
  sockets[0].triggerMessage({
    msg_type: 'balance',
    req_id: balReq1.req_id,
    balance: { balance: 4250.5, currency: 'USD', loginid: 'VRTC555' },
    subscription: { id: 'sub_corr_555' },
  });

  const snap1 = balMgr.getSnapshot();
  assert.equal(snap1.freshness, 'LIVE');
  assert.equal(snap1.amount, 4250.5);
  assert.equal(snap1.login_id, 'VRTC555');
  assert.equal(snap1.account_id, 'acct-uuid-555');
  assert.equal(snap1.connection_id, conn1);
  assert.equal(wsClient.getConfirmedAccountId(), 'VRTC555');
  assert.equal(wsClient.getSelectedAccount()?.account, 'VRTC555');

  const guard = new TradeReadinessGuard();
  const readiness = guard.evaluate({
    hasValidAuth: wsClient.hasRealToken() && !wsClient.isTokenExpired(),
    tokenExpired: wsClient.isTokenExpired(),
    selectedAccountId: wsClient.getSelectedAccount()?.account || null,
    confirmedAccountId: wsClient.getConfirmedAccountId(),
    connectionState: wsClient.getConnectionState(),
    isSessionAuthenticated: wsClient.isAuthorized(),
    balanceSnapshot: wsClient.getBalanceSnapshot(),
    requiredSubscriptionsActive: wsClient.getSubscriptionStatus().requiredSubscriptionsActive,
    hasUnresolvedPurchaseTimeout: false,
    hasPendingReconciliation: false,
    emergencyStopActive: false,
    symbol: '1HZ10V',
    stake: 5,
    winRate: 0.65,
    confidence: 0.65,
    sizingMode: 'KELLY_HALF',
    maxStakePercent: 0.05,
    minStake: 0.35,
    openExposure: 0,
    maxOpenExposure: 1000,
    openContractsCount: 0,
    maxConcurrentContracts: 3,
    dailyLoss: 0,
    maxDailyLoss: 500,
    drawdownPercent: 0,
    maxDrawdownPercent: 5,
    consecutiveLosses: 0,
    maxConsecutiveLosses: 3,
  });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.flags.FRESH_BALANCE, true);
  assert.equal(readiness.flags.ACCOUNT_IDENTITY_CONFIRMED, true);

  // 4) Once canonical loginid VRTC555 is bound, a cross-account VRTC999 frame must be rejected even on active connection_id
  const crossAcctRes = balMgr.applyLiveBalanceUpdate({
    amount: 12345,
    login_id: 'VRTC999',
    source: 'SUBSCRIPTION',
    sessionGeneration: wsClient.getSessionGeneration(),
    connection_id: conn1,
  });
  assert.equal(crossAcctRes.accepted, false);
  assert.equal(balMgr.getSnapshot().amount, 4250.5);

  // 5) Reconnect / new session rotates connection_id; stale req_id from conn1 must be rejected even without sessionGeneration param
  await wsClient.completeServerSession({
    authMethod: 'oauth2_pkce',
    appId: '33zsnNh6YJ2HWm30oZZJR',
    accounts: [
      { account: 'VRTC555', account_id: 'acct-uuid-555', account_type: 'demo', currency: 'USD', balance: 4250.5 },
    ],
    selectedAccountId: 'VRTC555',
  });
  const conn2 = wsClient.getActiveConnectionId();
  assert.ok(conn2 && conn2 !== conn1);
  sockets[1].triggerOpen();
  assert.equal(balMgr.getSnapshot().freshness, 'SYNCING');

  const staleReqRes = balMgr.applyLiveBalanceUpdate({
    amount: 7777,
    login_id: 'VRTC555',
    source: 'SUBSCRIPTION',
    req_id: balReq1.req_id,
    connection_id: conn2,
  });
  assert.equal(staleReqRes.accepted, false);
  assert.equal(balMgr.getSnapshot().freshness, 'SYNCING');

  const balReq2 = sockets[1].sentPayloads.find((p) => p.balance === 1 && p.subscribe === 1);
  assert.ok(balReq2 && typeof balReq2.req_id === 'number');
  sockets[1].triggerMessage({
    msg_type: 'balance',
    req_id: balReq2.req_id,
    balance: { balance: 4261.25, currency: 'USD' }, // payload omits loginid/account_id; mapped via req_id + conn2
  });
  assert.equal(balMgr.getSnapshot().freshness, 'LIVE');
  assert.equal(balMgr.getSnapshot().amount, 4261.25);

  await wsClient.logout();
});


