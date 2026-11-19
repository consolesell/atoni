import {
  BalanceSnapshot,
  ConnectionState,
  TradeReadinessFlag,
  TradeReadinessResult,
} from '../types/trading';
import { TradeProposalQuote, validateTradeRiskGate } from './riskEngine';
import { PositionSizingMode } from '../types/trading';

export interface TradeReadinessInput {
  hasValidAuth: boolean;
  tokenExpired?: boolean;
  selectedAccountId: string | null;
  confirmedAccountId: string | null;
  connectionState: ConnectionState;
  isSessionAuthenticated: boolean;
  balanceSnapshot: BalanceSnapshot;
  requiredSubscriptionsActive: boolean;
  hasUnresolvedPurchaseTimeout: boolean;
  hasPendingReconciliation: boolean;
  emergencyStopActive: boolean;
  // Risk checks
  symbol: string;
  stake: number;
  winRate?: number;
  confidence?: number;
  sizingMode?: PositionSizingMode;
  maxStakePercent?: number;
  minStake?: number;
  openExposure: number;
  maxOpenExposure: number;
  openContractsCount: number;
  maxConcurrentContracts: number;
  dailyLoss: number;
  maxDailyLoss: number;
  drawdownPercent: number;
  maxDrawdownPercent: number;
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
  duplicateIntentActive?: boolean;
  proposal?: TradeProposalQuote;
  now?: number;
}

/**
 * Single centralized execution readiness guard enforced before any manual, sniper,
 * Auto-Bot, or autonomous subagent trade execution.
 */
export class TradeReadinessGuard {
  public evaluate(input: TradeReadinessInput): TradeReadinessResult {
    const now = input.now ?? Date.now();
    const blockers: string[] = [];

    const VALID_AUTHENTICATION = Boolean(input.hasValidAuth && !input.tokenExpired);
    if (!VALID_AUTHENTICATION) {
      blockers.push(
        input.tokenExpired
          ? 'Deriv session token expired; re-authentication required.'
          : 'Valid Deriv authentication is required.'
      );
    }

    const VALID_SELECTED_ACCOUNT = Boolean(
      input.selectedAccountId && input.selectedAccountId.trim().length > 0
    );
    if (!VALID_SELECTED_ACCOUNT) {
      blockers.push('No Deriv account selected.');
    }

    const ACCOUNT_IDENTITY_CONFIRMED = Boolean(
      VALID_SELECTED_ACCOUNT &&
        input.confirmedAccountId &&
        input.confirmedAccountId === input.selectedAccountId &&
        (!input.balanceSnapshot.login_id ||
          input.balanceSnapshot.login_id === input.selectedAccountId ||
          input.balanceSnapshot.account_id === input.selectedAccountId)
    );
    if (!ACCOUNT_IDENTITY_CONFIRMED) {
      blockers.push('Active session account identity does not match selected account.');
    }

    const AUTHENTICATED_SESSION = Boolean(
      input.connectionState === 'ONLINE' && input.isSessionAuthenticated
    );
    if (!AUTHENTICATED_SESSION) {
      blockers.push(
        `Deriv session not ready (state: ${input.connectionState}, authenticated: ${input.isSessionAuthenticated}).`
      );
    }

    const FRESH_BALANCE = Boolean(
      input.balanceSnapshot.freshness === 'LIVE' &&
        Number.isFinite(input.balanceSnapshot.amount) &&
        input.balanceSnapshot.amount > 0
    );
    if (!FRESH_BALANCE) {
      blockers.push(
        `Balance not trade-ready (freshness: ${input.balanceSnapshot.freshness}, amount: $${input.balanceSnapshot.amount.toFixed(2)}).`
      );
    }

    const REQUIRED_SUBSCRIPTIONS_ACTIVE = Boolean(input.requiredSubscriptionsActive);
    if (!REQUIRED_SUBSCRIPTIONS_ACTIVE) {
      blockers.push('Required live Deriv subscriptions (balance / contract stream) are not active.');
    }

    const NO_UNRESOLVED_PURCHASE_TIMEOUT = !input.hasUnresolvedPurchaseTimeout;
    if (!NO_UNRESOLVED_PURCHASE_TIMEOUT) {
      blockers.push('Unresolved purchase timeout exists; awaiting broker reconciliation.');
    }

    const NO_PENDING_RECONCILIATION =
      !input.hasPendingReconciliation &&
      input.balanceSnapshot.freshness !== 'RECONCILIATION_PENDING';
    if (!NO_PENDING_RECONCILIATION) {
      blockers.push('Portfolio reconciliation is pending.');
    }

    const EMERGENCY_STOP_INACTIVE = !input.emergencyStopActive;
    if (!EMERGENCY_STOP_INACTIVE) {
      blockers.push('Emergency stop is active.');
    }

    const riskResult = validateTradeRiskGate({
      balance: input.balanceSnapshot.amount,
      balanceFreshness: input.balanceSnapshot.freshness,
      stake: input.stake,
      symbol: input.symbol,
      winRate: input.winRate,
      confidence: input.confidence,
      mode: input.sizingMode,
      maxStakePercent: input.maxStakePercent,
      minStake: input.minStake,
      openExposure: input.openExposure,
      maxOpenExposure: input.maxOpenExposure,
      openContractsCount: input.openContractsCount,
      maxConcurrentContracts: input.maxConcurrentContracts,
      dailyLoss: input.dailyLoss,
      maxDailyLoss: input.maxDailyLoss,
      drawdownPercent: input.drawdownPercent,
      maxDrawdownPercent: input.maxDrawdownPercent,
      consecutiveLosses: input.consecutiveLosses,
      maxConsecutiveLosses: input.maxConsecutiveLosses,
      emergencyStopActive: input.emergencyStopActive,
      duplicateIntentActive: input.duplicateIntentActive,
      proposal: input.proposal,
      expectedAccountId: input.selectedAccountId || undefined,
      expectedCurrency: input.balanceSnapshot.currency,
      now,
    });

    const RISK_ENGINE_APPROVAL = riskResult.approved;
    if (!RISK_ENGINE_APPROVAL) {
      blockers.push(...riskResult.blockers);
    }

    const flags: Record<TradeReadinessFlag, boolean> = {
      VALID_AUTHENTICATION,
      VALID_SELECTED_ACCOUNT,
      ACCOUNT_IDENTITY_CONFIRMED,
      AUTHENTICATED_SESSION,
      FRESH_BALANCE,
      REQUIRED_SUBSCRIPTIONS_ACTIVE,
      NO_UNRESOLVED_PURCHASE_TIMEOUT,
      NO_PENDING_RECONCILIATION,
      RISK_ENGINE_APPROVAL,
      EMERGENCY_STOP_INACTIVE,
    };

    const ready = Object.values(flags).every(Boolean);

    return {
      ready,
      flags,
      blockers: Array.from(new Set(blockers)),
      snapshotTimestamp: now,
    };
  }
}

export const tradeReadinessGuard = new TradeReadinessGuard();
