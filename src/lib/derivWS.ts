import { Candle, Tick, DerivLinkedAccount } from '../types/trading';
import { getSymbolDetails } from './derivSymbols';

export type DerivMessageCallback = (data: any) => void;

class DerivWebSocketClient {
  private ws: WebSocket | null = null;
  private appId: string = '1089';
  private token = '';
  private isConnecting = false;
  private reconnectTimer: any = null;
  private pingTimer: any = null;
  private pingStartTimestamp = 0;
  private lastLatencyMs = 35;
  private listeners: Set<DerivMessageCallback> = new Set();
  private activeSymbol = 'R_25';
  private activeGranularity = 900;
  private simPriceInterval: any = null;
  private currentBasePrice = 1845.25;
  private lastAuthorizeResponse: any = null;
  private linkedAccounts: DerivLinkedAccount[] = [];
  private reconnectAttempts = 0;

  constructor() {
    // Check localStorage for saved credentials & linked accounts
    if (typeof window !== 'undefined') {
      const savedToken = localStorage.getItem('deriv_api_token');
      if (savedToken) this.token = savedToken.trim();
      const savedAppId = localStorage.getItem('deriv_app_id');
      if (savedAppId && savedAppId.trim()) {
        this.appId = savedAppId.trim();
      }
      try {
        const savedAccounts = localStorage.getItem('deriv_linked_accounts');
        if (savedAccounts) {
          this.linkedAccounts = JSON.parse(savedAccounts);
        }
      } catch {}
    }
  }

  public setCredentials(token: string, appId: string | number = '1089') {
    this.token = token ? token.trim() : '';
    const cleanAppId = String(appId || '1089').trim();
    this.appId = cleanAppId || '1089';

    if (typeof window !== 'undefined') {
      if (this.token) localStorage.setItem('deriv_api_token', this.token);
      else localStorage.removeItem('deriv_api_token');
      localStorage.setItem('deriv_app_id', this.appId);
    }
    // Reconnect with new credentials
    this.reconnect();
  }

