import {
  BalanceSnapshot,
  ConnectionState,
  DerivAuthMethod,
  DerivLinkedAccount,
} from '../types/trading';
import { balanceManager as globalBalanceManager, BalanceManager } from './balanceManager';
import { selectDerivAccount } from './derivAccounts';
import { portfolioReconciler as globalReconciler, PortfolioReconciler } from './portfolioReconciler';
import { TradeProposalQuote } from './riskEngine';

export type DerivMessageCallback = (data: any) => void;

export const DEFAULT_DERIV_APP_ID = '33zsnNh6YJ2HWm30oZZJR';
export const DEFAULT_DERIV_REDIRECT_URL = 'https://deriv-ai-trader-pro.ai.studio/';
export const DERIV_WS_PUBLIC_URL = 'wss://api.derivws.com/trading/v1/options/ws/public';
export const DEFAULT_LEGACY_WS_APP_ID = '1089';

export type RateLimitCategory = 'trading' | 'balance_statement' | 'portfolio_profit' | 'other';

export interface LogicalSubscription {
  key: string;
  payload: Record<string, any>;
  subscriptionId: string | null;
  active: boolean;
}

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: any) => any) | null;
  onmessage: ((ev: any) => any) | null;
  onerror: ((ev: any) => any) | null;
  onclose: ((ev: any) => any) | null;
}

export interface DerivWSOptions {
  wsFactory?: (url: string) => WebSocketLike;
  fetchImpl?: typeof fetch;
  balanceManager?: BalanceManager;
  portfolioReconciler?: PortfolioReconciler;
  requestTimeoutMs?: number;
  autoConnectPublicFeed?: boolean;
}

interface PendingRequestEntry {
  reqId: number;
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  generation: number;
}

const WS_OPEN = 1;
const WS_CONNECTING = 0;

function redactTokenFromLog(msg: string): string {
  return String(msg || '')
    .replace(/(Bearer\s+)[A-Za-z0-9._\-+/=]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:token\d*|otp|authorize)=)[^&\s]+/gi, '$1[REDACTED]');
}

export class DerivWebSocketClient {
  private ws: WebSocketLike | null = null;
  private publicWs: WebSocketLike | null = null;
  private appId: string = DEFAULT_DERIV_APP_ID;
  private redirectUrl: string = DEFAULT_DERIV_REDIRECT_URL;

  // Legacy token held strictly in volatile memory — NEVER written to localStorage/Firestore
  private volatileLegacyToken = '';
  private authMethod: DerivAuthMethod | null = null;
  private sessionExpired = false;
  private sessionAuthenticated = false;
  private selectedAccount: DerivLinkedAccount | null = null;
  private confirmedAccountId: string | null = null;

  private connectionState: ConnectionState = 'OFFLINE';
  private sessionGeneration = 0;
  private publicGeneration = 0;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private publicReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingStartTimestamp = 0;
  private lastLatencyMs = 35;
  private reconnectAttempts = 0;
  private publicReconnectAttempts = 0;

  private listeners: Set<DerivMessageCallback> = new Set();
  private activeSymbol = '1HZ10V';
  private activeGranularity = 60;
  private lastAuthorizeResponse: any = null;
  private linkedAccounts: DerivLinkedAccount[] = [];
  private pendingSendQueue: any[] = [];

  private nextReqId = 1;
  private pendingRequests = new Map<number, PendingRequestEntry>();
  private subscriptions = new Map<string, LogicalSubscription>();
  private rateLimitHistory = new Map<RateLimitCategory, number[]>();

  private wsFactory: (url: string) => WebSocketLike;
  private fetchImpl: typeof fetch;
  private balMgr: BalanceManager;
  private reconciler: PortfolioReconciler;
  private requestTimeoutMs: number;
  private isConnecting = false;
  private isPublicConnecting = false;
  private bootstrapped = false;

  constructor(options: DerivWSOptions = {}) {
    this.wsFactory =
      options.wsFactory ||
      ((url: string) => new WebSocket(url) as unknown as WebSocketLike);
    this.fetchImpl = options.fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : (undefined as any));
    this.balMgr = options.balanceManager || globalBalanceManager;
    this.reconciler = options.portfolioReconciler || globalReconciler;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 20_000;

