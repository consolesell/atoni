import { DerivLinkedAccount } from '../types/trading';

export type DerivMessageCallback = (data: any) => void;

export const DEFAULT_DERIV_APP_ID = '33zsnNh6YJ2HWm30oZZJR';
export const DEFAULT_DERIV_REDIRECT_URL = 'https://deriv-ai-trader-pro.ai.studio/';

class DerivWebSocketClient {
  private ws: WebSocket | null = null;
  private appId: string = DEFAULT_DERIV_APP_ID;
  private redirectUrl: string = DEFAULT_DERIV_REDIRECT_URL;
  private token = '';
  private isConnecting = false;
  private reconnectTimer: any = null;
  private pingTimer: any = null;
  private pingStartTimestamp = 0;
  private lastLatencyMs = 35;
  private listeners: Set<DerivMessageCallback> = new Set();
  private activeSymbol = 'R_25';
  private activeGranularity = 900;
  private lastAuthorizeResponse: any = null;
  private linkedAccounts: DerivLinkedAccount[] = [];
  private reconnectAttempts = 0;
  private pongTimeout: any = null;
  private pendingSendQueue: any[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const savedToken = localStorage.getItem('deriv_api_token');
      if (savedToken) this.token = savedToken.trim();
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
          this.linkedAccounts = JSON.parse(savedAccounts);
        }
      } catch {}
    }
  }

  public setCredentials(
    token: string,
    appId: string | number = DEFAULT_DERIV_APP_ID,
    redirectUrl?: string
  ) {
    this.token = token ? token.trim() : '';
    this.lastAuthorizeResponse = null;
    const cleanAppId = String(appId || DEFAULT_DERIV_APP_ID).trim();
    this.appId = cleanAppId || DEFAULT_DERIV_APP_ID;
    if (redirectUrl && redirectUrl.trim()) {
      this.redirectUrl = redirectUrl.trim();
    }

    if (typeof window !== 'undefined') {
      if (this.token) localStorage.setItem('deriv_api_token', this.token);
      else localStorage.removeItem('deriv_api_token');
      localStorage.setItem('deriv_app_id', this.appId);
      localStorage.setItem('deriv_redirect_url', this.redirectUrl);
    }
    this.reconnect();
  }

  public setRedirectUrl(redirectUrl: string) {
    const cleanUrl = (redirectUrl || DEFAULT_DERIV_REDIRECT_URL).trim() || DEFAULT_DERIV_REDIRECT_URL;
    this.redirectUrl = cleanUrl;
    if (typeof window !== 'undefined') {
      localStorage.setItem('deriv_redirect_url', cleanUrl);
    }
  }

  public getCredentials() {
    return { token: this.token, appId: this.appId, redirectUrl: this.redirectUrl };
  }

  public hasRealToken(): boolean {
    return Boolean(this.token && this.token.trim().length > 0);
  }

  public isAuthorized(): boolean {
    return Boolean(this.token && this.token.trim().length > 0 && this.lastAuthorizeResponse?.loginid);
  }

  public getLinkedAccounts(): DerivLinkedAccount[] {
    return this.linkedAccounts;
  }

  public setLinkedAccounts(accounts: DerivLinkedAccount[]) {
    this.linkedAccounts = accounts;
    if (typeof window !== 'undefined') {
      localStorage.setItem('deriv_linked_accounts', JSON.stringify(accounts));
    }
    this.emit({ msg_type: 'linked_accounts_updated', accounts });
  }

  public switchAccount(account: DerivLinkedAccount) {
    if (!account?.token) {
      this.emit({
        msg_type: 'switch_account_error',
        account: account?.account,
        error: {
          message: `Account ${account?.account || ''} does not have a saved OAuth token. Re-authenticate via Deriv OAuth or paste an API token for this account.`,
        },
      });
      return;
    }

    this.token = account.token.trim();
    this.lastAuthorizeResponse = null;

    if (typeof window !== 'undefined') {
      localStorage.setItem('deriv_api_token', this.token);
      localStorage.setItem('deriv_active_loginid', account.account);
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ forget_all: 'balance' });
      this.send({ forget_all: 'proposal_open_contract' });
      this.send({ authorize: this.token });
    } else {
      this.reconnect();
    }
  }

  public logout() {
    this.token = '';
    this.lastAuthorizeResponse = null;
    this.linkedAccounts = [];
    if (typeof window !== 'undefined') {
      localStorage.removeItem('deriv_api_token');
      localStorage.removeItem('deriv_active_loginid');
      localStorage.removeItem('deriv_linked_accounts');
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.send({ forget_all: 'balance' });
        this.send({ forget_all: 'proposal_open_contract' });
        this.send({ logout: 1 });
      } catch {}
    }
    this.emit({ msg_type: 'deriv_logout' });
    this.emit({ msg_type: 'linked_accounts_updated', accounts: [] });
    this.reconnect();
  }

  /**
   * Test a Deriv token live without committing to it
   */
  public async testToken(
    testTokenStr: string,
    targetAppId: string | number = DEFAULT_DERIV_APP_ID
  ): Promise<{ success: boolean; authorize?: any; error?: string }> {
    return new Promise((resolve) => {
      const cleanAppId = encodeURIComponent(String(targetAppId || DEFAULT_DERIV_APP_ID).trim());
      const testWsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${cleanAppId}`;
      let testWs: WebSocket | null = null;
      let finished = false;

      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          try {
            if (testWs) testWs.close();
          } catch {}
          resolve({ success: false, error: 'Connection timed out testing Deriv token.' });
        }
      }, 7000);

      try {
        testWs = new WebSocket(testWsUrl);
        testWs.onopen = () => {
          if (testWs && testWs.readyState === WebSocket.OPEN) {
            testWs.send(JSON.stringify({ authorize: testTokenStr.trim() }));
          }
        };

        testWs.onmessage = (event) => {
          if (finished) return;
          try {
            const data = JSON.parse(event.data);
            if (data.msg_type === 'authorize' && data.authorize) {
              finished = true;
              clearTimeout(timer);
              try {
                testWs?.close();
              } catch {}
              resolve({ success: true, authorize: data.authorize });
            } else if (data.error) {
              finished = true;
              clearTimeout(timer);
              try {
                testWs?.close();
              } catch {}
              resolve({ success: false, error: data.error.message || 'Authorization failed' });
            }
          } catch {
            finished = true;
            clearTimeout(timer);
            try {
              testWs?.close();
            } catch {}
            resolve({ success: false, error: 'Failed parsing authorization response.' });
          }
        };

        testWs.onerror = () => {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            resolve({ success: false, error: 'WebSocket connection failed during test.' });
          }
        };
      } catch (err: any) {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          resolve({ success: false, error: err?.message || 'WebSocket instantiation error' });
        }
      }
    });
  }

  public getDiagnostics() {
    return {
      connected: !!this.ws && this.ws.readyState === WebSocket.OPEN,
      appId: this.appId,
      hasToken: !!this.token,
      tokenMasked: this.token
        ? `${this.token.slice(0, 8)}...${this.token.slice(-6)}`
        : 'Not Connected',
      latencyMs: this.lastLatencyMs,
      authorized: this.isAuthorized(),
      authDetails: this.lastAuthorizeResponse,
    };
  }

  public isConnected(): boolean {
    return !!this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING);
  }

  public refreshBalance() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.token) {
      this.send({ balance: 1 });
      this.send({ balance: 1, account: 'all' });
    }
  }

  public subscribe(callback: DerivMessageCallback) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private emit(data: any) {
    this.listeners.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error('Listener callback error:', err);
      }
    });
  }

  public connect(): void {
    if (typeof window === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isConnecting = true;
    const cleanAppId = encodeURIComponent(String(this.appId || DEFAULT_DERIV_APP_ID).trim());
    const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${cleanAppId}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;

        this.emit({ msg_type: 'connected', connected: true });

        // Start Keep-Alive Ping every 20 seconds with active Heartbeat Watchdog
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          this.pingStartTimestamp = Date.now();
          this.send({ ping: 1 });

          if (this.pongTimeout) clearTimeout(this.pongTimeout);
          this.pongTimeout = setTimeout(() => {
            console.warn('[derivWS] Heartbeat watchdog timeout: no pong received in 12s. Reconnecting...');
            this.reconnect();
          }, 12000);
        }, 20000);

        // Flush any queued payloads buffered during reconnect
        while (this.pendingSendQueue.length > 0) {
          const queued = this.pendingSendQueue.shift();
          try {
            this.send(queued);
          } catch {}
        }

        // Authorize strictly with real user Deriv token (Demo VRTC or Real CR)
        if (this.token) {
          this.send({ authorize: this.token });
        } else {
          this.lastAuthorizeResponse = null;
          this.emit({
            msg_type: 'auth_required',
            authorized: false,
          });
        }

        // Public Deriv market feed works immediately for live candles & ticks
        this.fetchCandles(this.activeSymbol, this.activeGranularity);
        this.subscribeTicks(this.activeSymbol);
      };

      this.ws.onmessage = (event) => {
        if (this.pongTimeout) {
          clearTimeout(this.pongTimeout);
          this.pongTimeout = null;
        }

        try {
          const data = JSON.parse(event.data);

          if (data.msg_type === 'ping' || data.ping) {
            if (this.pingStartTimestamp > 0) {
              this.lastLatencyMs = Math.max(12, Date.now() - this.pingStartTimestamp);
              this.emit({ msg_type: 'ping_latency', latency: this.lastLatencyMs });
            }
          }

          if (data.msg_type === 'authorize' && data.authorize) {
            this.lastAuthorizeResponse = data.authorize;
            const currentLoginId = data.authorize.loginid;

            if (typeof window !== 'undefined' && currentLoginId) {
              localStorage.setItem('deriv_active_loginid', currentLoginId);
            }

            if (Array.isArray(data.authorize.account_list) && data.authorize.account_list.length > 0) {
              const existingMap = new Map(this.linkedAccounts.map((a) => [a.account, a]));
              const newAccounts: DerivLinkedAccount[] = data.authorize.account_list.map((acct: any) => {
                const existing = existingMap.get(acct.loginid);
                return {
                  account: acct.loginid,
                  token: acct.loginid === currentLoginId ? this.token : existing?.token || '',
                  currency: acct.currency || existing?.currency || 'USD',
                  isVirtual: Boolean(acct.is_virtual),
                  balance:
                    acct.loginid === currentLoginId && typeof data.authorize.balance === 'number'
                      ? data.authorize.balance
                      : existing?.balance,
                };
              });
              this.setLinkedAccounts(newAccounts);
            } else if (currentLoginId) {
              const existingIdx = this.linkedAccounts.findIndex((a) => a.account === currentLoginId);
              const nextEntry: DerivLinkedAccount = {
                account: currentLoginId,
                token: this.token,
                currency: data.authorize.currency || 'USD',
                isVirtual: Boolean(data.authorize.is_virtual),
                balance: typeof data.authorize.balance === 'number' ? data.authorize.balance : undefined,
              };
              const updated =
                existingIdx >= 0
                  ? this.linkedAccounts.map((a, idx) => (idx === existingIdx ? { ...a, ...nextEntry } : a))
                  : [...this.linkedAccounts, nextEntry];
              this.setLinkedAccounts(updated);
            }

            // Reset any prior subscriptions and subscribe to live continuous balance & POC updates
            this.send({ forget_all: 'balance' });
            this.send({ forget_all: 'proposal_open_contract' });
            this.send({ balance: 1, subscribe: 1 });
            this.send({ balance: 1, account: 'all' });
            this.send({ proposal_open_contract: 1, subscribe: 1 });
            this.emit({ msg_type: 'authorize_success', authorize: data.authorize });
          }

          // Continuous single-account & multi-account ("account: 'all'") balance sync
          if (data.msg_type === 'balance' && data.balance) {
            const bal = data.balance;

            // Update active authorized balance in memory when loginid matches or is primary stream
            if (
              this.lastAuthorizeResponse &&
              typeof bal.balance === 'number' &&
              (!bal.loginid || bal.loginid === this.lastAuthorizeResponse.loginid)
            ) {
              this.lastAuthorizeResponse.balance = bal.balance;
              if (bal.currency) this.lastAuthorizeResponse.currency = bal.currency;
            }

            // Update all linked account balances if returned from { balance: 1, account: 'all' }
            if (bal.accounts && typeof bal.accounts === 'object' && this.linkedAccounts.length > 0) {
              let changed = false;
              const updatedAccounts = this.linkedAccounts.map((acc) => {
                const entry = bal.accounts[acc.account];
                if (entry && typeof entry.balance === 'number') {
                  if (acc.balance !== entry.balance || (entry.currency && acc.currency !== entry.currency)) {
                    changed = true;
                  }
                  return {
                    ...acc,
                    balance: entry.balance,
                    currency: entry.currency || acc.currency,
                  };
                }
                return acc;
              });
              if (changed) {
                this.setLinkedAccounts(updatedAccounts);
              }
            } else if (bal.loginid && typeof bal.balance === 'number' && this.linkedAccounts.length > 0) {
              let changed = false;
              const updatedAccounts = this.linkedAccounts.map((acc) => {
                if (acc.account === bal.loginid) {
                  if (acc.balance !== bal.balance || (bal.currency && acc.currency !== bal.currency)) {
                    changed = true;
                  }
                  return {
                    ...acc,
                    balance: bal.balance,
                    currency: bal.currency || acc.currency,
                  };
                }
                return acc;
              });
              if (changed) {
                this.setLinkedAccounts(updatedAccounts);
              }
            }
          }

          if (data.error && (data.msg_type === 'authorize' || data.echo_req?.authorize)) {
            console.warn('Deriv authorization error:', data.error.message);
            this.lastAuthorizeResponse = null;
            this.emit({
              msg_type: 'authorize_error',
              error: data.error,
            });
          }

          this.emit(data);
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('Deriv WebSocket connection error:', err);
        this.emit({
          msg_type: 'error',
          error: { message: 'Deriv WebSocket connection interrupted. Reconnecting to wss://ws.derivws.com...' },
        });
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        if (this.pingTimer) clearInterval(this.pingTimer);
        if (this.pongTimeout) clearTimeout(this.pongTimeout);
        this.emit({ msg_type: 'connected', connected: false });
        this.scheduleReconnect();
      };
    } catch (err) {
      console.warn('WebSocket init exception:', err);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  public send(payload: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (err) {
        console.error('Failed to send payload to Deriv WS:', err);
      }
    } else {
      if (this.pendingSendQueue.length < 25) {
        this.pendingSendQueue.push(payload);
      }
    }
  }

  public fetchCandles(symbol: string, granularity = 900, count = 200) {
    this.activeSymbol = symbol;
    this.activeGranularity = granularity;
    this.send({
      ticks_history: symbol,
      end: 'latest',
      count,
      style: 'candles',
      granularity,
    });
  }

  public subscribeTicks(symbol: string) {
    if (this.activeSymbol && this.activeSymbol !== symbol) {
      this.send({
        forget_all: 'ticks',
      });
    }
    this.activeSymbol = symbol;

    this.send({
      ticks: symbol,
      subscribe: 1,
    });
  }

  public requestProposal(params: {
    symbol: string;
    amount: number;
    contract_type: 'CALL' | 'PUT';
    duration: number;
    duration_unit: 'm' | 's' | 't';
    currency?: string;
  }) {
    this.send({
      proposal: 1,
      amount: params.amount,
      basis: 'stake',
      contract_type: params.contract_type,
      currency: params.currency || 'USD',
      duration: params.duration,
      duration_unit: params.duration_unit,
      symbol: params.symbol,
      subscribe: 1,
    });
  }

  public buyContract(proposalId: string, price: number) {
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
  }) {
    this.send({
      buy: 1,
      price: params.amount,
      parameters: {
        amount: params.amount,
        basis: 'stake',
        contract_type: params.contract_type,
        currency: params.currency || 'USD',
        duration: params.duration,
        duration_unit: params.duration_unit,
        symbol: params.symbol,
      },
      subscribe: 1,
    });
  }

  public subscribeProposalOpenContract(contractId?: number | string) {
    if (contractId !== undefined && contractId !== null) {
      this.send({
        proposal_open_contract: 1,
        contract_id: Number(contractId),
        subscribe: 1,
      });
    } else {
      this.send({
        proposal_open_contract: 1,
        subscribe: 1,
      });
    }
  }

  public forgetProposalOpenContract(subscriptionId?: string) {
    if (subscriptionId) {
      this.send({ forget: subscriptionId });
    }
  }

  public sellContract(contractId: number | string, price: number = 0) {
    this.send({
      sell: Number(contractId),
      price: price,
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempts++;

    const baseDelay = Math.min(12000, 1500 * Math.pow(1.5, Math.min(this.reconnectAttempts, 5)));
    const jitter = Math.floor(Math.random() * 600);
    const delay = Math.round(baseDelay + jitter);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  public reconnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.connect();
  }

  public disconnect(): void {
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
    this.token = '';
    this.lastAuthorizeResponse = null;
    this.linkedAccounts = [];
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.pendingSendQueue = [];

    if (typeof window !== 'undefined') {
      localStorage.removeItem('deriv_api_token');
      localStorage.removeItem('deriv_active_loginid');
      localStorage.removeItem('deriv_linked_accounts');
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    this.connect();
    this.emit({ msg_type: 'deriv_logout' });
    this.emit({ msg_type: 'logged_out', success: true });
    this.emit({ msg_type: 'linked_accounts_updated', accounts: [] });
  }

  public getLastLatency(): number {
    return this.lastLatencyMs || 32;
  }
}

export const derivWS = new DerivWebSocketClient();