  public getCredentials() {
    return { token: this.token, appId: this.appId };
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
    this.token = account.token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('deriv_api_token', account.token);
      localStorage.setItem('deriv_active_loginid', account.account);
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ authorize: account.token });
    } else {
      this.reconnect();
    }
  }

  public logout() {
    this.token = '';
    this.lastAuthorizeResponse = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('deriv_api_token');
      localStorage.removeItem('deriv_active_loginid');
    }
    this.emit({ msg_type: 'deriv_logout' });
    this.reconnect();
  }

  /**
   * Test a Deriv token live without committing to it
   */
  public async testToken(
    testTokenStr: string,
    targetAppId: string | number = '1089'
  ): Promise<{ success: boolean; authorize?: any; error?: string }> {
    return new Promise((resolve) => {
      const cleanAppId = encodeURIComponent(String(targetAppId || '1089').trim());
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
          } catch (e: any) {
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
        : 'Not Set (Demo Sandbox)',
      latencyMs: this.lastLatencyMs,
      authorized: !!this.lastAuthorizeResponse,
      authDetails: this.lastAuthorizeResponse,
    };
  }

  public refreshBalance() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.token) {
      this.send({ balance: 1 });
    } else {
      // If offline or in demo simulation, emit synthetic balance event anchored at $10.00 USD
      this.emit({
        msg_type: 'balance',
        balance: {
          balance: 10.0,
          currency: 'USD',
          loginid: 'VRTC_VIRTUAL_10',
        },
      });
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
    const cleanAppId = encodeURIComponent(String(this.appId || '1089').trim());
    const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${cleanAppId}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;

        // If fallback simulation was active, gracefully stop it now that real connection restored
        if (this.simPriceInterval) {
          clearInterval(this.simPriceInterval);
          this.simPriceInterval = null;
        }

        this.emit({ msg_type: 'connected', connected: true });

        // Start Keep-Alive Ping every 20 seconds
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          this.pingStartTimestamp = Date.now();
          this.send({ ping: 1 });
        }, 20000);

        // If user provided a real token, authorize
        if (this.token) {
          this.send({ authorize: this.token });
        } else {
          // Demo mode without login - Standardized $10 USD Virtual Anchor
          const demoAuth = {
            email: 'demo@deriv.ai',
            currency: 'USD',
            balance: 10.0,
            is_virtual: 1,
            loginid: 'VRTC_VIRTUAL_10',
          };
          this.lastAuthorizeResponse = demoAuth;
          this.emit({
            msg_type: 'authorize',
            authorize: demoAuth,
          });
        }

        // Fetch initial candles & subscribe to ticks
        this.fetchCandles(this.activeSymbol, this.activeGranularity);
        this.subscribeTicks(this.activeSymbol);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle Ping Latency response
          if (data.msg_type === 'ping' || data.ping) {
            if (this.pingStartTimestamp > 0) {
              this.lastLatencyMs = Math.max(12, Date.now() - this.pingStartTimestamp);
              this.emit({ msg_type: 'ping_latency', latency: this.lastLatencyMs });
            }
          }

          // Handle Authorize success
          if (data.msg_type === 'authorize' && data.authorize) {
            this.lastAuthorizeResponse = data.authorize;
            
            // Sync returned account list if available
            if (Array.isArray(data.authorize.account_list) && data.authorize.account_list.length > 0) {
              const currentLoginId = data.authorize.loginid;
              const newAccounts: DerivLinkedAccount[] = data.authorize.account_list.map((acct: any) => ({
                account: acct.loginid,
                token: acct.loginid === currentLoginId ? this.token : '',
                currency: acct.currency || 'USD',
                isVirtual: Boolean(acct.is_virtual),
                balance: acct.loginid === currentLoginId ? data.authorize.balance : undefined,
              }));

              // Merge with any existing stored tokens
              const existingMap = new Map(this.linkedAccounts.map((a) => [a.account, a]));
              newAccounts.forEach((acc) => {
                const existing = existingMap.get(acc.account);
                if (existing && existing.token && !acc.token) {
                  acc.token = existing.token;
                }
              });
              this.setLinkedAccounts(newAccounts);
            }

            // Immediately subscribe to continuous balance updates
            this.send({ balance: 1, subscribe: 1 });
            this.emit({ msg_type: 'authorize_success', authorize: data.authorize });
          }

          // Handle Authorize error (e.g. invalid token or app id)
          if (data.error && (data.msg_type === 'authorize' || data.echo_req?.authorize)) {
            console.warn('Deriv authorization notice:', data.error.message);
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
        console.warn('Deriv WebSocket connection notice:', err);
        this.emit({ msg_type: 'error', error: { message: 'Deriv WebSocket disconnected. Operating in resilient simulation mode.' } });
        this.startFallbackSimulation();
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.emit({ msg_type: 'connected', connected: false });
        this.scheduleReconnect();
      };
    } catch (err) {
      console.warn('WebSocket init exception:', err);
      this.startFallbackSimulation();
    }
  }

  public send(payload: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (err) {
        console.error('Failed to send payload to Deriv WS:', err);
      }
    }
  }

  public fetchCandles(symbol: string, granularity = 900, count = 200) {
    this.activeSymbol = symbol;
    this.activeGranularity = granularity;
    const details = getSymbolDetails(symbol);
    this.currentBasePrice = details.defaultBasePrice || 1000;
    this.send({
      ticks_history: symbol,
      end: 'latest',
      count,
      style: 'candles',
      granularity,
    });
  }

  public subscribeTicks(symbol: string) {
    // If switching symbols, immediately unsubscribe old symbol ticks
    if (this.activeSymbol && this.activeSymbol !== symbol) {
      this.send({
        forget_all: 'ticks',
      });
    }
    this.activeSymbol = symbol;
    const details = getSymbolDetails(symbol);
    this.currentBasePrice = details.defaultBasePrice || 1000;

    // Reset simulation if it was running on old symbol
    if (this.simPriceInterval) {
      clearInterval(this.simPriceInterval);
      this.simPriceInterval = null;
    }

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

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempts++;

    // Exponential backoff: base 1500ms * 1.5^attempts, capped at 12000ms + random jitter
    const baseDelay = Math.min(12000, 1500 * Math.pow(1.5, Math.min(this.reconnectAttempts, 5)));
    const jitter = Math.floor(Math.random() * 600);
    const delay = Math.round(baseDelay + jitter);

    // If initial connection or multiple retries fail, start fallback simulation to keep UI responsive
    if (this.reconnectAttempts >= 2) {
      this.startFallbackSimulation();
    }

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  public reconnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }
    this.connect();
  }

  // Resilient fallback generator if WebSocket network is blocked
  private startFallbackSimulation() {
    if (this.simPriceInterval) return;

    const details = getSymbolDetails(this.activeSymbol);
    this.currentBasePrice = details.defaultBasePrice || 1000;
    const decimals = details.decimals || 2;
    const volatilityStep = this.currentBasePrice * 0.0004;

    // Generate realistic initial candles if empty
    const now = Math.floor(Date.now() / 1000);
    const mockCandles: Candle[] = [];
    let price = this.currentBasePrice;

    for (let i = 80; i >= 0; i--) {
      const time = now - i * this.activeGranularity;
      const change = (Math.random() - 0.49) * volatilityStep;
      const open = price;
      const close = Number((price + change).toFixed(decimals));
      const high = Number((Math.max(open, close) + Math.random() * volatilityStep * 0.8).toFixed(decimals));
      const low = Number((Math.min(open, close) - Math.random() * volatilityStep * 0.8).toFixed(decimals));
      price = close;
      mockCandles.push({ epoch: time, open, high, low, close, volume: Math.floor(Math.random() * 50 + 10) });
    }
    this.currentBasePrice = price;

    this.emit({
      msg_type: 'candles',
      candles: mockCandles,
      echo_req: { ticks_history: this.activeSymbol },
    });

    this.simPriceInterval = setInterval(() => {
      const delta = (Math.random() - 0.495) * volatilityStep * 0.5;
      this.currentBasePrice = Number((this.currentBasePrice + delta).toFixed(decimals));
      const tick: Tick = {
        epoch: Math.floor(Date.now() / 1000),
        quote: this.currentBasePrice,
        symbol: this.activeSymbol,
      };
      this.emit({ msg_type: 'tick', tick });
    }, 1000);
  }

  public getLastLatency(): number {
    return this.lastLatencyMs || 32;
  }
}

export const derivWS = new DerivWebSocketClient();
