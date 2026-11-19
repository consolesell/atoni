import type { DerivLinkedAccount } from '../types/trading.ts';

export interface AccountSelectionResult {
  selectedAccount: DerivLinkedAccount | null;
  reason: 'SAVED_ACCOUNT_RESTORED' | 'FIRST_DEMO_SELECTED' | 'FIRST_AVAILABLE_SELECTED' | 'NONE_AVAILABLE';
}

export function isDemoAccount(account: Partial<DerivLinkedAccount> | null | undefined): boolean {
  if (!account) return false;
  if (account.account_type === 'demo') return true;
  if (account.account_type === 'real') return false;
  if (typeof account.isVirtual === 'boolean') return account.isVirtual;
  const id = String(account.account || account.account_id || '').toUpperCase();
  return id.startsWith('VRTC') || id.startsWith('VRW') || id.includes('DEMO');
}

/**
 * Normalizes raw accounts returned from either:
 * - GET /trading/v1/options/accounts ({ data: [...] })
 * - Legacy WebSocket authorize.account_list
 * Strips any secret tokens when sanitizeForClient=true.
 */
export function normalizeDiscoveredAccounts(
  rawAccounts: any[],
  options: { sanitizeForClient?: boolean } = {}
): DerivLinkedAccount[] {
  if (!Array.isArray(rawAccounts)) return [];
  const { sanitizeForClient = true } = options;

  const normalized: DerivLinkedAccount[] = [];
  const seen = new Set<string>();

  for (const item of rawAccounts) {
    if (!item || typeof item !== 'object') continue;
    const rawId = item.account_id ?? item.loginid ?? item.account ?? item.id;
    if (!rawId) continue;
    const id = String(rawId).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const rawType = typeof item.account_type === 'string' ? item.account_type.toLowerCase() : undefined;
    const isVirtual =
      rawType === 'demo'
        ? true
        : rawType === 'real'
          ? false
          : typeof item.is_virtual === 'boolean'
            ? item.is_virtual
            : typeof item.is_virtual === 'number'
              ? item.is_virtual === 1
              : typeof item.isVirtual === 'boolean'
                ? item.isVirtual
                : id.toUpperCase().startsWith('VRTC');

    const numericBalance =
      typeof item.balance === 'number' && Number.isFinite(item.balance)
        ? Number(item.balance)
        : typeof item.balance === 'string' && item.balance.trim() !== '' && Number.isFinite(Number(item.balance))
          ? Number(item.balance)
          : undefined;

    const entry: DerivLinkedAccount = {
      account: id,
      account_id: String(item.account_id ?? id),
      currency: String(item.currency || 'USD').toUpperCase(),
      isVirtual,
      account_type: isVirtual ? 'demo' : 'real',
      balance: numericBalance,
      isProvisionalBalance: numericBalance !== undefined,
    };

    if (!sanitizeForClient && typeof item.token === 'string' && item.token.trim()) {
      entry.token = item.token.trim();
    }

    normalized.push(entry);
  }

  return normalized;
}

/**
 * Reference account selection invariant:
 * 1. If a saved valid accountId exists in discovered accounts -> restore it (whether real or demo!).
 *    Never silently flip an explicitly saved REAL account back to DEMO or vice versa.
 * 2. Otherwise, if a demo account exists -> select the first demo account.
 * 3. Otherwise -> select the first available account.
 */
export function selectDerivAccount(
  accounts: DerivLinkedAccount[],
  savedAccountId?: string | null
): AccountSelectionResult {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return { selectedAccount: null, reason: 'NONE_AVAILABLE' };
  }

  if (savedAccountId && savedAccountId.trim()) {
    const cleanSaved = savedAccountId.trim();
    const matched = accounts.find(
      (a) => a.account === cleanSaved || a.account_id === cleanSaved
    );
    if (matched) {
      return { selectedAccount: matched, reason: 'SAVED_ACCOUNT_RESTORED' };
    }
  }

  const firstDemo = accounts.find((a) => isDemoAccount(a));
  if (firstDemo) {
    return { selectedAccount: firstDemo, reason: 'FIRST_DEMO_SELECTED' };
  }

  return { selectedAccount: accounts[0], reason: 'FIRST_AVAILABLE_SELECTED' };
}

/**
 * Masks any secret string for safe diagnostic display/logging.
 */
export function maskSecret(secret?: string | null): string {
  if (!secret || secret.trim().length < 8) return '***';
  const clean = secret.trim();
  return `${clean.slice(0, 4)}••••${clean.slice(-4)}`;
}
