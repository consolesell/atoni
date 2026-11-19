import crypto from 'crypto';
import {
  normalizeDiscoveredAccounts,
  selectDerivAccount,
} from './src/lib/derivAccounts.ts';
import type { DerivAuthMethod, DerivLinkedAccount } from './src/types/trading.ts';

export const DERIV_API_BASE = 'https://api.derivws.com';
export const DERIV_WS_PUBLIC = 'wss://api.derivws.com/trading/v1/options/ws/public';
export const DERIV_OAUTH_AUTH_URL = 'https://auth.deriv.com/oauth2/auth';
export const DERIV_OAUTH_TOKEN_URL = 'https://auth.deriv.com/oauth2/token';

export interface PkcePendingState {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  createdAt: number;
}

export interface ServerDerivSession {
  sid: string;
  authMethod: DerivAuthMethod;
  accessToken: string;
  appId: string;
  expiresAt: number | null;
  accounts: DerivLinkedAccount[];
  selectedAccountId: string | null;
  legacyTokensByAccount?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface PublicDerivSessionView {
  authenticated: boolean;
  expired: boolean;
  authMethod?: DerivAuthMethod;
  appId?: string;
  expiresAt?: number | null;
  selectedAccountId: string | null;
  selectedAccount: DerivLinkedAccount | null;
  accounts: DerivLinkedAccount[];
}

export type FetchLike = typeof fetch;

const PKCE_STATE_TTL_MS = 10 * 60 * 1000;

export function generateRandomBase64Url(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function computeS256CodeChallenge(codeVerifier: string): string {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
}

/**
 * Redacts tokens, OTPs, and secrets from error messages or strings before logging/returning.
 */
export function redactSecrets(input: string): string {
  if (!input) return '';
  return input
    .replace(/(Bearer\s+)[A-Za-z0-9._\-+/=]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:token\d*|otp|code_verifier|access_token|authorize)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/("?(?:access_token|token|code_verifier|authorize|otp)"?\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2');
}

export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

export class DerivServerAuthVault {
  private pkceStates = new Map<string, PkcePendingState>();
  private sessions = new Map<string, ServerDerivSession>();
  private signingSecret: Buffer;
  private fetchImpl: FetchLike;

  constructor(options: { signingSecret?: string; fetchImpl?: FetchLike } = {}) {
    const envSecret = options.signingSecret || process.env.SESSION_SIGNING_SECRET;
    this.signingSecret = envSecret
      ? crypto.createHash('sha256').update(envSecret).digest()
      : crypto.randomBytes(32);
    this.fetchImpl = options.fetchImpl || fetch;
  }

  public signSessionId(sid: string): string {
    const sig = crypto.createHmac('sha256', this.signingSecret).update(sid).digest('base64url');
    return `${sid}.${sig}`;
  }

  public verifySignedSessionId(cookieVal?: string | null): string | null {
    if (!cookieVal) return null;
    const dotIdx = cookieVal.lastIndexOf('.');
    if (dotIdx <= 0) return null;
    const sid = cookieVal.slice(0, dotIdx);
    const providedSig = cookieVal.slice(dotIdx + 1);
    const expectedSig = crypto
      .createHmac('sha256', this.signingSecret)
      .update(sid)
      .digest('base64url');

    const a = Buffer.from(providedSig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }
    return sid;
  }

  public createPkceAuthRequest(params: {
    clientId: string;
    redirectUri: string;
    scope?: string;
    now?: number;
  }): { url: string; state: string; redirectUri: string; clientId: string } {
    const now = params.now ?? Date.now();
    this.pruneExpiredStates(now);

    const state = generateRandomBase64Url(32);
    const codeVerifier = generateRandomBase64Url(48);
    const codeChallenge = computeS256CodeChallenge(codeVerifier);
    const scope = (params.scope || 'read trade').trim();
    const clientId = params.clientId.trim();
    const redirectUri = params.redirectUri.trim();

    this.pkceStates.set(state, {
      state,
      codeVerifier,
      codeChallenge,
      clientId,
      redirectUri,
      scope,
      createdAt: now,
    });

    const query = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return {
      url: `${DERIV_OAUTH_AUTH_URL}?${query.toString()}`,
      state,
      redirectUri,
      clientId,
    };
  }

  public getPendingPkceStateCount(): number {
    return this.pkceStates.size;
  }

  private pruneExpiredStates(now: number): void {
    for (const [k, v] of this.pkceStates.entries()) {
      if (now - v.createdAt > PKCE_STATE_TTL_MS) {
        this.pkceStates.delete(k);
      }
    }
  }

  public isSessionExpired(session: ServerDerivSession, now: number = Date.now()): boolean {
    if (session.expiresAt === null || session.expiresAt === undefined) return false;
    return now >= session.expiresAt;
  }

  public getSession(sid: string | null, now: number = Date.now()): {
    session: ServerDerivSession | null;
    expired: boolean;
  } {
    if (!sid) return { session: null, expired: false };
    const session = this.sessions.get(sid);
    if (!session) return { session: null, expired: false };
    if (this.isSessionExpired(session, now)) {
      this.sessions.delete(sid);
      return { session: null, expired: true };
    }
    return { session, expired: false };
  }

  public deleteSession(sid: string | null): void {
    if (sid) this.sessions.delete(sid);
  }

  public buildRestHeaders(session: Pick<ServerDerivSession, 'accessToken' | 'authMethod' | 'appId'>): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.accessToken}`,
    };
    // Only apply Deriv-App-ID header for PAT authentication (not OAuth 2.0 Bearer tokens)
    if (session.authMethod === 'pat' && session.appId) {
      headers['Deriv-App-ID'] = session.appId;
    }
    return headers;
  }

  public toPublicView(session: ServerDerivSession | null, expired = false): PublicDerivSessionView {
    if (!session) {
      return {
        authenticated: false,
        expired,
        selectedAccountId: null,
        selectedAccount: null,
        accounts: [],
      };
    }

    const sanitizedAccounts = normalizeDiscoveredAccounts(session.accounts, {
      sanitizeForClient: true,
    });
    const sel = selectDerivAccount(sanitizedAccounts, session.selectedAccountId);

    return {
      authenticated: true,
      expired: false,
      authMethod: session.authMethod,
      appId: session.appId,
      expiresAt: session.expiresAt,
      selectedAccountId: sel.selectedAccount?.account || session.selectedAccountId,
      selectedAccount: sel.selectedAccount,
      accounts: sanitizedAccounts,
    };
  }

  public async exchangeAuthorizationCode(params: {
    code: string;
    state: string;
    savedAccountId?: string | null;
    now?: number;
  }): Promise<{
    ok: boolean;
    session?: ServerDerivSession;
    view?: PublicDerivSessionView;
    status?: number;
    code?: string;
    error?: string;
  }> {
    const now = params.now ?? Date.now();
    this.pruneExpiredStates(now);

    if (!params.state || !params.code) {
      return {
        ok: false,
        status: 400,
        code: 'MISSING_OAUTH_PARAMS',
        error: 'Missing authorization code or state.',
      };
    }

    const pkce = this.pkceStates.get(params.state);
    if (!pkce) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_OR_EXPIRED_STATE',
        error: 'OAuth state verification failed or expired. Please restart sign in.',
      };
    }

    // Consume state immediately (single-use CSRF protection)
    this.pkceStates.delete(params.state);

    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: pkce.clientId,
      code: params.code,
      redirect_uri: pkce.redirectUri,
      code_verifier: pkce.codeVerifier,
    });

    const tokenRes = await this.fetchImpl(DERIV_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form.toString(),
    });

    let tokenJson: any = {};
    try {
      tokenJson = await tokenRes.json();
    } catch {
      tokenJson = {};
    }

    if (!tokenRes.ok || !tokenJson?.access_token) {
      const errMsg = redactSecrets(
        String(tokenJson?.error_description || tokenJson?.error || `Token exchange failed (${tokenRes.status})`)
      );
      return {
        ok: false,
        status: tokenRes.status >= 400 ? tokenRes.status : 401,
        code: 'OAUTH_TOKEN_EXCHANGE_FAILED',
        error: errMsg,
      };
    }

    const expiresInSec = Number(tokenJson.expires_in);
    const expiresAt =
      Number.isFinite(expiresInSec) && expiresInSec > 0 ? now + expiresInSec * 1000 : null;

    const sid = generateRandomBase64Url(32);
    const session: ServerDerivSession = {
      sid,
      authMethod: 'oauth2_pkce',
      accessToken: String(tokenJson.access_token),
      appId: pkce.clientId,
      expiresAt,
      accounts: [],
      selectedAccountId: params.savedAccountId || null,
      createdAt: now,
      updatedAt: now,
    };

    // Immediately discover accounts using the new bearer token
    const disc = await this.discoverAccountsForSession(session, params.savedAccountId, now);
    if (!disc.ok && disc.authRequired) {
      return {
        ok: false,
        status: 401,
        code: 'AUTH_REQUIRED',
        error: disc.error,
      };
    }

    this.sessions.set(sid, session);
    return {
      ok: true,
      session,
      view: this.toPublicView(session, false),
    };
  }

  public async createPatSession(params: {
    token: string;
    appId: string;
    savedAccountId?: string | null;
    now?: number;
  }): Promise<{
    ok: boolean;
    session?: ServerDerivSession;
    view?: PublicDerivSessionView;
    status?: number;
    legacyCandidate?: boolean;
    error?: string;
  }> {
    const now = params.now ?? Date.now();
    const cleanToken = params.token.trim();
    const cleanAppId = params.appId.trim();
    if (!cleanToken) {
      return { ok: false, status: 400, legacyCandidate: false, error: 'Token is required.' };
    }

    const sid = generateRandomBase64Url(32);
    const session: ServerDerivSession = {
      sid,
      authMethod: 'pat',
      accessToken: cleanToken,
      appId: cleanAppId,
      expiresAt: null,
      accounts: [],
      selectedAccountId: params.savedAccountId || null,
      createdAt: now,
      updatedAt: now,
    };

    const disc = await this.discoverAccountsForSession(session, params.savedAccountId, now);
    if (!disc.ok) {
      return {
        ok: false,
        status: disc.status,
        legacyCandidate: disc.status === 401 || disc.status === 403 || disc.status === 404,
        error: redactSecrets(disc.error),
      };
    }

    this.sessions.set(sid, session);
    return {
      ok: true,
      session,
      view: this.toPublicView(session, false),
    };
  }

  public async discoverAccountsForSession(
    session: ServerDerivSession,
    savedAccountId?: string | null,
    now: number = Date.now()
  ): Promise<{
    ok: boolean;
    accounts?: DerivLinkedAccount[];
    selectedAccount?: DerivLinkedAccount | null;
    status?: number;
    authRequired?: boolean;
    error?: string;
  }> {
    if (this.isSessionExpired(session, now)) {
      this.sessions.delete(session.sid);
      return {
        ok: false,
        status: 401,
        authRequired: true,
        error: 'Session token expired. Re-authentication required.',
      };
    }

    const res = await this.fetchImpl(`${DERIV_API_BASE}/trading/v1/options/accounts`, {
      method: 'GET',
      headers: {
        ...this.buildRestHeaders(session),
        Accept: 'application/json',
      },
    });

    let body: any = {};
    try {
      body = await res.json();
    } catch {
      body = {};
    }

    if (res.status === 401) {
      this.sessions.delete(session.sid);
      return {
        ok: false,
        status: 401,
        authRequired: true,
        error: 'Deriv rejected bearer token (401). Please authenticate again.',
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        authRequired: false,
        error: redactSecrets(String(body?.error?.message || body?.message || `Account discovery failed (${res.status})`)),
      };
    }

    const rawList = Array.isArray(body?.data)
      ? body.data
      : Array.isArray(body?.accounts)
        ? body.accounts
        : Array.isArray(body)
          ? body
          : [];

    const accounts = normalizeDiscoveredAccounts(rawList, { sanitizeForClient: true });
    const selection = selectDerivAccount(accounts, savedAccountId ?? session.selectedAccountId);

    session.accounts = accounts;
    session.selectedAccountId = selection.selectedAccount?.account || session.selectedAccountId;
    session.updatedAt = now;

    return {
      ok: true,
      accounts,
      selectedAccount: selection.selectedAccount,
    };
  }

  public selectAccount(
    session: ServerDerivSession,
    accountId: string,
    now: number = Date.now()
  ): { ok: boolean; selectedAccount?: DerivLinkedAccount; status?: number; error?: string } {
    const cleanId = accountId.trim();
    const matched = session.accounts.find(
      (a) => a.account === cleanId || a.account_id === cleanId
    );
    if (!matched) {
      return {
        ok: false,
        status: 404,
        error: `Account ${cleanId} was not found in the authenticated user's discovered accounts.`,
      };
    }
    session.selectedAccountId = matched.account;
    session.updatedAt = now;
    return { ok: true, selectedAccount: matched };
  }

  public async createDemoAccount(
    session: ServerDerivSession,
    now: number = Date.now()
  ): Promise<{
    ok: boolean;
    accounts?: DerivLinkedAccount[];
    selectedAccount?: DerivLinkedAccount | null;
    status?: number;
    authRequired?: boolean;
    error?: string;
  }> {
    if (this.isSessionExpired(session, now)) {
      this.sessions.delete(session.sid);
      return { ok: false, status: 401, authRequired: true, error: 'Session expired.' };
    }

    const res = await this.fetchImpl(`${DERIV_API_BASE}/trading/v1/options/accounts`, {
      method: 'POST',
      headers: {
        ...this.buildRestHeaders(session),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        currency: 'USD',
        group: 'row',
        account_type: 'demo',
      }),
    });

    if (res.status === 401) {
      this.sessions.delete(session.sid);
      return { ok: false, status: 401, authRequired: true, error: 'Authentication expired.' };
    }

    if (!res.ok) {
      let body: any = {};
      try {
        body = await res.json();
      } catch {}
      return {
        ok: false,
        status: res.status,
        authRequired: false,
        error: redactSecrets(String(body?.error?.message || body?.message || `Failed creating demo account (${res.status})`)),
      };
    }

    return this.discoverAccountsForSession(session, session.selectedAccountId, now);
  }

  public async resetDemoBalance(
    session: ServerDerivSession,
    accountId: string,
    now: number = Date.now()
  ): Promise<{ ok: boolean; data?: any; status?: number; authRequired?: boolean; error?: string }> {
    if (this.isSessionExpired(session, now)) {
      this.sessions.delete(session.sid);
      return { ok: false, status: 401, authRequired: true, error: 'Session expired.' };
    }

    const target = session.accounts.find((a) => a.account === accountId || a.account_id === accountId);
    if (!target) {
      return { ok: false, status: 404, authRequired: false, error: 'Account not found in session.' };
    }
    if (!target.isVirtual && target.account_type !== 'demo') {
      return { ok: false, status: 403, authRequired: false, error: 'Cannot reset balance on a real account.' };
    }

    const encodedId = encodeURIComponent(target.account_id || target.account);
    const res = await this.fetchImpl(
      `${DERIV_API_BASE}/trading/v1/options/accounts/${encodedId}/reset-demo-balance`,
      {
        method: 'POST',
        headers: {
          ...this.buildRestHeaders(session),
          Accept: 'application/json',
        },
      }
    );

    if (res.status === 401) {
      this.sessions.delete(session.sid);
      return { ok: false, status: 401, authRequired: true, error: 'Authentication expired.' };
    }

    let body: any = {};
    try {
      body = await res.json();
    } catch {}

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        authRequired: false,
        error: redactSecrets(String(body?.error?.message || body?.message || `Reset demo balance failed (${res.status})`)),
      };
    }

    return { ok: true, data: body?.data || body };
  }

  public async requestAccountOtpWsUrl(
    session: ServerDerivSession,
    accountId: string,
    now: number = Date.now()
  ): Promise<{ ok: boolean; wsUrl?: string; accountId?: string; status?: number; authRequired?: boolean; error?: string }> {
    if (this.isSessionExpired(session, now)) {
      this.sessions.delete(session.sid);
      return { ok: false, status: 401, authRequired: true, error: 'Session expired.' };
    }

    const target = session.accounts.find((a) => a.account === accountId || a.account_id === accountId);
    if (!target) {
      return { ok: false, status: 404, authRequired: false, error: 'Selected account not found in session.' };
    }

    const encodedId = encodeURIComponent(target.account_id || target.account);
    const res = await this.fetchImpl(
      `${DERIV_API_BASE}/trading/v1/options/accounts/${encodedId}/otp`,
      {
        method: 'POST',
        headers: {
          ...this.buildRestHeaders(session),
          Accept: 'application/json',
        },
      }
    );

    if (res.status === 401) {
      this.sessions.delete(session.sid);
      return { ok: false, status: 401, authRequired: true, error: 'Authentication expired.' };
    }

    let body: any = {};
    try {
      body = await res.json();
    } catch {}

    const wsUrl = body?.data?.url || body?.url;
    if (!res.ok || !wsUrl || typeof wsUrl !== 'string') {
      return {
        ok: false,
        status: res.status >= 400 ? res.status : 502,
        authRequired: false,
        error: redactSecrets(String(body?.error?.message || body?.message || 'Failed to obtain account-specific OTP WebSocket URL.')),
      };
    }

    session.selectedAccountId = target.account;
    session.updatedAt = now;

    return {
      ok: true,
      wsUrl,
      accountId: target.account,
    };
  }
}