    if (typeof window !== 'undefined') {
      // Purge any stale insecure legacy token artifacts from previous versions
      try {
        localStorage.removeItem('deriv_api_token');
        localStorage.removeItem('deriv_oauth_pending_success');
      } catch {}

      const savedAppId = localStorage.getItem('deriv_app_id');
      if (savedAppId && savedAppId.trim()) {
        this.appId = savedAppId.trim();
      }
      const savedRedirectUrl = localStorage.getItem('deriv_redirect_url');
      if (savedRedirectUrl && savedRedirectUrl.trim()) {
        this.redirectUrl = savedRedirectUrl.trim();
      }
      try {
        const savedAccounts = localStorage.getItem('deriv_linked_accounts');
        if (savedAccounts) {
          const parsed = JSON.parse(savedAccounts);
          if (Array.isArray(parsed)) {
            this.linkedAccounts = parsed.map(({ token: _omit, ...rest }) => rest);
          }
        }
      } catch {}
    }
  }

  public getSessionGeneration(): number {
    return this.sessionGeneration;
  }

  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  public getBalanceSnapshot(): BalanceSnapshot {
    return this.balMgr.getSnapshot();
  }

  public getSelectedAccount(): DerivLinkedAccount | null {
    return this.selectedAccount;
  }

  public getConfirmedAccountId(): string | null {
    return this.confirmedAccountId;
  }

  public getAuthMethod(): DerivAuthMethod | null {
    return this.authMethod;
  }

  public isTokenExpired(): boolean {
    return this.sessionExpired;
  }

  private setConnectionState(next: ConnectionState): void {
    if (this.connectionState === next) return;
    this.connectionState = next;
    this.balMgr.setConnectionState(next);
    this.emit({ msg_type: 'connection_state', state: next });
  }

  private cleanupSocket(sock: WebSocketLike | null): void {
    if (!sock) return;
    try {
      sock.onopen = null;
      sock.onmessage = null;
      sock.onerror = null;
      sock.onclose = null;
      sock.close();
    } catch {}
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  private rejectPendingRequests(reason: string): void {
    for (const [reqId, entry] of this.pendingRequests.entries()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
      this.pendingRequests.delete(reqId);
    }
  }

  /**
   * Categorizes a WS payload and checks client-side rate budget.
   */
  public checkRateLimit(category: RateLimitCategory, now: number = Date.now()): {
    allowed: boolean;
    retryAfterMs: number;
  } {
    const config: Record<RateLimitCategory, { maxCalls: number; windowMs: number }> = {
      trading: { maxCalls: 8, windowMs: 5000 },
      balance_statement: { maxCalls: 6, windowMs: 5000 },
      portfolio_profit: { maxCalls: 6, windowMs: 5000 },
      other: { maxCalls: 25, windowMs: 5000 },
    };

    const { maxCalls, windowMs } = config[category];
    const history = (this.rateLimitHistory.get(category) || []).filter((t) => now - t < windowMs);
    if (history.length >= maxCalls) {
      const oldest = history[0] || now;
      this.rateLimitHistory.set(category, history);
      return {
        allowed: false,
        retryAfterMs: Math.max(50, windowMs - (now - oldest)),
      };
    }

    history.push(now);
    this.rateLimitHistory.set(category, history);
    return { allowed: true, retryAfterMs: 0 };
  }

  private inferCategory(payload: Record<string, any>): RateLimitCategory {
    if ('buy' in payload || 'sell' in payload || 'proposal' in payload) return 'trading';
    if ('balance' in payload || 'statement' in payload || 'transaction' in payload) {
      return 'balance_statement';
    }
    if ('portfolio' in payload || 'profit_table' in payload || 'proposal_open_contract' in payload) {
      return 'portfolio_profit';
    }
    return 'other';
  }

  public setRedirectUrl(redirectUrl: string): void {
    const cleanUrl = (redirectUrl || DEFAULT_DERIV_REDIRECT_URL).trim() || DEFAULT_DERIV_REDIRECT_URL;
    this.redirectUrl = cleanUrl;
    if (typeof window !== 'undefined') {
      localStorage.setItem('deriv_redirect_url', cleanUrl);
    }
  }

  public setAppAndRedirect(appId: string = DEFAULT_DERIV_APP_ID, redirectUrl?: string): void {
    const cleanAppId = String(appId || DEFAULT_DERIV_APP_ID).trim() || DEFAULT_DERIV_APP_ID;
    this.appId = cleanAppId;
    if (redirectUrl && redirectUrl.trim()) {
      this.redirectUrl = redirectUrl.trim();
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('deriv_app_id', this.appId);
      localStorage.setItem('deriv_redirect_url', this.redirectUrl);
    }
  }

  /**
   * Backward-compatible method for legacy WS v3 token login (volatile memory only).
   */
  public setCredentials(
    token: string,
    appId: string | number = DEFAULT_DERIV_APP_ID,
    redirectUrl?: string
  ): void {
    this.setAppAndRedirect(String(appId || DEFAULT_DERIV_APP_ID), redirectUrl);
    const cleanToken = token ? token.trim() : '';
    if (cleanToken) {
      this.connectWithLegacyToken(cleanToken, String(appId || DEFAULT_DERIV_APP_ID));
    }
  }

  public connectWithLegacyToken(
    token: string,
    appId: string | number = DEFAULT_DERIV_APP_ID
  ): void {
    const cleanToken = token.trim();
    if (!cleanToken) return;

    this.volatileLegacyToken = cleanToken;
    this.authMethod = 'legacy_token';
    this.sessionExpired = false;
    this.sessionAuthenticated = false;
    this.confirmedAccountId = null;
    this.lastAuthorizeResponse = null;
    this.setAppAndRedirect(String(appId || DEFAULT_DERIV_APP_ID));
    this.connectAuthenticatedLegacySocket();
  }

  public getCredentials() {
    // Never expose raw token strings to UI diagnostics
    return {
      token: '',
      hasVolatileToken: Boolean(this.volatileLegacyToken),
      appId: this.appId,
      redirectUrl: this.redirectUrl,
    };
  }

  public hasRealToken(): boolean {
    return Boolean(
      this.volatileLegacyToken ||
        this.authMethod === 'oauth2_pkce' ||
        this.authMethod === 'pat' ||
        (this.sessionAuthenticated && this.confirmedAccountId)
    );
  }

  public isAuthorized(): boolean {
    return Boolean(
      !this.sessionExpired &&
        this.connectionState === 'ONLINE' &&
        this.sessionAuthenticated &&
        (this.confirmedAccountId || this.lastAuthorizeResponse?.loginid)
    );
  }

  public getLinkedAccounts(): DerivLinkedAccount[] {
    return this.linkedAccounts;
  }

  public setLinkedAccounts(accounts: DerivLinkedAccount[]): void {
    // Strip any token field before caching or saving in localStorage
    const sanitized = (accounts || []).map(({ token: _omit, ...rest }) => rest);
    this.linkedAccounts = sanitized;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('deriv_linked_accounts', JSON.stringify(sanitized));
      } catch {}
    }
    this.emit({ msg_type: 'linked_accounts_updated', accounts: sanitized });
  }

  public getSubscriptionStatus(): {
    keys: string[];
    balanceSubscribed: boolean;
    pocSubscribed: boolean;
    txSubscribed: boolean;
    requiredSubscriptionsActive: boolean;
  } {
    const keys: string[] = [];
    let balanceSubscribed = false;
    let pocSubscribed = false;
    let txSubscribed = false;

    for (const sub of this.subscriptions.values()) {
      if (sub.active) {
        keys.push(sub.key);
        if (sub.key === 'balance') balanceSubscribed = true;
        if (sub.key === 'poc') pocSubscribed = true;
        if (sub.key === 'tx') txSubscribed = true;
      }
    }

    return {
      keys,
      balanceSubscribed,
      pocSubscribed,
      txSubscribed,
      requiredSubscriptionsActive: balanceSubscribed && (pocSubscribed || txSubscribed),
    };
  }

  public getRegisteredSubscriptions(): LogicalSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Bootstraps session from server cookie vault (/api/deriv/session).
   */
  public async bootstrapSession(): Promise<void> {
    if (!this.fetchImpl) return;
    try {
      const res = await this.fetchImpl('/api/deriv/session', {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.expired) {
        this.handleAuthRequired('Session token expired. Please re-authenticate.');
        return;
      }
      if (data.authenticated) {
        await this.completeServerSession(data);
      }
    } catch {
      // Non-fatal on initial mount
    }
  }

  /**
   * Consumes sanitized server session metadata (no bearer token in browser),
   * selects account deterministically, seeds provisional balance, and opens OTP WS.
   */
  public async completeServerSession(sessionView: {
    authMethod?: DerivAuthMethod;
    appId?: string;
    accounts?: DerivLinkedAccount[];
    selectedAccountId?: string | null;
    selectedAccount?: DerivLinkedAccount | null;
  }): Promise<{ ok: boolean; error?: string }> {
    this.volatileLegacyToken = '';
    this.sessionExpired = false;
    this.authMethod = sessionView.authMethod || 'oauth2_pkce';
    if (sessionView.appId) {
      this.appId = sessionView.appId;
    }

    const accounts = Array.isArray(sessionView.accounts) ? sessionView.accounts : [];
    this.setLinkedAccounts(accounts);

    const savedId =
      sessionView.selectedAccountId ||
      (typeof window !== 'undefined' ? localStorage.getItem('deriv_active_loginid') : null);
    const sel = selectDerivAccount(accounts, savedId);
    const chosen = sel.selectedAccount || sessionView.selectedAccount || null;

    if (!chosen) {
      this.handleAuthRequired('No eligible Deriv trading accounts found on authenticated profile.');
      return { ok: false, error: 'No eligible Deriv accounts found.' };
    }

    this.selectedAccount = chosen;
    this.confirmedAccountId = null;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('deriv_active_loginid', chosen.account);
      } catch {}
    }

    // Account discovery balance is strictly provisional until live subscription confirms!
    this.balMgr.applyDiscoveryAccount(chosen);

    return this.connectOtpAccountSession(chosen);
  }

  /**
   * Requests an account-specific OTP WebSocket URL and opens it WITHOUT blind post-connect authorize.
   */
  public async connectOtpAccountSession(
    account: DerivLinkedAccount
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.fetchImpl) {
      return { ok: false, error: 'Fetch implementation unavailable for OTP exchange.' };
    }

    const gen = ++this.sessionGeneration;
    this.clearTimers();
    this.cleanupSocket(this.ws);
    this.ws = null;
    this.sessionAuthenticated = false;
    this.confirmedAccountId = null;
    this.isConnecting = true;
    this.setConnectionState('CONNECTING');
    this.rejectPendingRequests('Session rotated during account OTP connection.');

    try {
      const accountKey = encodeURIComponent(account.account_id || account.account);
      const res = await this.fetchImpl(`/api/deriv/accounts/${accountKey}/otp`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (gen !== this.sessionGeneration) {
        return { ok: false, error: 'Stale connection generation aborted.' };
      }

      const body = await res.json().catch(() => ({}));
      if (res.status === 401 || body.authRequired) {
        this.isConnecting = false;
        this.handleAuthRequired(body.error || 'Authentication expired.');
        return { ok: false, error: body.error || 'Authentication expired.' };
      }

      if (!res.ok || !body.wsUrl) {
        this.isConnecting = false;
        this.setConnectionState('RECONNECTING');
        this.scheduleReconnect();
        return { ok: false, error: body.error || 'Failed requesting account-specific OTP URL.' };
      }

      this.openAuthenticatedSocket(body.wsUrl, {
        generation: gen,
        sendAuthorize: false, // CRITICAL: OTP WebSocket URL is already pre-authorized for this account
        expectedAccount: account,
      });

      return { ok: true };
    } catch (err: any) {
      if (gen === this.sessionGeneration) {
        this.isConnecting = false;
        this.setConnectionState('RECONNECTING');
        this.scheduleReconnect();
      }
      return { ok: false, error: redactTokenFromLog(err?.message || 'OTP request error') };
    }
  }

  private connectAuthenticatedLegacySocket(): void {
    if (!this.volatileLegacyToken) return;
    const gen = ++this.sessionGeneration;
    this.clearTimers();
    this.cleanupSocket(this.ws);
    this.ws = null;
    this.sessionAuthenticated = false;
    this.confirmedAccountId = null;
    this.isConnecting = true;
    this.setConnectionState('CONNECTING');
    this.rejectPendingRequests('Session reconnecting.');

    // Legacy WS v3 requires a numeric app_id; fallback to 1089 if OAuth client ID is alphanumeric
    const numericAppId = /^\d+$/.test(this.appId) ? this.appId : DEFAULT_LEGACY_WS_APP_ID;
    const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(numericAppId)}`;

    this.openAuthenticatedSocket(wsUrl, {
      generation: gen,
      sendAuthorize: true,
      expectedAccount: this.selectedAccount,
    });
  }

  private openAuthenticatedSocket(
    wsUrl: string,
    opts: {
      generation: number;
      sendAuthorize: boolean;
      expectedAccount: DerivLinkedAccount | null;
    }
  ): void {
    const { generation, sendAuthorize, expectedAccount } = opts;

    try {
      const sock = this.wsFactory(wsUrl);
      this.ws = sock;

      sock.onopen = () => {
        if (generation !== this.sessionGeneration) {
          this.cleanupSocket(sock);
          return;
        }
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startKeepAlivePing(generation);

        if (sendAuthorize) {
          // Legacy v3 token flow sends authorize explicitly via req_id correlation
          this.sendRawOnSocket(sock, { authorize: this.volatileLegacyToken, req_id: this.nextReqId++ });
        } else if (expectedAccount) {
          // Account-specific OTP flow: DO NOT send a blind post-connect authorize!
          this.sessionAuthenticated = true;
          this.confirmedAccountId = expectedAccount.account;
          this.lastAuthorizeResponse = {
            loginid: expectedAccount.account,
            account_id: expectedAccount.account_id || expectedAccount.account,
            currency: expectedAccount.currency,
            is_virtual: expectedAccount.isVirtual ?? expectedAccount.account_type === 'demo',
            balance: expectedAccount.balance,
          };
          this.setConnectionState('ONLINE');
          this.balMgr.applyAuthorize({
            account_id: expectedAccount.account_id || expectedAccount.account,
            login_id: expectedAccount.account,
            is_virtual: expectedAccount.isVirtual,
            currency: expectedAccount.currency,
            balance: expectedAccount.balance,
            promoteLive: false, // Remains SYNCING until live balance subscription confirms!
          });

          this.emit({ msg_type: 'connected', connected: true });
          this.emit({ msg_type: 'authorize', authorize: this.lastAuthorizeResponse });
          this.emit({ msg_type: 'authorize_success', authorize: this.lastAuthorizeResponse });

          this.initializeAccountSubscriptionsAndReconcile();
          this.flushPendingQueue();
        }
      };

      sock.onmessage = (event: any) => {
        if (generation !== this.sessionGeneration) return;
        this.handleAuthenticatedMessage(event, generation);
      };

      sock.onerror = () => {
        if (generation !== this.sessionGeneration) return;
        this.emit({
          msg_type: 'error',
          error: { message: 'Deriv trading WebSocket connection interrupted.' },
        });
      };

      sock.onclose = (ev: any) => {
        if (generation !== this.sessionGeneration) return;
        this.isConnecting = false;
        if (this.pingTimer) clearInterval(this.pingTimer);
        if (this.pongTimeout) clearTimeout(this.pongTimeout);
        this.rejectPendingRequests('WebSocket connection closed.');
        this.markSubscriptionsInactive();
        this.emit({ msg_type: 'connected', connected: false });

        if (this.sessionExpired || this.connectionState === 'AUTH_REQUIRED' || ev?.code === 4001) {
          this.handleAuthRequired('Deriv session closed due to authentication expiry.');
          return;
        }

        if (this.hasRealToken()) {
          this.setConnectionState('RECONNECTING');
          this.scheduleReconnect();
        } else {
          this.setConnectionState('OFFLINE');
        }
      };
    } catch (err: any) {
      if (generation !== this.sessionGeneration) return;
      this.isConnecting = false;
      console.warn('Authenticated WS init exception:', redactTokenFromLog(err?.message || ''));
      this.setConnectionState('RECONNECTING');
      this.scheduleReconnect();
    }
  }

  private startKeepAlivePing(generation: number): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (generation !== this.sessionGeneration) return;
      this.pingStartTimestamp = Date.now();
      this.send({ ping: 1 });

      if (this.pongTimeout) clearTimeout(this.pongTimeout);
      this.pongTimeout = setTimeout(() => {
        if (generation !== this.sessionGeneration) return;
        console.warn('[derivWS] Heartbeat timeout: no pong within 12s. Reconnecting...');
        this.reconnect();
      }, 12_000);
    }, 20_000);
  }

  private initializeAccountSubscriptionsAndReconcile(): void {
    // Ensure required core streams are registered & subscribed without duplicates
    this.ensureSubscription('balance', { balance: 1, subscribe: 1 });
    this.ensureSubscription('tx', { transaction: 1, subscribe: 1 });
    this.ensureSubscription('poc', { proposal_open_contract: 1, subscribe: 1 });

    // Restore any symbol/contract subscriptions
    for (const sub of this.subscriptions.values()) {
      if (!sub.active) {
        this.sendSubscriptionPayload(sub);
      }
    }

    // Trigger broker reconciliation snapshot for open positions & statements
    this.send({ portfolio: 1 });
    this.send({ statement: 1, limit: 25 });
  }

  private markSubscriptionsInactive(): void {
    for (const sub of this.subscriptions.values()) {
      sub.active = false;
      sub.subscriptionId = null;
    }
  }

  public ensureSubscription(key: string, payload: Record<string, any>): void {
    const existing = this.subscriptions.get(key);
    if (existing && existing.active) {
      return;
    }
    const entry: LogicalSubscription = {
      key,
      payload: { ...payload, subscribe: 1 },
      subscriptionId: existing?.subscriptionId || null,
      active: false,
    };
    this.subscriptions.set(key, entry);

    if (this.ws && this.ws.readyState === WS_OPEN) {
      this.sendSubscriptionPayload(entry);
    }
  }

  private sendSubscriptionPayload(entry: LogicalSubscription): void {
    if (entry.key.startsWith('ticks:')) {
      this.sendOnPublicOrPrimary(entry.payload);
      entry.active = true;
      return;
    }
    if (this.ws && this.ws.readyState === WS_OPEN) {
      entry.active = true;
      this.send(entry.payload);
    }
  }

  public forgetSubscription(key: string): void {
    const entry = this.subscriptions.get(key);
    if (!entry) return;
    if (entry.subscriptionId) {
      if (key.startsWith('ticks:')) {
        this.sendOnPublicOrPrimary({ forget: entry.subscriptionId });
      } else {
        this.send({ forget: entry.subscriptionId });
      }
    }
    this.subscriptions.delete(key);
  }

  private handleAuthenticatedMessage(event: any, generation: number): void {
    if (generation !== this.sessionGeneration) return;

    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }

    let data: any;
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }
    if (!data || typeof data !== 'object') return;

    // Resolve any pending req_id RPC request
    if (typeof data.req_id === 'number') {
      const pending = this.pendingRequests.get(data.req_id);
      if (pending && pending.generation === generation) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(data.req_id);
        if (data.error) {
          pending.reject(new Error(redactTokenFromLog(data.error.message || 'Deriv request error')));
        } else {
          pending.resolve(data);
        }
      }
    }

    // Track subscription IDs returned by Deriv
    if (data.subscription?.id) {
      const subId = String(data.subscription.id);
      if (data.msg_type === 'balance') {
        const sub = this.subscriptions.get('balance');
        if (sub) {
          sub.subscriptionId = subId;
          sub.active = true;
        }
      } else if (data.msg_type === 'transaction') {
        const sub = this.subscriptions.get('tx');
        if (sub) {
          sub.subscriptionId = subId;
          sub.active = true;
        }
      } else if (data.msg_type === 'proposal_open_contract') {
        const poc = this.subscriptions.get('poc');
        if (poc) {
          poc.subscriptionId = subId;
          poc.active = true;
        }
      } else if (data.msg_type === 'tick' && data.tick?.symbol) {
        const tickSub = this.subscriptions.get(`ticks:${data.tick.symbol}`);
        if (tickSub) {
          tickSub.subscriptionId = subId;
          tickSub.active = true;
        }
      }
    }

    if (data.msg_type === 'ping' || data.ping) {
      if (this.pingStartTimestamp > 0) {
        this.lastLatencyMs = Math.max(12, Date.now() - this.pingStartTimestamp);
        this.balMgr.touchHeartbeat();
        this.emit({ msg_type: 'ping_latency', latency: this.lastLatencyMs });
      }
    }

    // Check auth expiry / invalid token errors
    if (
      data.error &&
      (data.error.code === 'InvalidToken' ||
        data.error.code === 'AuthorizationRequired' ||
        data.msg_type === 'authorize' ||
        data.echo_req?.authorize)
    ) {
      const msg = redactTokenFromLog(data.error.message || 'Authorization error');
      this.handleAuthRequired(msg, true);
      this.emit({ msg_type: 'authorize_error', error: { ...data.error, message: msg } });
      return;
    }

    if (data.msg_type === 'authorize' && data.authorize) {
      this.sessionAuthenticated = true;
      this.sessionExpired = false;
      this.lastAuthorizeResponse = data.authorize;
      const currentLoginId = data.authorize.loginid || null;
      this.confirmedAccountId = currentLoginId;

      if (typeof window !== 'undefined' && currentLoginId) {
        try {
          localStorage.setItem('deriv_active_loginid', currentLoginId);
        } catch {}
      }

      if (Array.isArray(data.authorize.account_list) && data.authorize.account_list.length > 0) {
        const existingMap = new Map(this.linkedAccounts.map((a) => [a.account, a]));
        const newAccounts: DerivLinkedAccount[] = data.authorize.account_list.map((acct: any) => {
          const existing = existingMap.get(acct.loginid);
          return {
            account: acct.loginid,
            account_id: acct.loginid,
            currency: acct.currency || existing?.currency || 'USD',
            isVirtual: Boolean(acct.is_virtual),
            account_type: acct.is_virtual ? 'demo' : 'real',
            balance:
              acct.loginid === currentLoginId && typeof data.authorize.balance === 'number'
                ? data.authorize.balance
                : existing?.balance,
            isProvisionalBalance: true,
          };
        });
        this.setLinkedAccounts(newAccounts);
      }

      this.selectedAccount = {
        account: currentLoginId,
        account_id: currentLoginId,
        currency: data.authorize.currency || 'USD',
        isVirtual: Boolean(data.authorize.is_virtual),
        account_type: data.authorize.is_virtual ? 'demo' : 'real',
        balance: typeof data.authorize.balance === 'number' ? data.authorize.balance : undefined,
      };

      this.setConnectionState('ONLINE');
      this.balMgr.applyAuthorize({
        account_id: currentLoginId,
        login_id: currentLoginId,
        is_virtual: Boolean(data.authorize.is_virtual),
        currency: data.authorize.currency || 'USD',
        balance: typeof data.authorize.balance === 'number' ? data.authorize.balance : undefined,
        promoteLive: false,
      });

      this.emit({ msg_type: 'connected', connected: true });
      this.emit({ msg_type: 'authorize_success', authorize: data.authorize });
      this.initializeAccountSubscriptionsAndReconcile();
      this.flushPendingQueue();
    }

    if (data.msg_type === 'balance' && data.balance) {
      const bal = data.balance;
      const numericBal = typeof bal.balance === 'number' ? bal.balance : Number(bal.balance);
      if (Number.isFinite(numericBal)) {
        const applyRes = this.balMgr.applyLiveBalanceUpdate({
          amount: numericBal,
          currency: bal.currency,
          login_id: bal.loginid || null,
          account_id: bal.account_id || null,
          source: 'SUBSCRIPTION',
        });

        if (!applyRes.accepted) {
          // Cross-account update rejected; do not mutate active account balance or emit to UI as active
          return;
        }

        if (this.lastAuthorizeResponse) {
          this.lastAuthorizeResponse.balance = numericBal;
          if (bal.currency) this.lastAuthorizeResponse.currency = bal.currency;
        }
      }
    }

    if (data.msg_type === 'buy' && data.buy && typeof data.buy.balance_after === 'number') {
      this.balMgr.applyLiveBalanceUpdate({
        amount: data.buy.balance_after,
        login_id: this.confirmedAccountId,
        source: 'SETTLEMENT',
      });
    }

    if (data.msg_type === 'sell' && data.sell && typeof data.sell.balance_after === 'number') {
      this.balMgr.applyLiveBalanceUpdate({
        amount: data.sell.balance_after,
        login_id: this.confirmedAccountId,
        source: 'SETTLEMENT',
      });
    }

    if (
      data.msg_type === 'proposal_open_contract' &&
      data.proposal_open_contract &&
      typeof data.proposal_open_contract.balance_after === 'number' &&
      (data.proposal_open_contract.is_sold === 1 ||
        data.proposal_open_contract.status === 'won' ||
        data.proposal_open_contract.status === 'lost' ||
        data.proposal_open_contract.status === 'sold')
    ) {
      this.balMgr.applyLiveBalanceUpdate({
        amount: data.proposal_open_contract.balance_after,
        login_id: this.confirmedAccountId,
        source: 'SETTLEMENT',
      });
    }

    if (data.msg_type === 'transaction' && data.transaction) {
      const tx = data.transaction;
      if (typeof tx.balance_after === 'number') {
        this.balMgr.applyLiveBalanceUpdate({
          amount: tx.balance_after,
          login_id: this.confirmedAccountId,
          source: 'SETTLEMENT',
        });
      }
    }

    this.emit(data);
  }

  private handleAuthRequired(reason: string, expired = true): void {
    this.sessionExpired = expired;
    this.sessionAuthenticated = false;
    this.confirmedAccountId = null;
    this.volatileLegacyToken = '';
    this.lastAuthorizeResponse = null;
    this.clearTimers();
    this.cleanupSocket(this.ws);
    this.ws = null;
    this.markSubscriptionsInactive();
    this.rejectPendingRequests(reason);
    this.setConnectionState('AUTH_REQUIRED');
    this.emit({
      msg_type: 'auth_required',
      authorized: false,
      expired,
      error: { message: reason },
    });
  }

  /**
   * Switches active Deriv account cleanly across OTP server vault or volatile legacy flow.
   */
  public async switchAccount(account: DerivLinkedAccount): Promise<{ ok: boolean; error?: string }> {
    if (!account || (!account.account && !account.account_id)) {
      return { ok: false, error: 'Invalid target account.' };
    }

    const targetId = account.account || account.account_id || '';
    if (typeof window !== 'undefined' && targetId) {
      try {
        localStorage.setItem('deriv_active_loginid', targetId);
      } catch {}
    }

    if (this.authMethod === 'legacy_token' && account.token) {
      this.selectedAccount = account;
      this.balMgr.applyDiscoveryAccount(account);
      this.connectWithLegacyToken(account.token, this.appId);
      return { ok: true };
    }

    if (!this.fetchImpl) {
      return { ok: false, error: 'Server session API unavailable for account switching.' };
    }

    try {
      const res = await this.fetchImpl('/api/deriv/accounts/select', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: targetId }),
      });

      const body = await res.json().catch(() => ({}));
      if (res.status === 401 || body.authRequired) {
        this.handleAuthRequired(body.error || 'Authentication expired.');
        return { ok: false, error: body.error || 'Authentication expired.' };
      }
      if (!res.ok) {
        this.emit({
          msg_type: 'switch_account_error',
          account: targetId,
          error: { message: body.error || 'Account switch failed.' },
        });
        return { ok: false, error: body.error || 'Account switch failed.' };
      }

      const chosen = body.selectedAccount || account;
      this.selectedAccount = chosen;
      this.balMgr.applyDiscoveryAccount(chosen);
      return this.connectOtpAccountSession(chosen);
    } catch (err: any) {
      const msg = redactTokenFromLog(err?.message || 'Account switch failed.');
      this.emit({
        msg_type: 'switch_account_error',
        account: targetId,
        error: { message: msg },
      });
      return { ok: false, error: msg };
    }
  }

  public async resetDemoBalance(accountId?: string): Promise<{ ok: boolean; data?: any; error?: string }> {
    const target = accountId || this.selectedAccount?.account_id || this.selectedAccount?.account;
    if (!target || !this.fetchImpl) {
      return { ok: false, error: 'No active demo account to reset.' };
    }

    const res = await this.fetchImpl(`/api/deriv/accounts/${encodeURIComponent(target)}/reset-demo-balance`, {
      method: 'POST',
      credentials: 'include',
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 || body.authRequired) {
      this.handleAuthRequired(body.error || 'Authentication required.');
      return { ok: false, error: body.error || 'Authentication required.' };
    }
    if (!res.ok) {
      return { ok: false, error: body.error || 'Failed to reset demo balance.' };
    }
    this.refreshBalance();
    return { ok: true, data: body.data };
  }

  public async logout(): Promise<void> {
    this.sessionGeneration++;
    this.clearTimers();
    this.volatileLegacyToken = '';
    this.authMethod = null;
    this.sessionExpired = false;
    this.sessionAuthenticated = false;
    this.selectedAccount = null;
    this.confirmedAccountId = null;
    this.lastAuthorizeResponse = null;
    this.linkedAccounts = [];
    this.pendingSendQueue = [];
    this.subscriptions.clear();
    this.rejectPendingRequests('User logged out.');

    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('deriv_api_token');
        localStorage.removeItem('deriv_active_loginid');
        localStorage.removeItem('deriv_linked_accounts');
        localStorage.removeItem('deriv_oauth_pending_success');
      } catch {}
    }

    if (this.fetchImpl) {
      try {
        await this.fetchImpl('/api/auth/deriv/logout', {
          method: 'POST',
          credentials: 'include',
        });
      } catch {}
    }

    this.cleanupSocket(this.ws);
    this.ws = null;
    this.balMgr.reset();
    this.reconciler.reset();
    this.setConnectionState('OFFLINE');
    this.emit({ msg_type: 'deriv_logout' });
    this.emit({ msg_type: 'logged_out', success: true });
    this.emit({ msg_type: 'linked_accounts_updated', accounts: [] });
  }

  /**
   * Public Market Feed WebSocket (wss://api.derivws.com/trading/v1/options/ws/public)
   * Keeps market candles and ticks streaming independently of trading auth state.
   */
  public connectPublicFeed(): void {
    if (typeof window === 'undefined' && !this.wsFactory) return;
    if (
      this.publicWs &&
      (this.publicWs.readyState === WS_OPEN || this.publicWs.readyState === WS_CONNECTING)
    ) {
      return;
    }

    const gen = ++this.publicGeneration;
    this.isPublicConnecting = true;
    this.cleanupSocket(this.publicWs);

    try {
      const sock = this.wsFactory(DERIV_WS_PUBLIC_URL);
      this.publicWs = sock;

      sock.onopen = () => {
        if (gen !== this.publicGeneration) {
          this.cleanupSocket(sock);
          return;
        }
        this.isPublicConnecting = false;
        this.publicReconnectAttempts = 0;
        this.fetchCandles(this.activeSymbol, this.activeGranularity);
        this.subscribeTicks(this.activeSymbol);
      };

      sock.onmessage = (event: any) => {
        if (gen !== this.publicGeneration) return;
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (!data || typeof data !== 'object') return;
          if (data.msg_type === 'tick' && data.tick?.symbol && data.subscription?.id) {
            const sub = this.subscriptions.get(`ticks:${data.tick.symbol}`);
            if (sub) {
              sub.subscriptionId = String(data.subscription.id);
              sub.active = true;
            }
          }
          this.emit(data);
        } catch {}
      };

      sock.onerror = () => {
        if (gen !== this.publicGeneration) return;
      };

      sock.onclose = () => {
        if (gen !== this.publicGeneration) return;
        this.isPublicConnecting = false;
        if (this.publicReconnectTimer) clearTimeout(this.publicReconnectTimer);
        this.publicReconnectAttempts++;
        const delay = Math.min(12000, 1500 * Math.pow(1.5, Math.min(this.publicReconnectAttempts, 5)));
        this.publicReconnectTimer = setTimeout(() => {
          this.connectPublicFeed();
        }, delay);
      };
    } catch {
      this.isPublicConnecting = false;
    }
  }

  public connect(): void {
    this.connectPublicFeed();
    if (!this.bootstrapped && typeof window !== 'undefined') {
      this.bootstrapped = true;
      void this.bootstrapSession();
    } else if (this.authMethod === 'legacy_token' && this.volatileLegacyToken) {
      if (!this.ws || (this.ws.readyState !== WS_OPEN && this.ws.readyState !== WS_CONNECTING)) {
        this.connectAuthenticatedLegacySocket();
      }
    } else if (
      (this.authMethod === 'oauth2_pkce' || this.authMethod === 'pat') &&
      this.selectedAccount &&
      !this.sessionExpired &&
      (!this.ws || (this.ws.readyState !== WS_OPEN && this.ws.readyState !== WS_CONNECTING))
    ) {
      void this.connectOtpAccountSession(this.selectedAccount);
    }
  }

  /**
   * Correlated RPC request with req_id, rate-limit budgeting, and 20s timeout.
   */
  public request<T = any>(
    payload: Record<string, any>,
    options: { timeoutMs?: number; category?: RateLimitCategory } = {}
  ): Promise<T> {
    const category = options.category || this.inferCategory(payload);
    const rate = this.checkRateLimit(category);
    if (!rate.allowed) {
      return Promise.reject(
        new Error(`Client rate budget exceeded for ${category}. Retry after ${rate.retryAfterMs}ms.`)
      );
    }

    if (!this.ws || this.ws.readyState !== WS_OPEN) {
      return Promise.reject(new Error('Deriv authenticated WebSocket is not open.'));
    }

    const reqId = this.nextReqId++;
    const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs;
    const generation = this.sessionGeneration;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new Error(`Deriv request timed out after ${timeoutMs}ms (req_id=${reqId}).`));
      }, timeoutMs);

      this.pendingRequests.set(reqId, {
        reqId,
        resolve,
        reject,
        timer,
        generation,
      });

      try {
        this.ws!.send(JSON.stringify({ ...payload, req_id: reqId }));
      } catch (err: any) {
        clearTimeout(timer);
        this.pendingRequests.delete(reqId);
        reject(new Error(redactTokenFromLog(err?.message || 'Failed sending request')));
      }
    });
  }

  public async requestProposalQuote(params: {
    symbol: string;
    amount: number;
    contract_type: 'CALL' | 'PUT';
    duration: number;
    duration_unit: 'm' | 's' | 't';
    currency?: string;
  }): Promise<TradeProposalQuote> {
    const res = await this.request<any>(
      {
        proposal: 1,
        amount: params.amount,
        basis: 'stake',
        contract_type: params.contract_type,
        currency: params.currency || this.selectedAccount?.currency || 'USD',
        duration: params.duration,
        duration_unit: params.duration_unit,
        symbol: params.symbol,
      },
      { category: 'trading' }
    );

    const p = res?.proposal;
    if (!p?.id) {
      throw new Error('Deriv proposal response missing proposal ID.');
    }

    const now = Date.now();
    return {
      proposalId: String(p.id),
      askPrice: Number(p.ask_price ?? params.amount),
      payout: typeof p.payout === 'number' ? Number(p.payout) : undefined,
      symbol: params.symbol,
      currency: params.currency || this.selectedAccount?.currency || 'USD',
      accountId: this.confirmedAccountId || undefined,
      fetchedAt: now,
      expiresAt: now + 15_000,
    };
  }

  public async requestReconciliationSnapshot(): Promise<{
    openContracts: any[];
    settledTransactions: any[];
  }> {
    const [portRes, stmtRes] = await Promise.allSettled([
      this.request<any>({ portfolio: 1 }, { category: 'portfolio_profit' }),
      this.request<any>({ statement: 1, limit: 25 }, { category: 'balance_statement' }),
    ]);

    const openContracts =
      portRes.status === 'fulfilled' && Array.isArray(portRes.value?.portfolio?.contracts)
        ? portRes.value.portfolio.contracts
        : [];
    const settledTransactions =
      stmtRes.status === 'fulfilled' && Array.isArray(stmtRes.value?.statement?.transactions)
        ? stmtRes.value.statement.transactions
        : [];

    return { openContracts, settledTransactions };
  }

  public async testToken(
    testTokenStr: string,
    targetAppId: string | number = DEFAULT_DERIV_APP_ID
  ): Promise<{ success: boolean; authorize?: any; error?: string }> {
    const cleanTok = testTokenStr.trim();
    if (!cleanTok) {
      return { success: false, error: 'Token is required.' };
    }

    const numericAppId = /^\d+$/.test(String(targetAppId)) ? String(targetAppId) : DEFAULT_LEGACY_WS_APP_ID;
    const testWsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(numericAppId)}`;

    return new Promise((resolve) => {
      let testWs: WebSocketLike | null = null;
      let finished = false;

      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          this.cleanupSocket(testWs);
          resolve({ success: false, error: 'Connection timed out testing Deriv token.' });
        }
      }, 7000);

      try {
        testWs = this.wsFactory(testWsUrl);
        testWs.onopen = () => {
          if (testWs && testWs.readyState === WS_OPEN) {
            testWs.send(JSON.stringify({ authorize: cleanTok }));
          }
        };
        testWs.onmessage = (event: any) => {
          if (finished) return;
          try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            if (data.msg_type === 'authorize' && data.authorize) {
              finished = true;
              clearTimeout(timer);
              this.cleanupSocket(testWs);
              resolve({ success: true, authorize: data.authorize });
            } else if (data.error) {
              finished = true;
              clearTimeout(timer);
              this.cleanupSocket(testWs);
              resolve({
                success: false,
                error: redactTokenFromLog(data.error.message || 'Authorization failed'),
              });
            }
          } catch {
            finished = true;
            clearTimeout(timer);
            this.cleanupSocket(testWs);
            resolve({ success: false, error: 'Failed parsing authorization response.' });
          }
        };
        testWs.onerror = () => {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            this.cleanupSocket(testWs);
            resolve({ success: false, error: 'WebSocket connection failed during test.' });
          }
        };
      } catch (err: any) {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          resolve({ success: false, error: redactTokenFromLog(err?.message || 'WebSocket init error') });
        }
      }
    });
  }

  public getDiagnostics() {
    const balSnap = this.balMgr.getSnapshot();
    return {
      connected: !!this.ws && this.ws.readyState === WS_OPEN,
      publicConnected: !!this.publicWs && this.publicWs.readyState === WS_OPEN,
      connectionState: this.connectionState,
      authMethod: this.authMethod,
      sessionGeneration: this.sessionGeneration,
      appId: this.appId,
      hasToken: this.hasRealToken(),
      tokenMasked: this.hasRealToken() ? `${this.authMethod || 'session'} (protected)` : 'Not Connected',
      latencyMs: this.lastLatencyMs,
      authorized: this.isAuthorized(),
      authDetails: this.lastAuthorizeResponse,
      balanceSnapshot: balSnap,
      subscriptions: this.getSubscriptionStatus(),
    };
  }

  public isConnected(): boolean {
    return (
      (!!this.ws && this.ws.readyState === WS_OPEN) ||
      (!!this.publicWs && this.publicWs.readyState === WS_OPEN)
    );
  }

  public isTradingSessionConnected(): boolean {
    return !!this.ws && this.ws.readyState === WS_OPEN && this.connectionState === 'ONLINE';
  }

  public refreshBalance(): void {
    if (this.ws && this.ws.readyState === WS_OPEN && this.sessionAuthenticated) {
      this.send({ balance: 1 });
    }
  }

  public subscribe(callback: DerivMessageCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private emit(data: any): void {
    this.listeners.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error('Listener callback error:', err);
      }
    });
  }

  private sendRawOnSocket(sock: WebSocketLike, payload: any): void {
    sock.send(JSON.stringify(payload));
  }

  private flushPendingQueue(): void {
    while (this.pendingSendQueue.length > 0 && this.ws && this.ws.readyState === WS_OPEN) {
      const queued = this.pendingSendQueue.shift();
      try {
        this.send(queued);
      } catch {}
    }
  }

  private sendOnPublicOrPrimary(payload: any): void {
    if (this.publicWs && this.publicWs.readyState === WS_OPEN) {
      try {
        this.publicWs.send(JSON.stringify(payload));
        return;
      } catch {}
    }
    if (this.ws && this.ws.readyState === WS_OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch {}
    }
  }

  public send(payload: any): void {
    const category = this.inferCategory(payload);
    const rate = this.checkRateLimit(category);
    if (!rate.allowed) {
      console.warn(`[derivWS] Rate budget reached for ${category}; deferring send`);
      if (this.pendingSendQueue.length < 25) {
        this.pendingSendQueue.push(payload);
      }
      return;
    }

    const withReqId = typeof payload.req_id === 'number' ? payload : { ...payload, req_id: this.nextReqId++ };

    if (this.ws && this.ws.readyState === WS_OPEN) {
      try {
        this.ws.send(JSON.stringify(withReqId));
      } catch (err: any) {
        console.error('Failed to send payload to Deriv WS:', redactTokenFromLog(err?.message || ''));
      }
    } else if (!this.sessionExpired && this.pendingSendQueue.length < 25) {
      this.pendingSendQueue.push(withReqId);
    }
  }

  public fetchCandles(symbol: string, granularity = 60, count = 200): void {
    this.activeSymbol = symbol;
    this.activeGranularity = granularity;
    this.sendOnPublicOrPrimary({
      ticks_history: symbol,
      end: 'latest',
      count,
      style: 'candles',
      granularity,
    });
  }

  public subscribeTicks(symbol: string): void {
    if (this.activeSymbol && this.activeSymbol !== symbol) {
      this.forgetSubscription(`ticks:${this.activeSymbol}`);
      this.sendOnPublicOrPrimary({ forget_all: 'ticks' });
    }
    this.activeSymbol = symbol;
    this.ensureSubscription(`ticks:${symbol}`, { ticks: symbol, subscribe: 1 });
  }

  public requestProposal(params: {
    symbol: string;
    amount: number;
    contract_type: 'CALL' | 'PUT';
    duration: number;
    duration_unit: 'm' | 's' | 't';
    currency?: string;
  }): void {
    this.send({
      proposal: 1,
      amount: params.amount,
      basis: 'stake',
      contract_type: params.contract_type,
      currency: params.currency || this.selectedAccount?.currency || 'USD',
      duration: params.duration,
      duration_unit: params.duration_unit,
      symbol: params.symbol,
      subscribe: 1,
    });
  }

  public buyContract(proposalId: string, price: number): void {
    this.send({
      buy: proposalId,
      price,
      subscribe: 1,
    });
  }

  public buyContractDirect(params: {
    contract_type: 'CALL' | 'PUT';
    symbol: string;
    duration: number;
    duration_unit: 't' | 's' | 'm';
    amount: number;
    currency?: string;
  }): void {
    this.send({
      buy: 1,
      price: params.amount,
      parameters: {
        amount: params.amount,
        basis: 'stake',
        contract_type: params.contract_type,
        currency: params.currency || this.selectedAccount?.currency || 'USD',
        duration: params.duration,
        duration_unit: params.duration_unit,
        symbol: params.symbol,
      },
      subscribe: 1,
    });
  }

  public subscribeProposalOpenContract(contractId?: number | string): void {
    if (contractId !== undefined && contractId !== null) {
      this.ensureSubscription(`poc:${contractId}`, {
        proposal_open_contract: 1,
        contract_id: Number(contractId),
        subscribe: 1,
      });
    } else {
      this.ensureSubscription('poc', {
        proposal_open_contract: 1,
        subscribe: 1,
      });
    }
  }

  public forgetProposalOpenContract(subscriptionId?: string): void {
    if (subscriptionId) {
      this.send({ forget: subscriptionId });
    }
  }

  public sellContract(contractId: number | string, price: number = 0): void {
    this.send({
      sell: Number(contractId),
      price,
    });
  }

  private scheduleReconnect(): void {
    if (this.sessionExpired || this.connectionState === 'AUTH_REQUIRED') return;
    if (!this.hasRealToken()) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempts++;

    const baseDelay = Math.min(15_000, 1200 * Math.pow(1.6, Math.min(this.reconnectAttempts, 5)));
    const jitter = Math.floor(Math.random() * 600);
    const delay = Math.round(baseDelay + jitter);

    this.reconnectTimer = setTimeout(() => {
      if (this.sessionExpired || this.connectionState === 'AUTH_REQUIRED') return;
      if (this.authMethod === 'legacy_token' && this.volatileLegacyToken) {
        this.connectAuthenticatedLegacySocket();
      } else if (this.selectedAccount) {
        void this.connectOtpAccountSession(this.selectedAccount);
      }
    }, delay);
  }

  public reconnect(): void {
    this.sessionGeneration++;
    this.clearTimers();
    this.cleanupSocket(this.ws);
    this.ws = null;
    this.isConnecting = false;
    this.markSubscriptionsInactive();

    if (this.sessionExpired) {
      this.setConnectionState('AUTH_REQUIRED');
      return;
    }

    if (this.authMethod === 'legacy_token' && this.volatileLegacyToken) {
      this.connectAuthenticatedLegacySocket();
    } else if (this.selectedAccount && (this.authMethod === 'oauth2_pkce' || this.authMethod === 'pat')) {
      void this.connectOtpAccountSession(this.selectedAccount);
    }
  }

  public disconnect(): void {
    void this.logout();
  }

  public getLastLatency(): number {
    return this.lastLatencyMs || 32;
  }
}

export const derivWS = new DerivWebSocketClient();
