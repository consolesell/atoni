import {
  BalanceFreshness,
  BalanceSnapshot,
  BalanceSource,
  ConnectionState,
  DerivLinkedAccount,
} from '../types/trading';

export const DEFAULT_BALANCE_STALE_MS = 45_000;

export interface PendingBalanceRequest {
  reqId: number;
  connectionId: string | null;
  sessionGeneration: number;
  accountId: string | null;
  loginId: string | null;
  isSubscription: boolean;
  registeredAt: number;
}

const CANONICAL_LOGINID_RE = /^(?:VRTC|CR|MF|MLT|MX|VRTW)\d+/i;

export class BalanceManager {
  private snapshot: BalanceSnapshot = {
    account_id: null,
    login_id: null,
    account_type: null,
    currency: 'USD',
    amount: 0,
    last_updated: 0,
    source: 'NONE',
    connection_state: 'OFFLINE',
    freshness: 'UNAVAILABLE',
    session_generation: 0,
    connection_id: null,
  };

  private staleThresholdMs: number;
  private listeners: Set<(snapshot: BalanceSnapshot) => void> = new Set();
  private pendingBalanceRequests: Map<number, PendingBalanceRequest> = new Map();

  constructor(staleThresholdMs: number = DEFAULT_BALANCE_STALE_MS) {
    this.staleThresholdMs = staleThresholdMs;
  }

