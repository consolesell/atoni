import {
  DEFAULT_TERMINAL_SETTINGS,
  TerminalSettings,
} from '../types/settings';
import {
  DEFAULT_TERMINAL_CONFIG,
  TerminalConfig,
  validateTerminalConfig,
} from '../config/terminalConfig';
import {
  AutonomyPreset,
  DEFAULT_SBAGENT_PRESET,
} from '../types/autonomy';
import {
  DurationGovernancePolicy,
  EarlyExitPolicyConfig,
  ExecutionModeSetting,
  PositionSizingMode,
} from '../types/trading';
import { sanitizeForPersistence } from './securitySanitizer';
import { calculateDynamicStake } from './riskEngine';
import { DEFAULT_DURATION_GOVERNANCE } from './adaptiveDurationEngine';

const UNIFIED_CONFIG_STORAGE_KEY = 'sbatomic_unified_config_v1';
const LEGACY_SETTINGS_KEY = 'terminal_settings_v4';
const LEGACY_ZUSTAND_CONFIG_KEY = 'sbatomic_terminal_config_v4';
const LEGACY_AUTONOMY_PRESET_KEY = 'sbagent_autonomy_preset_v1';

export const DEFAULT_EARLY_EXIT_POLICY: EarlyExitPolicyConfig = {
  enabled: true,
  autoExecute: true,
  profitTargetEnabled: true,
  profitTargetPercent: 60,
  profitProtectionEnabled: true,
  profitLockTriggerPercent: 35,
  profitProtectionDrawdownPercent: 40,
  trailingStopEnabled: true,
  reversalExitEnabled: true,
  reversalConfidenceThreshold: 72,
  signalDeteriorationEnabled: true,
  maxLossExitEnabled: false,
  maxLossPercent: 50,
  timeDecayExitEnabled: false,
  minRemainingSeconds: 20,
  strategyOverrides: {},
};

export interface UnifiedConfigurationSnapshot {
  version: number;
  revision: number;
  migratedFromLegacy: boolean;
  executionMode: ExecutionModeSetting;
  activeStrategyVersion: string;
  general: TerminalSettings['general'];
  risk: {
    sizingMode: PositionSizingMode;
    fixedStake: number;
    maxStakePercent: number;
    minStake: number;
    maxDailyLoss: number;
    maxDailyTrades: number;
    maxConsecutiveLosses: number;
    maxSessionDrawdownPercent: number;
    maxOpenExposure: number;
    maxConcurrentContracts: number;
    strictDurationCompliance: boolean;
  };
  consensus: TerminalConfig['consensus'] & {
    aiDirectionMatchRequired: boolean;
  };
  market: TerminalConfig['market'] & {
    indicators: TerminalSettings['indicators'];
  };
  autonomy: {
    allowedSymbols: string[];
    autonomousSymbolChange: boolean;
    rotationCooldownSeconds: number;
    consecutiveLossRotationTrigger: number;
    minWinRateForPromotion: number;
    strategyProfile: string;
    autoPromoteSafeEvolution: boolean;
  };
  earlyExit: EarlyExitPolicyConfig;
  durationGovernance: DurationGovernancePolicy;
  trailingStop: TerminalSettings['trailingStop'];
  updatedAt: number;
}

export interface SmallBalanceStakeCheck {
  allowed: boolean;
  requestedStake: number;
  effectiveStake: number;
  sizingMode: PositionSizingMode;
  balance: number;
  maxStakeCap: number;
  minStakeFloor: number;
  reason: string;
  blockingSetting?: string;
}

