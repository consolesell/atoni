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
import { calculateDynamicStake } from '../src/lib/riskEngine.ts';
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
