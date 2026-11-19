import {
  BalanceFreshness,
  BalanceSnapshot,
  BalanceSource,
  ConnectionState,
  DerivLinkedAccount,
} from '../types/trading';

export const DEFAULT_BALANCE_STALE_MS = 45_000;

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
  };

  private staleThresholdMs: number;
  private listeners: Set<(snapshot: BalanceSnapshot) => void> = new Set();

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

  public setConnectionState(connectionState: ConnectionState, now: number = Date.now()): void {
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
    };
    this.emit();
  }

  /**
   * Account discovery balances are treated strictly as provisional (SYNCING)
   * until a live balance subscription confirms them for the selected account.
   */
  public applyDiscoveryAccount(account: DerivLinkedAccount, now: number = Date.now()): void {
    const accountId = account.account_id || account.account;
    const loginId = account.account || account.account_id || null;
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
    },
    now: number = Date.now()
  ): void {
    const loginId = params.login_id;
    const accountId = params.account_id || loginId;
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
    };
    this.emit();
  }

  /**
   * Authoritative balance stream or broker settlement update.
   * Rejects cross-account updates that do not match the selected active account!
   */
  public applyLiveBalanceUpdate(
    params: {
      amount: number;
      currency?: string;
      login_id?: string | null;
      account_id?: string | null;
      source?: Extract<BalanceSource, 'SUBSCRIPTION' | 'SETTLEMENT'>;
    },
    now: number = Date.now()
  ): { accepted: boolean; reason?: string } {
    const incomingId = params.login_id || params.account_id || null;
    const activeLogin = this.snapshot.login_id;
    const activeAccountId = this.snapshot.account_id;

    if (
      incomingId &&
      (activeLogin || activeAccountId) &&
      incomingId !== activeLogin &&
      incomingId !== activeAccountId
    ) {
      return {
        accepted: false,
        reason: `Rejected balance update for ${incomingId}; active account is ${activeLogin || activeAccountId}.`,
      };
    }

    if (!Number.isFinite(params.amount)) {
      return { accepted: false, reason: 'Invalid non-finite balance amount.' };
    }

    const nextFreshness: BalanceFreshness =
      this.snapshot.freshness === 'RECONCILIATION_PENDING' ? 'RECONCILIATION_PENDING' : 'LIVE';

    this.snapshot = {
      ...this.snapshot,
      currency: params.currency || this.snapshot.currency || 'USD',
      amount: Number(params.amount.toFixed(2)),
      last_updated: now,
      source: params.source || 'SUBSCRIPTION',
      connection_state: 'ONLINE',
      freshness: nextFreshness,
    };
    this.emit();
    return { accepted: true };
  }

  public touchHeartbeat(now: number = Date.now()): void {
    if (this.snapshot.freshness === 'LIVE') {
      this.snapshot = {
        ...this.snapshot,
        last_updated: now,
      };
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
    };
    this.emit();
  }
}

export const balanceManager = new BalanceManager();