function getSafeStorage(storage?: Pick<Storage, 'getItem' | 'setItem'>): Pick<Storage, 'getItem' | 'setItem'> | null {
  if (storage) return storage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export class ConfigurationManager {
  private snapshot: UnifiedConfigurationSnapshot;
  private listeners: Set<(snapshot: UnifiedConfigurationSnapshot) => void> = new Set();
  private storage: Pick<Storage, 'getItem' | 'setItem'> | null;

  constructor(storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    this.storage = getSafeStorage(storage);
    this.snapshot = this.loadAndMigrate();
  }

  private createDefaultSnapshot(): UnifiedConfigurationSnapshot {
    return {
      version: 1,
      revision: 1,
      migratedFromLegacy: false,
      executionMode: 'SUPERVISED_AUTO',
      activeStrategyVersion: 'v4.1.0-baseline',
      general: { ...DEFAULT_TERMINAL_SETTINGS.general },
      risk: {
        sizingMode: DEFAULT_TERMINAL_SETTINGS.risk.sizingMode,
        fixedStake: DEFAULT_TERMINAL_SETTINGS.general.defaultStake,
        maxStakePercent: DEFAULT_TERMINAL_SETTINGS.risk.maxStakePercent ?? 0.05,
        minStake: Math.max(0.35, DEFAULT_TERMINAL_SETTINGS.risk.minStake ?? 0.35),
        maxDailyLoss: DEFAULT_TERMINAL_SETTINGS.risk.maxDailyLoss,
        maxDailyTrades: DEFAULT_TERMINAL_SETTINGS.risk.maxDailyTrades,
        maxConsecutiveLosses: DEFAULT_TERMINAL_SETTINGS.risk.maxConsecutiveLosses,
        maxSessionDrawdownPercent:
          DEFAULT_TERMINAL_SETTINGS.risk.maxSessionDrawdownPercent ??
          DEFAULT_TERMINAL_CONFIG.risk.maxSessionDrawdownPercent,
        maxOpenExposure: DEFAULT_TERMINAL_SETTINGS.risk.maxOpenExposure ?? 25,
        maxConcurrentContracts:
          DEFAULT_TERMINAL_SETTINGS.risk.maxConcurrentContracts ??
          DEFAULT_TERMINAL_CONFIG.risk.maxConcurrentPositions,
        strictDurationCompliance: DEFAULT_TERMINAL_SETTINGS.risk.strictDurationCompliance,
      },
      consensus: {
        ...DEFAULT_TERMINAL_CONFIG.consensus,
        minConfidence: DEFAULT_TERMINAL_SETTINGS.ai.minConfidence,
        aiDirectionMatchRequired: DEFAULT_TERMINAL_SETTINGS.ai.aiDirectionMatchRequired,
      },
      market: {
        ...DEFAULT_TERMINAL_CONFIG.market,
        indicators: { ...DEFAULT_TERMINAL_SETTINGS.indicators },
      },
      autonomy: {
        allowedSymbols: [...DEFAULT_TERMINAL_CONFIG.autonomy.allowedSymbols],
        autonomousSymbolChange: DEFAULT_TERMINAL_SETTINGS.ai.autonomousSymbolChange,
        rotationCooldownSeconds: DEFAULT_TERMINAL_SETTINGS.ai.rotationCooldownSeconds,
        consecutiveLossRotationTrigger:
          DEFAULT_TERMINAL_CONFIG.autonomy.consecutiveLossRotationTrigger,
        minWinRateForPromotion: DEFAULT_TERMINAL_CONFIG.autonomy.minWinRateForPromotion,
        strategyProfile: DEFAULT_SBAGENT_PRESET.strategyProfile,
        autoPromoteSafeEvolution: false,
      },
      earlyExit: { ...DEFAULT_EARLY_EXIT_POLICY },
      durationGovernance: structuredClone(DEFAULT_DURATION_GOVERNANCE),
      trailingStop: { ...DEFAULT_TERMINAL_SETTINGS.trailingStop },
      updatedAt: Date.now(),
    };
  }

  private safeReadJson(key: string): any {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public loadAndMigrate(): UnifiedConfigurationSnapshot {
    const base = this.createDefaultSnapshot();
    const unified = this.safeReadJson(UNIFIED_CONFIG_STORAGE_KEY);
    if (unified && typeof unified === 'object') {
      return this.normalizeSnapshot({ ...base, ...unified });
    }

    const legacySettings = this.safeReadJson(LEGACY_SETTINGS_KEY) as Partial<TerminalSettings> | null;
    const legacyConfigRaw = this.safeReadJson(LEGACY_ZUSTAND_CONFIG_KEY);
    const legacyPreset = this.safeReadJson(LEGACY_AUTONOMY_PRESET_KEY) as Partial<AutonomyPreset> | null;
    const hasLegacy = Boolean(legacySettings || legacyConfigRaw || legacyPreset);

    if (!hasLegacy) {
      return base;
    }

    const legacyConfig = legacyConfigRaw ? validateTerminalConfig(legacyConfigRaw) : DEFAULT_TERMINAL_CONFIG;

    const merged: UnifiedConfigurationSnapshot = {
      ...base,
      migratedFromLegacy: true,
      executionMode: legacySettings?.executionMode ?? base.executionMode,
      general: {
        ...base.general,
        ...(legacySettings?.general || {}),
      },
      risk: {
        ...base.risk,
        sizingMode: legacySettings?.risk?.sizingMode ?? base.risk.sizingMode,
        fixedStake: legacySettings?.general?.defaultStake ?? base.risk.fixedStake,
        maxStakePercent:
          legacySettings?.risk?.maxStakePercent ??
          legacyConfig.risk.maxPortfolioExposurePercent ??
          base.risk.maxStakePercent,
        minStake: Math.max(0.35, legacySettings?.risk?.minStake ?? base.risk.minStake),
        maxDailyLoss: legacySettings?.risk?.maxDailyLoss ?? legacyConfig.risk.maxDailyLossUSD,
        maxDailyTrades: legacySettings?.risk?.maxDailyTrades ?? legacyConfig.risk.maxDailyTrades,
        maxConsecutiveLosses:
          legacySettings?.risk?.maxConsecutiveLosses ??
          legacyPreset?.risk?.maxConsecutiveLosses ??
          legacyConfig.risk.maxConsecutiveLosses,
        maxSessionDrawdownPercent:
          legacySettings?.risk?.maxSessionDrawdownPercent ??
          legacyPreset?.risk?.sessionDrawdownCap ??
          legacyConfig.risk.maxSessionDrawdownPercent,
        maxOpenExposure:
          legacySettings?.risk?.maxOpenExposure ??
          legacyPreset?.risk?.maxExposure ??
          base.risk.maxOpenExposure,
        maxConcurrentContracts:
          legacySettings?.risk?.maxConcurrentContracts ?? legacyConfig.risk.maxConcurrentPositions,
        strictDurationCompliance:
          legacySettings?.risk?.strictDurationCompliance ?? base.risk.strictDurationCompliance,
      },
      consensus: {
        ...base.consensus,
        ...legacyConfig.consensus,
        minConfidence: legacySettings?.ai?.minConfidence ?? legacyConfig.consensus.minConfidence,
        aiDirectionMatchRequired:
          legacySettings?.ai?.aiDirectionMatchRequired ?? base.consensus.aiDirectionMatchRequired,
      },
      market: {
        ...base.market,
        ...legacyConfig.market,
        indicators: {
          ...base.market.indicators,
          ...(legacySettings?.indicators || {}),
        },
      },
      autonomy: {
        ...base.autonomy,
        allowedSymbols:
          legacyPreset?.allowedSymbols?.length
            ? [...legacyPreset.allowedSymbols]
            : [...legacyConfig.autonomy.allowedSymbols],
        autonomousSymbolChange:
          legacySettings?.ai?.autonomousSymbolChange ?? base.autonomy.autonomousSymbolChange,
        rotationCooldownSeconds:
          legacySettings?.ai?.rotationCooldownSeconds ??
          legacyPreset?.rotationCooldownSeconds ??
          legacyConfig.autonomy.rotationCooldownSec,
        strategyProfile: legacyPreset?.strategyProfile ?? base.autonomy.strategyProfile,
      },
      earlyExit: {
        ...base.earlyExit,
        ...(legacySettings?.earlyExit || {}),
      },
      durationGovernance: {
        ...base.durationGovernance,
        ...(legacySettings?.durationGovernance || {}),
      },
      trailingStop: {
        ...base.trailingStop,
        ...(legacySettings?.trailingStop || {}),
      },
      updatedAt: Date.now(),
    };

    const normalized = this.normalizeSnapshot(merged);
    this.persist(normalized);
    return normalized;
  }

  private normalizeSnapshot(raw: UnifiedConfigurationSnapshot): UnifiedConfigurationSnapshot {
    const clamp = (val: number, min: number, max: number) =>
      Number.isFinite(val) ? Math.min(max, Math.max(min, val)) : min;

    return {
      ...raw,
      risk: {
        ...raw.risk,
        fixedStake: clamp(raw.risk.fixedStake, 0.35, 10000),
        maxStakePercent: clamp(raw.risk.maxStakePercent, 0.01, 0.5),
        minStake: clamp(raw.risk.minStake, 0.35, 1000),
        maxDailyLoss: clamp(raw.risk.maxDailyLoss, 0.5, 50000),
        maxDailyTrades: Math.round(clamp(raw.risk.maxDailyTrades, 1, 1000)),
        maxConsecutiveLosses: Math.round(clamp(raw.risk.maxConsecutiveLosses, 1, 20)),
        maxSessionDrawdownPercent: clamp(raw.risk.maxSessionDrawdownPercent, 1, 50),
        maxOpenExposure: clamp(raw.risk.maxOpenExposure, 0.35, 50000),
        maxConcurrentContracts: Math.round(clamp(raw.risk.maxConcurrentContracts, 1, 20)),
      },
      consensus: {
        ...raw.consensus,
        minConfidence: clamp(raw.consensus.minConfidence, 0.2, 0.95),
        agreementRatioRequired: clamp(raw.consensus.agreementRatioRequired, 0.4, 1.0),
      },
      earlyExit: {
        ...DEFAULT_EARLY_EXIT_POLICY,
        ...(raw.earlyExit || {}),
        profitTargetPercent: clamp(raw.earlyExit?.profitTargetPercent ?? 60, 5, 200),
        profitLockTriggerPercent: clamp(raw.earlyExit?.profitLockTriggerPercent ?? 35, 5, 150),
        profitProtectionDrawdownPercent: clamp(
          raw.earlyExit?.profitProtectionDrawdownPercent ?? 40,
          10,
          90
        ),
        maxLossPercent: clamp(raw.earlyExit?.maxLossPercent ?? 50, 10, 95),
        minRemainingSeconds: Math.round(clamp(raw.earlyExit?.minRemainingSeconds ?? 20, 0, 300)),
      },
      durationGovernance: {
        ...DEFAULT_DURATION_GOVERNANCE,
        ...(raw.durationGovernance || {}),
        globalMinSeconds: Math.round(clamp(raw.durationGovernance?.globalMinSeconds ?? 15, 15, 3600)),
        globalMaxSeconds: Math.round(clamp(raw.durationGovernance?.globalMaxSeconds ?? 86400, 60, 365 * 86400)),
        globalMinTicks: Math.round(clamp(raw.durationGovernance?.globalMinTicks ?? 1, 1, 10)),
        globalMaxTicks: Math.round(clamp(raw.durationGovernance?.globalMaxTicks ?? 10, 1, 10)),
        confidenceThreshold: Math.round(clamp(raw.durationGovernance?.confidenceThreshold ?? 50, 20, 95)),
      },
    };
  }

  public getSnapshot(): UnifiedConfigurationSnapshot {
    return this.snapshot;
  }

  public getRevision(): number {
    return this.snapshot.revision;
  }

  public update(
    updater: (prev: UnifiedConfigurationSnapshot) => Partial<UnifiedConfigurationSnapshot>,
    bumpRevision = true
  ): UnifiedConfigurationSnapshot {
    const patch = updater(this.snapshot);
    const next = this.normalizeSnapshot({
      ...this.snapshot,
      ...patch,
      general: { ...this.snapshot.general, ...(patch.general || {}) },
      risk: { ...this.snapshot.risk, ...(patch.risk || {}) },
      consensus: { ...this.snapshot.consensus, ...(patch.consensus || {}) },
      market: {
        ...this.snapshot.market,
        ...(patch.market || {}),
        indicators: {
          ...this.snapshot.market.indicators,
          ...(patch.market?.indicators || {}),
        },
      },
      autonomy: { ...this.snapshot.autonomy, ...(patch.autonomy || {}) },
      earlyExit: { ...this.snapshot.earlyExit, ...(patch.earlyExit || {}) },
      durationGovernance: {
        ...this.snapshot.durationGovernance,
        ...(patch.durationGovernance || {}),
      },
      trailingStop: { ...this.snapshot.trailingStop, ...(patch.trailingStop || {}) },
      revision: bumpRevision ? this.snapshot.revision + 1 : this.snapshot.revision,
      updatedAt: Date.now(),
    });
    this.snapshot = next;
    this.persist(next);
    this.notify();
    return next;
  }

  public syncFromTerminalSettings(settings: TerminalSettings): UnifiedConfigurationSnapshot {
    return this.update((prev) => ({
      executionMode: settings.executionMode ?? prev.executionMode,
      general: { ...settings.general },
      risk: {
        ...prev.risk,
        sizingMode: settings.risk.sizingMode,
        fixedStake: settings.general.defaultStake,
        maxStakePercent: settings.risk.maxStakePercent ?? prev.risk.maxStakePercent,
        minStake: Math.max(0.35, settings.risk.minStake ?? prev.risk.minStake),
        maxDailyLoss: settings.risk.maxDailyLoss,
        maxDailyTrades: settings.risk.maxDailyTrades,
        maxConsecutiveLosses: settings.risk.maxConsecutiveLosses,
        maxSessionDrawdownPercent:
          settings.risk.maxSessionDrawdownPercent ?? prev.risk.maxSessionDrawdownPercent,
        maxOpenExposure: settings.risk.maxOpenExposure ?? prev.risk.maxOpenExposure,
        maxConcurrentContracts:
          settings.risk.maxConcurrentContracts ?? prev.risk.maxConcurrentContracts,
        strictDurationCompliance: settings.risk.strictDurationCompliance,
      },
      consensus: {
        ...prev.consensus,
        minConfidence: settings.ai.minConfidence,
        aiDirectionMatchRequired: settings.ai.aiDirectionMatchRequired,
      },
      market: {
        ...prev.market,
        indicators: { ...settings.indicators },
      },
      autonomy: {
        ...prev.autonomy,
        autonomousSymbolChange: settings.ai.autonomousSymbolChange,
        rotationCooldownSeconds: settings.ai.rotationCooldownSeconds,
      },
      earlyExit: {
        ...prev.earlyExit,
        ...(settings.earlyExit || {}),
      },
      durationGovernance: {
        ...prev.durationGovernance,
        ...(settings.durationGovernance || {}),
      },
      trailingStop: { ...settings.trailingStop },
    }));
  }

  public syncFromTerminalConfig(config: TerminalConfig): UnifiedConfigurationSnapshot {
    return this.update((prev) => ({
      risk: {
        ...prev.risk,
        maxStakePercent: config.risk.maxPortfolioExposurePercent,
        maxSessionDrawdownPercent: config.risk.maxSessionDrawdownPercent,
        maxConcurrentContracts: config.risk.maxConcurrentPositions,
        maxDailyLoss: config.risk.maxDailyLossUSD,
        maxDailyTrades: config.risk.maxDailyTrades,
        maxConsecutiveLosses: config.risk.maxConsecutiveLosses,
      },
      consensus: {
        ...prev.consensus,
        ...config.consensus,
      },
      market: {
        ...prev.market,
        ...config.market,
      },
      autonomy: {
        ...prev.autonomy,
        allowedSymbols: [...config.autonomy.allowedSymbols],
        rotationCooldownSeconds: config.autonomy.rotationCooldownSec,
        consecutiveLossRotationTrigger: config.autonomy.consecutiveLossRotationTrigger,
        minWinRateForPromotion: config.autonomy.minWinRateForPromotion,
      },
    }));
  }

  /**
   * Authoritative small-balance stake validation across FIXED, EQUITY_PERCENT, KELLY_HALF, KELLY_QUARTER.
   * Ensures users understand why $3 / $5 / $10 / $50 accounts succeed or get blocked and which setting caused it.
   */
  public evaluateSmallBalanceStake(params: {
    balance: number;
    requestedStake: number;
    sizingMode?: PositionSizingMode;
    winRate?: number;
    confidence?: number;
  }): SmallBalanceStakeCheck {
    const mode = params.sizingMode ?? this.snapshot.risk.sizingMode;
    const minStakeFloor = Math.max(0.35, this.snapshot.risk.minStake);
    const maxStakePercent = this.snapshot.risk.maxStakePercent;
    const balance = params.balance;
    const maxStakeCap = Number(Math.max(0, balance * maxStakePercent).toFixed(2));

    if (!Number.isFinite(balance) || balance <= 0) {
      return {
        allowed: false,
        requestedStake: params.requestedStake,
        effectiveStake: 0,
        sizingMode: mode,
        balance,
        maxStakeCap: 0,
        minStakeFloor,
        reason: 'Account balance must be greater than $0.00.',
        blockingSetting: 'balance',
      };
    }

    if (mode === 'FIXED') {
      if (params.requestedStake < minStakeFloor) {
        return {
          allowed: false,
          requestedStake: params.requestedStake,
          effectiveStake: 0,
          sizingMode: mode,
          balance,
          maxStakeCap,
          minStakeFloor,
          reason: `FIXED stake $${params.requestedStake.toFixed(2)} is below minimum stake floor ($${minStakeFloor.toFixed(2)}).`,
          blockingSetting: 'risk.minStake',
        };
      }
      if (params.requestedStake > balance) {
        return {
          allowed: false,
          requestedStake: params.requestedStake,
          effectiveStake: 0,
          sizingMode: mode,
          balance,
          maxStakeCap,
          minStakeFloor,
          reason: `FIXED stake $${params.requestedStake.toFixed(2)} exceeds available balance $${balance.toFixed(2)}.`,
          blockingSetting: 'balance',
        };
      }
      return {
        allowed: true,
        requestedStake: params.requestedStake,
        effectiveStake: Number(params.requestedStake.toFixed(2)),
        sizingMode: mode,
        balance,
        maxStakeCap,
        minStakeFloor,
        reason: `FIXED stake $${params.requestedStake.toFixed(2)} approved against $${balance.toFixed(2)} balance.`,
      };
    }

    const sizing = calculateDynamicStake({
      balance,
      winRate: params.winRate ?? 0.62,
      confidence: params.confidence ?? 0.65,
      mode,
      fixedStake: params.requestedStake,
      maxStakePercent,
      minStake: minStakeFloor,
    });

    if (sizing.blocked) {
      const blockingSetting =
        maxStakeCap < minStakeFloor
          ? 'risk.maxStakePercent'
          : sizing.rawKellyFraction <= 0
          ? 'winProbability'
          : 'risk.minStake';
      return {
        allowed: false,
        requestedStake: params.requestedStake,
        effectiveStake: 0,
        sizingMode: mode,
        balance,
        maxStakeCap,
        minStakeFloor,
        reason: sizing.blockReason || sizing.rationale,
        blockingSetting,
      };
    }

    return {
      allowed: true,
      requestedStake: params.requestedStake,
      effectiveStake: sizing.recommendedStake,
      sizingMode: mode,
      balance,
      maxStakeCap,
      minStakeFloor,
      reason: sizing.rationale,
    };
  }

  private persist(snapshot: UnifiedConfigurationSnapshot): void {
    if (!this.storage) return;
    try {
      const safe = sanitizeForPersistence(snapshot);
      this.storage.setItem(UNIFIED_CONFIG_STORAGE_KEY, JSON.stringify(safe));
    } catch {
      // Ignore storage quota errors
    }
  }

  public subscribe(listener: (snapshot: UnifiedConfigurationSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}

export const configurationManager = new ConfigurationManager();
