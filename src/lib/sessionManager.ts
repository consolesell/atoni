import {
  AutonomyLifecycleState,
  AutonomyPermissions,
  ExecutionModeSetting,
  SessionStateSnapshot,
  TradeRecord,
} from '../types/trading';
import { containsSecretFields, sanitizeForPersistence } from './securitySanitizer';

const STORAGE_KEY = 'sbatomic_session_v1';

export interface SessionRecoveryPlan {
  hasRecoverableSession: boolean;
  snapshot: SessionStateSnapshot | null;
  restoreUiConfig: boolean;
  restoreAnalysisContext: boolean;
  resumeOpenContractMonitoringCount: number;
  requiresReconciliation: boolean;
  requiresExplicitAutonomyResume: boolean;
  summary: string;
}

export class SessionManager {
  private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  private currentSessionId: string;
  private startTime: number;
  private version = 1;

  constructor(storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
    this.storage =
      storage ??
      (typeof window !== 'undefined' && window.localStorage ? window.localStorage : null);
    this.currentSessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.startTime = Date.now();
  }

  public getSessionId(): string {
    return this.currentSessionId;
  }

  public getStartTime(): number {
    return this.startTime;
  }

  public saveSession(params: {
    accountRef: SessionStateSnapshot['accountRef'];
    symbol: string;
    granularity: number;
    activeStrategyVersion: string;
    executionMode: ExecutionModeSetting;
    autonomyLifecycle: AutonomyLifecycleState;
    autonomyPermissions: AutonomyPermissions;
    openTrades: TradeRecord[];
    pendingIntentIds: string[];
    interruptedCleanly?: boolean;
  }): SessionStateSnapshot {
    this.version += 1;

    const rawSnapshot: SessionStateSnapshot = {
      sessionId: this.currentSessionId,
      version: this.version,
      startTime: this.startTime,
      lastSavedAt: Date.now(),
      accountRef: params.accountRef
        ? {
            accountId: params.accountRef.accountId,
            loginId: params.accountRef.loginId,
            accountType: params.accountRef.accountType,
            currency: params.accountRef.currency,
          }
        : null,
      symbol: params.symbol,
      granularity: params.granularity,
      activeStrategyVersion: params.activeStrategyVersion,
      executionMode: params.executionMode,
      autonomyLifecycle: params.autonomyLifecycle,
      autonomyPermissions: { ...params.autonomyPermissions },
      openContractRefs: params.openTrades
        .filter((t) => t.result === 'PENDING' && t.contract_id)
        .map((t) => ({
          contractId: t.contract_id!,
          symbol: t.symbol,
          buyPrice: t.amount,
          decision: t.decision,
          dateStart: t.dateStart,
          dateExpiry: t.dateExpiry,
          strategyVersion: t.strategyVersion,
          requestedDuration: t.requestedDuration ?? t.duration,
          requestedDurationUnit: t.requestedDurationUnit ?? t.durationUnit,
          chartTimeframeSeconds: t.chartTimeframeSeconds,
          brokerConfirmedExpiryMs: t.brokerConfirmedExpiryMs,
        })),
      pendingIntentIds: [...params.pendingIntentIds],
      interruptedCleanly: Boolean(params.interruptedCleanly),
    };

    const safeSnapshot = sanitizeForPersistence(rawSnapshot);
    if (containsSecretFields(safeSnapshot)) {
      throw new Error('Security invariant violation: session snapshot contains forbidden secret fields.');
    }

    if (this.storage) {
      try {
        this.storage.setItem(STORAGE_KEY, JSON.stringify(safeSnapshot));
      } catch {
        // Ignore storage errors
      }
    }

    return safeSnapshot;
  }

  public loadPreviousSession(): SessionStateSnapshot | null {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.sessionId) return null;
      return sanitizeForPersistence(parsed as SessionStateSnapshot);
    } catch {
      return null;
    }
  }

  /**
   * Produces a safe startup recovery plan that strictly separates:
   * - UI/chart state restore
   * - Analysis context restore
   * - Open-contract monitoring & timeout reconciliation
   * - Autonomous trading resume authorization (NEVER auto-resumes live purchases silently)
   */
  public buildStartupRecoveryPlan(): SessionRecoveryPlan {
    const prev = this.loadPreviousSession();
    if (!prev) {
      return {
        hasRecoverableSession: false,
        snapshot: null,
        restoreUiConfig: false,
        restoreAnalysisContext: false,
        resumeOpenContractMonitoringCount: 0,
        requiresReconciliation: false,
        requiresExplicitAutonomyResume: false,
        summary: 'Fresh terminal session initialized.',
      };
    }

    // Adopt previous session metrics continuity only if recent (< 24h)
    const ageMs = Date.now() - (prev.lastSavedAt || 0);
    const isRecent = ageMs < 24 * 60 * 60 * 1000;
    const openCount = prev.openContractRefs?.length || 0;
    const pendingCount = prev.pendingIntentIds?.length || 0;
    const wasAutonomousActive =
      prev.autonomyLifecycle === 'ACTIVE' || prev.autonomyLifecycle === 'STARTING';

    const summaryParts: string[] = [];
    summaryParts.push(`Restored ${prev.symbol} (${prev.granularity}s) • Strategy ${prev.activeStrategyVersion}`);
    if (openCount > 0) {
      summaryParts.push(`${openCount} open contract${openCount === 1 ? '' : 's'} queued for broker reconciliation & monitoring`);
    }
    if (pendingCount > 0) {
      summaryParts.push(`${pendingCount} unresolved order intent${pendingCount === 1 ? '' : 's'} flagged for reconciliation`);
    }
    if (wasAutonomousActive) {
      summaryParts.push('Autonomous purchasing paused safely — explicit operator resume required');
    }

    return {
      hasRecoverableSession: isRecent,
      snapshot: prev,
      restoreUiConfig: isRecent,
      restoreAnalysisContext: isRecent,
      resumeOpenContractMonitoringCount: openCount,
      requiresReconciliation: openCount > 0 || pendingCount > 0,
      requiresExplicitAutonomyResume: wasAutonomousActive,
      summary: summaryParts.join(' • '),
    };
  }

  public clearSession(): void {
    if (this.storage) {
      try {
        this.storage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
  }
}

export const sessionManager = new SessionManager();