  public subscribe(listener: (snapshot: BalanceSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snap = this.getSnapshot();
    this.listeners.forEach((cb) => {
      try {
        cb(snap);
      } catch (err) {
        console.error('[BalanceManager] listener error:', err);
      }
    });
  }

  public setStaleThresholdMs(ms: number): void {
    this.staleThresholdMs = Math.max(1000, ms);
  }

  public getSnapshot(now: number = Date.now()): BalanceSnapshot {
    const copy = { ...this.snapshot };
    if (
      copy.freshness === 'LIVE' &&
      copy.last_updated > 0 &&
      now - copy.last_updated > this.staleThresholdMs
    ) {
      copy.freshness = 'STALE';
    }
    return copy;
  }

  public refreshStaleness(now: number = Date.now()): BalanceSnapshot {
    if (
      this.snapshot.freshness === 'LIVE' &&
      this.snapshot.last_updated > 0 &&
      now - this.snapshot.last_updated > this.staleThresholdMs
    ) {
      this.snapshot = {
        ...this.snapshot,
        freshness: 'STALE',
      };
      this.emit();
    }
    return this.getSnapshot(now);
  }

  /**
   * Registers an outbound WS balance request (`{ balance: 1 }` or `{ balance: 1, subscribe: 1 }`)
   * with its `req_id`, active `connection_id`, `session_generation`, and target account identity
   * so incoming responses correlate deterministically even if REST used an `account_id` UUID
   * while WS responds with a `VRTC`/`CR` `loginid` or omits account fields.
   */
  public registerBalanceRequest(params: {
    reqId: number;
    connectionId?: string | null;
    sessionGeneration?: number;
    accountId?: string | null;
    loginId?: string | null;
    isSubscription?: boolean;
    now?: number;
  }): void {
    if (!Number.isFinite(params.reqId)) return;
    const currentGen = this.snapshot.session_generation ?? 0;
    const reqGen =
      typeof params.sessionGeneration === 'number' && Number.isFinite(params.sessionGeneration)
        ? params.sessionGeneration
        : currentGen;
    if (reqGen < currentGen) return;

    if (this.pendingBalanceRequests.size >= 128) {
      const oldestKey = this.pendingBalanceRequests.keys().next().value;
      if (oldestKey !== undefined) {
        this.pendingBalanceRequests.delete(oldestKey);
      }
    }

    this.pendingBalanceRequests.set(params.reqId, {
      reqId: params.reqId,
      connectionId:
        params.connectionId !== undefined ? params.connectionId : this.snapshot.connection_id ?? null,
      sessionGeneration: reqGen,
      accountId:
        params.accountId !== undefined
          ? params.accountId
            ? String(params.accountId).trim()
            : null
          : this.snapshot.account_id,
      loginId:
        params.loginId !== undefined
          ? params.loginId
            ? String(params.loginId).trim()
            : null
          : this.snapshot.login_id,
      isSubscription: Boolean(params.isSubscription),
      registeredAt: params.now && Number.isFinite(params.now) ? params.now : Date.now(),
    });
  }

  public hasRegisteredBalanceRequest(
    reqId: number,
    sessionGeneration?: number,
    connectionId?: string | null
  ): boolean {
    if (!Number.isFinite(reqId)) return false;
    const entry = this.pendingBalanceRequests.get(reqId);
    if (!entry) return false;
    const targetGen = sessionGeneration ?? this.snapshot.session_generation ?? 0;
    if (entry.sessionGeneration !== targetGen) return false;
    const activeConn = connectionId !== undefined ? connectionId : this.snapshot.connection_id ?? null;
    if (activeConn && entry.connectionId && entry.connectionId !== activeConn) return false;
    return true;
  }

  private isSameAccount(loginId?: string | null, accountId?: string | null): boolean {
    const activeKnown = [this.snapshot.login_id, this.snapshot.account_id].filter(Boolean) as string[];
    if (activeKnown.length === 0) return false;
    const incomingKnown = [loginId, accountId].filter(Boolean) as string[];
    if (incomingKnown.length === 0) return false;
    return incomingKnown.some((id) => activeKnown.includes(id));
  }

  /**
   * Advances the tracked session generation and connection ID when a new socket or account connection starts.
   * Ensures stale balance updates from prior sockets are rejected and previous LIVE state
   * requires fresh confirmation on the new session.
   */
  public beginSession(
    sessionGeneration: number,
    account?: { account_id?: string | null; login_id?: string | null; connection_id?: string | null } | null,
    now: number = Date.now()
  ): void {
    if (!Number.isFinite(sessionGeneration) || sessionGeneration < 0) return;
    const currentGen = this.snapshot.session_generation ?? 0;
    if (sessionGeneration < currentGen) return;

    const genChanged = sessionGeneration > currentGen;
    const accountChanged = account ? !this.isSameAccount(account.login_id, account.account_id) : false;

    const incomingAccountId = account?.account_id ? String(account.account_id).trim() : null;
    const incomingLoginId = account?.login_id ? String(account.login_id).trim() : null;
    const hasAccountIdentity = Boolean(
      incomingAccountId || incomingLoginId || this.snapshot.account_id || this.snapshot.login_id
    );

    let nextFreshness = this.snapshot.freshness;
    if (nextFreshness !== 'RECONCILIATION_PENDING') {
      if (genChanged || accountChanged) {
        nextFreshness = hasAccountIdentity ? 'SYNCING' : 'UNAVAILABLE';
      } else if (nextFreshness === 'UNAVAILABLE' && (incomingAccountId || incomingLoginId)) {
        nextFreshness = 'SYNCING';
      }
    }

    const nextConnectionId =
      account?.connection_id !== undefined
        ? account.connection_id
        : genChanged || accountChanged
          ? null
          : this.snapshot.connection_id ?? null;

    let nextAccountId = this.snapshot.account_id;
    let nextLoginId = this.snapshot.login_id;
    if (accountChanged) {
      nextAccountId = incomingAccountId || incomingLoginId || null;
      nextLoginId = incomingLoginId || incomingAccountId || null;
    } else if (account) {
      if (!nextAccountId && (incomingAccountId || incomingLoginId)) {
        nextAccountId = incomingAccountId || incomingLoginId;
      }
      if (!nextLoginId && (incomingLoginId || incomingAccountId)) {
        nextLoginId = incomingLoginId || incomingAccountId;
      }
    }

    this.snapshot = {
      ...this.snapshot,
      account_id: nextAccountId,
      login_id: nextLoginId,
      connection_id: nextConnectionId,
      session_generation: sessionGeneration,
      freshness: nextFreshness,
      last_updated: Number.isFinite(now) && now > 0 ? now : this.snapshot.last_updated,
    };
    this.emit();
  }

  public setConnectionState(
    connectionState: ConnectionState,
    now: number = Date.now(),
    sessionGeneration?: number
  ): void {
    const currentGen = this.snapshot.session_generation ?? 0;
    if (typeof sessionGeneration === 'number' && sessionGeneration < currentGen) {
      return;
    }

    const prevFreshness = this.snapshot.freshness;
    let nextFreshness: BalanceFreshness = prevFreshness;

    if (connectionState === 'AUTH_REQUIRED' || connectionState === 'OFFLINE') {
      if (this.snapshot.login_id || this.snapshot.account_id) {
        nextFreshness =
          prevFreshness === 'RECONCILIATION_PENDING' ? 'RECONCILIATION_PENDING' : 'STALE';
      } else {
        nextFreshness = 'UNAVAILABLE';
      }
    } else if (connectionState === 'RECONNECTING' || connectionState === 'CONNECTING') {
      if (prevFreshness === 'LIVE') {
        nextFreshness = 'STALE';
      }
    }

    this.snapshot = {
      ...this.snapshot,
      connection_state: connectionState,
      freshness: nextFreshness,
      last_updated: this.snapshot.last_updated || now,
      session_generation:
        typeof sessionGeneration === 'number' && sessionGeneration >= currentGen
          ? sessionGeneration
          : currentGen,
    };
    this.emit();
  }

  /**
   * Account discovery balances are treated strictly as provisional (SYNCING)
   * until a live balance subscription confirms them for the selected account.
   */
  public applyDiscoveryAccount(
    account: DerivLinkedAccount,
    now: number = Date.now(),
    sessionGeneration?: number
  ): void {
    if (!Number.isFinite(now) || now <= 0) return;
    const currentGen = this.snapshot.session_generation ?? 0;
    if (typeof sessionGeneration === 'number' && sessionGeneration < currentGen) {
      return;
    }

    const accountId = account.account_id || account.account;
    const loginId = account.account || account.account_id || null;
    const resolvedGen =
      typeof sessionGeneration === 'number' && sessionGeneration >= currentGen
        ? sessionGeneration
        : currentGen;

    const sameAccount = this.isSameAccount(loginId, accountId);
    const sameGen = resolvedGen === currentGen;

    // Never downgrade an already LIVE balance for the exact same account & session generation
    if (
      sameAccount &&
      sameGen &&
      this.snapshot.freshness === 'LIVE' &&
      this.snapshot.connection_state === 'ONLINE'
    ) {
      return;
    }

    const isVirtual =
      typeof account.isVirtual === 'boolean'
        ? account.isVirtual
        : account.account_type === 'demo' || Boolean(loginId?.startsWith('VRTC'));

    this.snapshot = {
      account_id: accountId || null,
      login_id: loginId,
      account_type: isVirtual ? 'demo' : 'real',
      currency: account.currency || this.snapshot.currency || 'USD',
      amount:
        typeof account.balance === 'number' && Number.isFinite(account.balance)
          ? Number(account.balance.toFixed(2))
          : 0,
      last_updated: now,
      source: 'DISCOVERY',
      connection_state: this.snapshot.connection_state,
      freshness:
        this.snapshot.freshness === 'RECONCILIATION_PENDING'
          ? 'RECONCILIATION_PENDING'
          : 'SYNCING',
      session_generation: resolvedGen,
      connection_id: sameAccount && sameGen ? this.snapshot.connection_id ?? null : null,
    };
    this.emit();
  }

  /**
   * Authorize response confirms identity; balance remains SYNCING until live subscription confirms,
   * unless caller explicitly passes promoteLive=true when subscription is unavailable in legacy tests.
   */
  public applyAuthorize(
    params: {
      account_id?: string | null;
      login_id: string | null;
      is_virtual?: boolean;
      currency?: string;
      balance?: number;
      promoteLive?: boolean;
      sessionGeneration?: number;
      connection_id?: string | null;
    },
    now: number = Date.now()
  ): void {
    if (!Number.isFinite(now) || now <= 0) return;
    const currentGen = this.snapshot.session_generation ?? 0;
    if (typeof params.sessionGeneration === 'number' && params.sessionGeneration < currentGen) {
      return;
    }

    const loginId = params.login_id;
    const accountId = params.account_id || loginId;
    const resolvedGen =
      typeof params.sessionGeneration === 'number' && params.sessionGeneration >= currentGen
        ? params.sessionGeneration
        : currentGen;
    const resolvedConnectionId =
      params.connection_id !== undefined ? params.connection_id : this.snapshot.connection_id ?? null;

    const sameAccount = this.isSameAccount(loginId, accountId);
    const sameGen = resolvedGen === currentGen;

    // Preserve LIVE stream balance & timestamp if duplicate authorize arrives in the same active generation
    if (
      sameAccount &&
      sameGen &&
      this.snapshot.freshness === 'LIVE' &&
      (this.snapshot.source === 'SUBSCRIPTION' || this.snapshot.source === 'SETTLEMENT')
    ) {
      this.snapshot = {
        ...this.snapshot,
        account_id: accountId || this.snapshot.account_id,
        login_id: loginId || this.snapshot.login_id,
        connection_id: resolvedConnectionId,
        connection_state: 'ONLINE',
      };
      this.emit();
      return;
    }

    const isVirtual =
      typeof params.is_virtual === 'boolean'
        ? params.is_virtual
        : Boolean(loginId?.startsWith('VRTC'));

    const amount =
      typeof params.balance === 'number' && Number.isFinite(params.balance)
        ? Number(params.balance.toFixed(2))
        : this.snapshot.amount;

    this.snapshot = {
      account_id: accountId,
      login_id: loginId,
      account_type: loginId ? (isVirtual ? 'demo' : 'real') : null,
      currency: params.currency || this.snapshot.currency || 'USD',
      amount,
      last_updated: now,
      source: 'AUTHORIZE',
      connection_state: 'ONLINE',
      freshness:
        this.snapshot.freshness === 'RECONCILIATION_PENDING'
          ? 'RECONCILIATION_PENDING'
          : params.promoteLive
            ? 'LIVE'
            : 'SYNCING',
      session_generation: resolvedGen,
      connection_id: resolvedConnectionId,
    };
    this.emit();
  }

  /**
   * Authoritative balance stream or broker settlement update.
   * Validates session generation, connection_id, req_id correlation, timestamps, and selected account identity.
   */
  public applyLiveBalanceUpdate(
    params: {
      amount: number;
      currency?: string;
      login_id?: string | null;
      account_id?: string | null;
      source?: Extract<BalanceSource, 'SUBSCRIPTION' | 'SETTLEMENT'>;
      sessionGeneration?: number;
      eventTimestamp?: number;
      req_id?: number | null;
      connection_id?: string | null;
    },
    now: number = Date.now()
  ): { accepted: boolean; reason?: string } {
    if (!Number.isFinite(now) || now <= 0) {
      return { accepted: false, reason: 'Invalid balance receipt timestamp.' };
    }

    if (params.eventTimestamp !== undefined) {
      if (!Number.isFinite(params.eventTimestamp) || params.eventTimestamp <= 0) {
        return { accepted: false, reason: 'Invalid balance event timestamp.' };
      }
      if (now - params.eventTimestamp > this.staleThresholdMs) {
        return { accepted: false, reason: 'Rejected stale balance event timestamp.' };
      }
    }

    const currentGen = this.snapshot.session_generation ?? 0;
    if (params.sessionGeneration !== undefined) {
      if (!Number.isFinite(params.sessionGeneration) || params.sessionGeneration < 0) {
        return { accepted: false, reason: 'Invalid session generation on balance update.' };
      }
      if (params.sessionGeneration !== currentGen) {
        return {
          accepted: false,
          reason: `Rejected balance update from stale session generation ${params.sessionGeneration}; active generation is ${currentGen}.`,
        };
      }
    }

    const activeConnectionId = this.snapshot.connection_id ?? null;
    const incomingConnectionId = params.connection_id ? String(params.connection_id).trim() : null;
    if (incomingConnectionId && activeConnectionId && incomingConnectionId !== activeConnectionId) {
      return {
        accepted: false,
        reason: `Rejected balance update from mismatched connection_id ${incomingConnectionId}; active connection is ${activeConnectionId}.`,
      };
    }

    const incomingReqId =
      typeof params.req_id === 'number' && Number.isFinite(params.req_id) ? params.req_id : null;
    const reqEntry =
      incomingReqId !== null ? this.pendingBalanceRequests.get(incomingReqId) : undefined;

    if (reqEntry) {
      if (reqEntry.sessionGeneration !== currentGen) {
        return {
          accepted: false,
          reason: `Rejected balance response for stale req_id=${incomingReqId} (gen ${reqEntry.sessionGeneration} != ${currentGen}).`,
        };
      }
      if (activeConnectionId && reqEntry.connectionId && reqEntry.connectionId !== activeConnectionId) {
        return {
          accepted: false,
          reason: `Rejected balance response for req_id=${incomingReqId} from mismatched connection_id ${reqEntry.connectionId}.`,
        };
      }
      if (incomingConnectionId && reqEntry.connectionId && reqEntry.connectionId !== incomingConnectionId) {
        return {
          accepted: false,
          reason: `Rejected balance response for req_id=${incomingReqId}; connection_id ${incomingConnectionId} != ${reqEntry.connectionId}.`,
        };
      }
    }

    const activeLogin = this.snapshot.login_id;
    const activeAccountId = this.snapshot.account_id;
    if (!activeLogin && !activeAccountId) {
      return {
        accepted: false,
        reason: 'Rejected balance update because no Deriv account is currently selected.',
      };
    }

    const knownIds = [activeLogin, activeAccountId].filter(Boolean) as string[];
    const incomingLogin = params.login_id ? String(params.login_id).trim() : null;
    const incomingAccountId = params.account_id ? String(params.account_id).trim() : null;

    if (reqEntry) {
      const reqKnown = [reqEntry.loginId, reqEntry.accountId].filter(Boolean) as string[];
      if (reqKnown.length > 0 && !reqKnown.some((id) => knownIds.includes(id))) {
        return {
          accepted: false,
          reason: `Rejected balance response for req_id=${incomingReqId} bound to previous account ${reqKnown.join('/')}.`,
        };
      }
    }

    if (incomingAccountId && !knownIds.includes(incomingAccountId)) {
      return {
        accepted: false,
        reason: `Rejected balance update for account ${incomingAccountId}; active account is ${activeAccountId || activeLogin}.`,
      };
    }

    const reqIdCorrelated = Boolean(
      reqEntry &&
        reqEntry.sessionGeneration === currentGen &&
        (!activeConnectionId || !reqEntry.connectionId || reqEntry.connectionId === activeConnectionId)
    );
    const connectionIdCorrelated = Boolean(
      incomingConnectionId && activeConnectionId && incomingConnectionId === activeConnectionId
    );
    const hasUnresolvedLoginAlias =
      !activeLogin ||
      (activeLogin === activeAccountId && !CANONICAL_LOGINID_RE.test(activeLogin));

    let nextLoginId = activeLogin;
    if (incomingLogin && !knownIds.includes(incomingLogin)) {
      // Allow binding a canonical WS loginid (e.g. VRTC9866) onto an unresolved REST account_id alias
      // ONLY when explicitly correlated via active req_id or connection_id on the active session.
      if ((reqIdCorrelated || connectionIdCorrelated) && hasUnresolvedLoginAlias) {
        nextLoginId = incomingLogin;
      } else {
        return {
          accepted: false,
          reason: `Rejected balance update for ${incomingLogin}; active account is ${activeLogin || activeAccountId}.`,
        };
      }
    }

    if (!Number.isFinite(params.amount) || params.amount < 0) {
      return { accepted: false, reason: 'Invalid balance amount.' };
    }

    // Reject out-of-order older timestamps for an already LIVE stream in the same session
    if (
      this.snapshot.freshness === 'LIVE' &&
      (this.snapshot.source === 'SUBSCRIPTION' || this.snapshot.source === 'SETTLEMENT') &&
      now < this.snapshot.last_updated
    ) {
      return { accepted: false, reason: 'Rejected out-of-order balance update timestamp.' };
    }

    if (reqEntry && !reqEntry.isSubscription && incomingReqId !== null) {
      this.pendingBalanceRequests.delete(incomingReqId);
    }

    const nextFreshness: BalanceFreshness =
      this.snapshot.freshness === 'RECONCILIATION_PENDING' ? 'RECONCILIATION_PENDING' : 'LIVE';

    this.snapshot = {
      ...this.snapshot,
      login_id: nextLoginId,
      connection_id: incomingConnectionId || activeConnectionId,
      currency: params.currency || this.snapshot.currency || 'USD',
      amount: Number(params.amount.toFixed(2)),
      last_updated: now,
      source: params.source || 'SUBSCRIPTION',
      connection_state: 'ONLINE',
      freshness: nextFreshness,
      session_generation:
        typeof params.sessionGeneration === 'number' ? params.sessionGeneration : currentGen,
    };
    this.emit();
    return { accepted: true };
  }

  public touchHeartbeat(now: number = Date.now(), sessionGeneration?: number): void {
    if (!Number.isFinite(now) || now <= 0) return;
    const currentGen = this.snapshot.session_generation ?? 0;
    if (typeof sessionGeneration === 'number' && sessionGeneration !== currentGen) return;

    if (this.snapshot.freshness === 'LIVE') {
      if (this.snapshot.last_updated > 0 && now - this.snapshot.last_updated > this.staleThresholdMs) {
        this.markStale();
        return;
      }
      if (now >= this.snapshot.last_updated) {
        this.snapshot = {
          ...this.snapshot,
          last_updated: now,
        };
      }
    }
  }

  public markReconciliationPending(): void {
    this.snapshot = {
      ...this.snapshot,
      freshness: 'RECONCILIATION_PENDING',
    };
    this.emit();
  }

  public clearReconciliationPending(liveConfirmedBalance?: number, now: number = Date.now()): void {
    if (typeof liveConfirmedBalance === 'number' && Number.isFinite(liveConfirmedBalance)) {
      this.snapshot = {
        ...this.snapshot,
        amount: Number(liveConfirmedBalance.toFixed(2)),
        last_updated: now,
        source: 'SUBSCRIPTION',
        freshness: 'LIVE',
      };
    } else if (this.snapshot.freshness === 'RECONCILIATION_PENDING') {
      this.snapshot = {
        ...this.snapshot,
        freshness: this.snapshot.source === 'SUBSCRIPTION' || this.snapshot.source === 'SETTLEMENT'
          ? 'LIVE'
          : 'SYNCING',
      };
    }
    this.emit();
  }

  public markStale(): void {
    if (this.snapshot.freshness === 'LIVE' || this.snapshot.freshness === 'SYNCING') {
      this.snapshot = {
        ...this.snapshot,
        freshness: 'STALE',
      };
      this.emit();
    }
  }

  public isFreshForTrading(now: number = Date.now()): boolean {
    const snap = this.getSnapshot(now);
    return (
      snap.connection_state === 'ONLINE' &&
      snap.freshness === 'LIVE' &&
      Number.isFinite(snap.amount) &&
      snap.amount > 0 &&
      Boolean(snap.login_id || snap.account_id)
    );
  }

  public reset(): void {
    this.pendingBalanceRequests.clear();
    this.snapshot = {
      account_id: null,
      login_id: null,
      account_type: null,
      currency: 'USD',
      amount: 0,
      last_updated: 0,
      source: 'NONE',
      connection_state: 'OFFLINE',
      freshness: 'UNAVAILABLE',
      session_generation: 0,
      connection_id: null,
    };
    this.emit();
  }
}

export const balanceManager = new BalanceManager();
