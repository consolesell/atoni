import {
  ACDEResult,
  BrokerContractDurationBounds,
  BrokerDurationVerification,
  Candle,
  DerivDurationUnitCode,
  DurationBounds,
  DurationGovernancePolicy,
  DurationRecommendation,
  DurationRecommendationSource,
  DurationUnit,
  MarketRegime,
  SymbolVolatilityProfile,
  TechnicalIndicators,
  EarlyExitPolicyConfig,
} from '../types/trading';
import { EnhancedTradeDuration, TradeDurationUnit } from '../types/sniper';
import { getSymbolDetails } from './derivSymbols';
import { strategyEvolutionManager } from './strategyEvolutionManager';

export const DEFAULT_DURATION_GOVERNANCE: DurationGovernancePolicy = {
  mode: 'ADAPTIVE_AUTO',
  globalMinSeconds: 15,
  globalMaxSeconds: 86400,
  globalMinTicks: 1,
  globalMaxTicks: 10,
  allowedUnits: ['ticks', 'seconds', 'minutes', 'hours', 'days'],
  confidenceThreshold: 50,
  fallbackBehavior: 'SAFE_BASELINE',
  recalibrationPolicy: {
    minSampleCount: 8,
    outOfSampleRatio: 0.3,
    neverLengthenAfterLoss: true,
  },
  perSymbolBounds: {},
  perStrategyBounds: {},
};

export const PRESET_DURATIONS: EnhancedTradeDuration[] = [
  // Ticks
  { value: 1, unit: 'ticks', seconds: 1, label: '1 Tick', category: 'ultra_fast', rationale: 'Micro tick impulse' },
  { value: 2, unit: 'ticks', seconds: 2, label: '2 Ticks', category: 'ultra_fast', rationale: 'Sub-second velocity snap' },
  { value: 3, unit: 'ticks', seconds: 3, label: '3 Ticks', category: 'ultra_fast', rationale: 'Micro-breakout confirmation' },
  { value: 5, unit: 'ticks', seconds: 5, label: '5 Ticks', category: 'scalp', rationale: 'Institutional 5-tick sniper scalp' },
  { value: 10, unit: 'ticks', seconds: 10, label: '10 Ticks', category: 'scalp', rationale: 'Extended tick wave resolution' },

  // Seconds
  { value: 15, unit: 'seconds', seconds: 15, label: '15s', category: 'scalp', rationale: 'Fast volatility impulse capture' },
  { value: 30, unit: 'seconds', seconds: 30, label: '30s', category: 'scalp', rationale: 'Half-minute order block reaction' },
  { value: 45, unit: 'seconds', seconds: 45, label: '45s', category: 'scalp', rationale: 'Three-candle impulse resolution' },
  { value: 60, unit: 'seconds', seconds: 60, label: '60s', category: 'standard', rationale: '1-minute structural horizon' },

  // Minutes
  { value: 2, unit: 'minutes', seconds: 120, label: '2m', category: 'standard', rationale: 'Short trend expansion wave' },
  { value: 5, unit: 'minutes', seconds: 300, label: '5m', category: 'standard', rationale: 'Equilibrium swing transition' },
  { value: 15, unit: 'minutes', seconds: 900, label: '15m', category: 'swing', rationale: 'Macro trend continuation' },
  { value: 30, unit: 'minutes', seconds: 1800, label: '30m', category: 'swing', rationale: 'Extended directional drift' },
  { value: 60, unit: 'minutes', seconds: 3600, label: '60m', category: 'swing', rationale: 'Hourly momentum cycle' },

  // Hours & Days
  { value: 1, unit: 'hours', seconds: 3600, label: '1h', category: 'swing', rationale: '1-hour structural session horizon' },
  { value: 2, unit: 'hours', seconds: 7200, label: '2h', category: 'swing', rationale: '2-hour directional session swing' },
  { value: 4, unit: 'hours', seconds: 14400, label: '4h', category: 'swing', rationale: '4-hour macro trend leg' },
  { value: 1, unit: 'days', seconds: 86400, label: '1d', category: 'swing', rationale: 'Daily positional cycle' },
];

export const VALID_DURATION_UNITS: readonly DurationUnit[] = [
  'ticks',
  'seconds',
  'minutes',
  'hours',
  'days',
];

export function isValidDurationUnit(unit: unknown): unit is DurationUnit {
  return typeof unit === 'string' && (VALID_DURATION_UNITS as readonly string[]).includes(unit);
}

export function normalizeDurationUnit(unit: unknown): DurationUnit | null {
  if (typeof unit !== 'string') return null;
  const cleaned = unit.trim().toLowerCase();
  if (cleaned === 't' || cleaned === 'tick' || cleaned === 'ticks') return 'ticks';
  if (cleaned === 's' || cleaned === 'sec' || cleaned === 'second' || cleaned === 'seconds') return 'seconds';
  if (cleaned === 'm' || cleaned === 'min' || cleaned === 'minute' || cleaned === 'minutes') return 'minutes';
  if (cleaned === 'h' || cleaned === 'hr' || cleaned === 'hour' || cleaned === 'hours') return 'hours';
  if (cleaned === 'd' || cleaned === 'day' || cleaned === 'days') return 'days';
  return null;
}

export function toDerivDurationUnit(unit: DurationUnit): DerivDurationUnitCode {
  switch (unit) {
    case 'ticks':
      return 't';
    case 'seconds':
      return 's';
    case 'minutes':
      return 'm';
    case 'hours':
      return 'h';
    case 'days':
      return 'd';
  }
}

export function fromDerivDurationUnit(code: string): DurationUnit | null {
  return normalizeDurationUnit(code);
}

export function durationToSeconds(value: number, unit: DurationUnit): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  switch (unit) {
    case 'ticks':
      // Approximation solely for rough horizon comparisons; NEVER used for broker tick expiry check
      return value;
    case 'seconds':
      return value;
    case 'minutes':
      return value * 60;
    case 'hours':
      return value * 3600;
    case 'days':
      return value * 86400;
  }
}

export function formatDurationLabel(value: number, unit: DurationUnit): string {
  const short: Record<DurationUnit, string> = {
    ticks: value === 1 ? 'Tick' : 'Ticks',
    seconds: 's',
    minutes: 'm',
    hours: 'h',
    days: 'd',
  };
  return unit === 'ticks' ? `${value} ${short[unit]}` : `${value}${short[unit]}`;
}

export function parseDerivContractDurationToken(token?: string): {
  value: number;
  unit: DurationUnit;
  seconds: number;
} | null {
  if (!token || typeof token !== 'string') return null;
  const match = token.trim().match(/^(\d+(?:\.\d+)?)\s*([tsmhd])$/i);
  if (!match) return null;
  const val = Number(match[1]);
  const unit = normalizeDurationUnit(match[2]);
  if (!Number.isFinite(val) || val <= 0 || !unit) return null;
  return {
    value: val,
    unit,
    seconds: durationToSeconds(val, unit),
  };
}

export interface NormalizedLegalDurationResult {
  valid: boolean;
  adjusted: boolean;
  duration: number;
  unit: DurationUnit;
  originalDuration: number;
  originalUnit: DurationUnit;
  exactLegalString: string;
  adjustmentReason?: string;
  rejectionReason?: string;
}

export interface StructuredRecommendationValidationResult {
  valid: boolean;
  recommendation: DurationRecommendation | null;
  reason?: string;
}

export interface AdaptiveDurationInput {
  symbol: string;
  contractType?: 'CALL' | 'PUT';
  candles: Candle[];
  indicators?: Partial<TechnicalIndicators> | null;
  regime: MarketRegime;
  confidence?: number; // 0..1 or 0..100
  chartTimeframeSeconds?: number; // Explicitly separated context input — NOT coupled 1:1 to expiry
  strategyId?: string;
  strategyVersion?: string;
  consecutiveLosses?: number;
  lastLossDuration?: { value: number; unit: DurationUnit } | null;
  earlyExitPolicy?: EarlyExitPolicyConfig | null;
  governance?: DurationGovernancePolicy | null;
  aiRecommendation?: Partial<DurationRecommendation> | null;
  expectedSignalDecaySeconds?: number;
  source?: DurationRecommendationSource;
  now?: number;
}

export class AdaptiveContractDurationEngine {
  private contractsForCache = new Map<string, BrokerContractDurationBounds>();
  private readonly METADATA_TTL_MS = 10 * 60 * 1000;

  /**
   * Registers Deriv `contracts_for` API available contract metadata for a symbol.
   */
  public registerContractsForMetadata(
    symbol: string,
    availableContracts: Array<Record<string, any>>,
    now = Date.now()
  ): void {
    if (!symbol || !Array.isArray(availableContracts) || availableContracts.length === 0) return;

    for (const contractType of ['CALL', 'PUT'] as const) {
      const matching = availableContracts.filter((c) => {
        const ct = String(c?.contract_type || '').toUpperCase();
        const cat = String(c?.contract_category || '').toLowerCase();
        return ct === contractType || cat === 'callput';
      });
      if (matching.length === 0) continue;

      let minTick: number | undefined;
      let maxTick: number | undefined;
      let minTimeSec: number | undefined;
      let maxTimeSec: number | undefined;
      const unitsSet = new Set<DurationUnit>();
      let rawMin = '';
      let rawMax = '';

      for (const c of matching) {
        const minParsed = parseDerivContractDurationToken(c.min_contract_duration);
        const maxParsed = parseDerivContractDurationToken(c.max_contract_duration);
        if (c.min_contract_duration && !rawMin) rawMin = String(c.min_contract_duration);
        if (c.max_contract_duration && !rawMax) rawMax = String(c.max_contract_duration);

        if (minParsed?.unit === 'ticks') {
          unitsSet.add('ticks');
          minTick = minTick === undefined ? minParsed.value : Math.min(minTick, minParsed.value);
          if (maxParsed?.unit === 'ticks') {
            maxTick = maxTick === undefined ? maxParsed.value : Math.max(maxTick, maxParsed.value);
          } else {
            maxTick = maxTick ?? 10;
          }
        }

        if (minParsed && minParsed.unit !== 'ticks') {
          minTimeSec = minTimeSec === undefined ? minParsed.seconds : Math.min(minTimeSec, minParsed.seconds);
        }
        if (maxParsed && maxParsed.unit !== 'ticks') {
          maxTimeSec = maxTimeSec === undefined ? maxParsed.seconds : Math.max(maxTimeSec, maxParsed.seconds);
        }

        const expiryType = String(c?.expiry_type || '').toLowerCase();
        if (expiryType === 'tick') {
          unitsSet.add('ticks');
        } else if (expiryType === 'intraday') {
          if (!minTimeSec || minTimeSec < 60) unitsSet.add('seconds');
          unitsSet.add('minutes');
          unitsSet.add('hours');
        } else if (expiryType === 'daily') {
          unitsSet.add('days');
        }
      }

      if (unitsSet.size === 0) {
        unitsSet.add('minutes');
        unitsSet.add('hours');
      }
      if (minTimeSec !== undefined && minTimeSec < 60) {
        unitsSet.add('seconds');
      }
      if (maxTimeSec !== undefined && maxTimeSec >= 3600) {
        unitsSet.add('hours');
      }
      if (maxTimeSec !== undefined && maxTimeSec >= 86400) {
        unitsSet.add('days');
      }

      this.contractsForCache.set(`${symbol}:${contractType}`, {
        symbol,
        contractType,
        supportedUnits: Array.from(unitsSet),
        minTickDuration: minTick,
        maxTickDuration: maxTick,
        minTimeSeconds: minTimeSec,
        maxTimeSeconds: maxTimeSec,
        rawMinContractDuration: rawMin || undefined,
        rawMaxContractDuration: rawMax || undefined,
        source: 'DERIV_CONTRACTS_FOR',
        fetchedAt: now,
      });
    }
  }

  public getCachedMetadata(
    symbol: string,
    contractType: 'CALL' | 'PUT' = 'CALL',
    now = Date.now()
  ): BrokerContractDurationBounds | null {
    const cached = this.contractsForCache.get(`${symbol}:${contractType}`);
    if (!cached) return null;
    if (now - cached.fetchedAt > this.METADATA_TTL_MS) return null;
    return cached;
  }

  public getSymbolDurationBounds(
    symbol: string,
    contractType: 'CALL' | 'PUT' = 'CALL',
    governance?: DurationGovernancePolicy | null,
    strategyId?: string,
    now = Date.now()
  ): BrokerContractDurationBounds & { effectiveBounds: DurationBounds } {
    const cached = this.getCachedMetadata(symbol, contractType, now);
    const symDetails = getSymbolDetails(symbol);
    const isForex = symDetails.market === 'forex' || /^frx/i.test(symbol);
    const is1Hz = /^1HZ/i.test(symbol);

    const base: BrokerContractDurationBounds = cached || {
      symbol,
      contractType,
      supportedUnits: isForex
        ? ['minutes', 'hours', 'days']
        : ['ticks', 'seconds', 'minutes', 'hours', 'days'],
      minTickDuration: isForex ? undefined : 1,
      maxTickDuration: isForex ? undefined : 10,
      minTimeSeconds: isForex ? 900 : is1Hz ? 15 : 15,
      maxTimeSeconds: 365 * 86400,
      source: 'SYMBOL_DEFAULT',
      fetchedAt: now,
    };

    const gov = governance || DEFAULT_DURATION_GOVERNANCE;
    const symGov = gov.perSymbolBounds?.[symbol] || {};
    const stratGov = (strategyId && gov.perStrategyBounds?.[strategyId]) || {};

    const minSeconds = Math.max(
      base.minTimeSeconds ?? 15,
      gov.globalMinSeconds ?? 15,
      symGov.minSeconds ?? 0,
      stratGov.minSeconds ?? 0
    );
    const maxSeconds = Math.min(
      base.maxTimeSeconds ?? 365 * 86400,
      gov.globalMaxSeconds ?? 86400,
      symGov.maxSeconds ?? Infinity,
      stratGov.maxSeconds ?? Infinity
    );
    const minTicks = Math.max(
      base.minTickDuration ?? 1,
      gov.globalMinTicks ?? 1,
      symGov.minTicks ?? 1,
      stratGov.minTicks ?? 1
    );
    const maxTicks = Math.min(
      base.maxTickDuration ?? 10,
      gov.globalMaxTicks ?? 10,
      symGov.maxTicks ?? Infinity,
      stratGov.maxTicks ?? Infinity
    );

    const allowedSets = [
      base.supportedUnits,
      gov.allowedUnits,
      symGov.allowedUnits,
      stratGov.allowedUnits,
    ].filter((arr): arr is DurationUnit[] => Array.isArray(arr) && arr.length > 0);

    const intersectedUnits = VALID_DURATION_UNITS.filter((u) =>
      allowedSets.every((set) => set.includes(u))
    );

    return {
      ...base,
      supportedUnits: intersectedUnits.length > 0 ? intersectedUnits : base.supportedUnits,
      effectiveBounds: {
        minSeconds,
        maxSeconds: Math.max(minSeconds, maxSeconds),
        minTicks,
        maxTicks: Math.max(minTicks, maxTicks),
        allowedUnits: intersectedUnits,
      },
    };
  }

  /**
   * Normalizes and validates a duration + explicit unit against Deriv contract metadata
   * and governance bounds. NEVER silently mutates without recording original -> adjusted + reason.
   */
  public normalizeToLegalDuration(params: {
    symbol: string;
    requestedDuration: number;
    requestedUnit: DurationUnit;
    contractType?: 'CALL' | 'PUT';
    strategyId?: string;
    governance?: DurationGovernancePolicy | null;
    allowAdjustment?: boolean;
  }): NormalizedLegalDurationResult {
    const allowAdjustment = params.allowAdjustment ?? true;
    const origVal = Number(params.requestedDuration);
    const origUnit = params.requestedUnit;

    if (!isValidDurationUnit(origUnit)) {
      return {
        valid: false,
        adjusted: false,
        duration: origVal,
        unit: 'minutes',
        originalDuration: origVal,
        originalUnit: 'minutes',
        exactLegalString: 'INVALID',
        rejectionReason: `Invalid duration unit "${String(origUnit)}". Explicit ticks|seconds|minutes|hours|days unit required.`,
      };
    }

    if (!Number.isFinite(origVal) || origVal <= 0) {
      return {
        valid: false,
        adjusted: false,
        duration: origVal,
        unit: origUnit,
        originalDuration: origVal,
        originalUnit: origUnit,
        exactLegalString: 'INVALID',
        rejectionReason: `Invalid duration value "${origVal}". Duration must be a positive number.`,
      };
    }

    const bounds = this.getSymbolDurationBounds(
      params.symbol,
      params.contractType || 'CALL',
      params.governance,
      params.strategyId
    );
    const eff = bounds.effectiveBounds;
    const allowedUnits = eff.allowedUnits && eff.allowedUnits.length > 0
      ? eff.allowedUnits
      : bounds.supportedUnits;

    let finalVal = Math.round(origVal);
    let finalUnit: DurationUnit = origUnit;
    const reasons: string[] = [];

    if (finalVal !== origVal) {
      reasons.push(`Rounded fractional duration ${origVal} ${origUnit} to integer ${finalVal} ${origUnit}`);
    }

    // If requested unit is unsupported by symbol/broker metadata
    if (!allowedUnits.includes(finalUnit)) {
      if (!allowAdjustment) {
        return {
          valid: false,
          adjusted: false,
          duration: origVal,
          unit: origUnit,
          originalDuration: origVal,
          originalUnit: origUnit,
          exactLegalString: formatDurationLabel(origVal, origUnit),
          rejectionReason: `Duration unit "${origUnit}" is not permitted for ${params.symbol} (allowed: ${allowedUnits.join(', ')}).`,
        };
      }
      if (finalUnit === 'ticks') {
        const minSec = eff.minSeconds ?? 60;
        finalUnit = allowedUnits.includes('seconds') && minSec < 60 ? 'seconds' : 'minutes';
        finalVal = finalUnit === 'seconds' ? minSec : Math.max(1, Math.ceil(minSec / 60));
        reasons.push(
          `${params.symbol} does not permit tick contracts here; converted ${origVal} ticks → ${finalVal} ${finalUnit}`
        );
      } else {
        const targetSec = durationToSeconds(finalVal, finalUnit);
        if (allowedUnits.includes('minutes')) {
          finalUnit = 'minutes';
          finalVal = Math.max(1, Math.round(targetSec / 60));
        } else if (allowedUnits.includes('hours')) {
          finalUnit = 'hours';
          finalVal = Math.max(1, Math.round(targetSec / 3600));
        } else {
          finalUnit = allowedUnits[0];
          finalVal = Math.max(1, Math.round(targetSec));
        }
        reasons.push(
          `Unit "${origUnit}" unsupported for ${params.symbol}; mapped to ${finalVal} ${finalUnit}`
        );
      }
    }

    if (finalUnit === 'ticks') {
      const minTicks = Math.max(1, eff.minTicks ?? 1);
      const maxTicks = Math.max(minTicks, eff.maxTicks ?? 10);
      if (finalVal < minTicks || finalVal > maxTicks) {
        if (!allowAdjustment) {
          return {
            valid: false,
            adjusted: false,
            duration: origVal,
            unit: origUnit,
            originalDuration: origVal,
            originalUnit: origUnit,
            exactLegalString: formatDurationLabel(origVal, origUnit),
            rejectionReason: `Tick duration ${finalVal}t outside permitted range [${minTicks}t..${maxTicks}t] for ${params.symbol}.`,
          };
        }
        const clamped = Math.max(minTicks, Math.min(maxTicks, finalVal));
        reasons.push(
          `Clamped tick duration ${finalVal}t → ${clamped}t (${bounds.source} range [${minTicks}..${maxTicks}])`
        );
        finalVal = clamped;
      }
    } else {
      // Time-based bounds
      const minSec = Math.max(15, eff.minSeconds ?? 15);
      const maxSec = Math.max(minSec, eff.maxSeconds ?? 86400);
      const requestedSec = durationToSeconds(finalVal, finalUnit);

      if (requestedSec < minSec || requestedSec > maxSec) {
        if (!allowAdjustment) {
          return {
            valid: false,
            adjusted: false,
            duration: origVal,
            unit: origUnit,
            originalDuration: origVal,
            originalUnit: origUnit,
            exactLegalString: formatDurationLabel(origVal, origUnit),
            rejectionReason: `Duration ${formatDurationLabel(finalVal, finalUnit)} (${requestedSec}s) outside permitted bounds [${minSec}s..${maxSec}s] for ${params.symbol}.`,
          };
        }

        const clampedSec = Math.max(minSec, Math.min(maxSec, requestedSec));
        if (clampedSec < 60) {
          finalUnit = allowedUnits.includes('seconds') ? 'seconds' : 'minutes';
          finalVal = finalUnit === 'seconds' ? Math.max(15, Math.round(clampedSec)) : Math.max(1, Math.ceil(clampedSec / 60));
        } else if (finalUnit === 'seconds' && clampedSec <= 3600) {
          finalVal = Math.round(clampedSec);
        } else if (finalUnit === 'minutes' || clampedSec < 3600) {
          finalUnit = allowedUnits.includes('minutes') ? 'minutes' : finalUnit;
          finalVal = Math.max(1, Math.round(clampedSec / 60));
        } else if (finalUnit === 'hours' || clampedSec < 86400) {
          finalUnit = allowedUnits.includes('hours') ? 'hours' : 'minutes';
          finalVal = finalUnit === 'hours' ? Math.max(1, Math.round(clampedSec / 3600)) : Math.round(clampedSec / 60);
        } else {
          finalUnit = allowedUnits.includes('days') ? 'days' : 'hours';
          finalVal = finalUnit === 'days' ? Math.max(1, Math.round(clampedSec / 86400)) : Math.round(clampedSec / 3600);
        }

        reasons.push(
          `Adjusted ${formatDurationLabel(origVal, origUnit)} (${requestedSec}s) → ${formatDurationLabel(finalVal, finalUnit)} (${durationToSeconds(finalVal, finalUnit)}s) to comply with ${params.symbol} bounds [${minSec}s..${maxSec}s]`
        );
      } else if (finalUnit === 'seconds' && finalVal < 15) {
        if (!allowAdjustment) {
          return {
            valid: false,
            adjusted: false,
            duration: origVal,
            unit: origUnit,
            originalDuration: origVal,
            originalUnit: origUnit,
            exactLegalString: formatDurationLabel(origVal, origUnit),
            rejectionReason: `Deriv options require minimum 15s for seconds duration.`,
          };
        }
        reasons.push(`Raised minimum second duration ${finalVal}s → 15s`);
        finalVal = 15;
      }
    }

    const adjusted = finalVal !== origVal || finalUnit !== origUnit;
    return {
      valid: true,
      adjusted,
      duration: finalVal,
      unit: finalUnit,
      originalDuration: origVal,
      originalUnit: origUnit,
      exactLegalString: `${finalVal} ${finalUnit}`,
      adjustmentReason: adjusted ? reasons.join('; ') : undefined,
    };
  }

  /**
   * Validates structured DurationRecommendation strictly.
   * NEVER treats a unitless number as minutes; rejects expired/stale/mismatched recs.
   */
  public validateStructuredRecommendation(
    raw: any,
    context: { symbol: string; now?: number; maxSignalAgeMs?: number },
    sourceFallback: DurationRecommendationSource = 'GEMINI_AI'
  ): StructuredRecommendationValidationResult {
    const now = context.now ?? Date.now();
    const maxSignalAgeMs = context.maxSignalAgeMs ?? 5 * 60 * 1000;

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {
        valid: false,
        recommendation: null,
        reason: 'Missing structured DurationRecommendation object; unitless numeric durations are rejected.',
      };
    }

    const value = Number(raw.value);
    if (!Number.isFinite(value) || value <= 0) {
      return {
        valid: false,
        recommendation: null,
        reason: `Invalid duration recommendation value "${raw.value}".`,
      };
    }

    const unit = normalizeDurationUnit(raw.unit);
    if (!unit) {
      return {
        valid: false,
        recommendation: null,
        reason: `Missing or invalid explicit duration unit "${String(raw.unit)}". Bare numbers are never interpreted as minutes.`,
      };
    }

    if (raw.symbol && String(raw.symbol) !== context.symbol) {
      return {
        valid: false,
        recommendation: null,
        reason: `Duration recommendation symbol "${raw.symbol}" mismatches active symbol "${context.symbol}".`,
      };
    }

    const validUntil = Number(raw.validUntil);
    if (!Number.isFinite(validUntil) || validUntil <= now) {
      return {
        valid: false,
        recommendation: null,
        reason: Number.isFinite(validUntil)
          ? `Duration recommendation expired at ${new Date(validUntil).toISOString()}.`
          : 'Duration recommendation missing required validUntil expiration timestamp.',
      };
    }

    const signalTimestamp = Number(raw.signalTimestamp ?? now);
    if (!Number.isFinite(signalTimestamp) || now - signalTimestamp > maxSignalAgeMs) {
      return {
        valid: false,
        recommendation: null,
        reason: 'Duration recommendation market context signalTimestamp is stale.',
      };
    }

    const rawConf = Number(raw.confidence);
    const normalizedConfidence = Number.isFinite(rawConf)
      ? rawConf <= 1
        ? Math.round(rawConf * 100)
        : Math.min(100, Math.round(rawConf))
      : 55;

    const rec: DurationRecommendation = {
      value,
      unit,
      confidence: normalizedConfidence,
      strategyId: String(raw.strategyId || 'ai_advisor'),
      strategyVersion: String(raw.strategyVersion || 'v4.1.0-baseline'),
      symbol: String(raw.symbol || context.symbol),
      marketRegime: String(raw.marketRegime || 'NEUTRAL'),
      signalTimestamp,
      timeframeContext: String(raw.timeframeContext || 'unspecified'),
      expectedHoldingWindow: String(raw.expectedHoldingWindow || formatDurationLabel(value, unit)),
      validUntil,
      rationale: String(raw.rationale || 'Structured duration advisory'),
      source: (raw.source || sourceFallback) as DurationRecommendationSource,
    };

    return { valid: true, recommendation: rec };
  }

  /**
   * Computes symbol-specific volatility distribution from the symbol's own candle history.
   * Never uses a single global 0.004/0.005 volatility constant across all symbols.
   */
  public computeSymbolVolatilityProfile(
    symbol: string,
    candles: Candle[],
    indicators?: Partial<TechnicalIndicators> | null
  ): SymbolVolatilityProfile {
    if (!candles || candles.length < 6) {
      const vol = Math.max(0.0001, Number(indicators?.volatility || 0.001));
      return {
        symbol,
        currentAtr: indicators?.atrNow ?? null,
        medianHistoricalAtr: indicators?.atrNow ?? null,
        relativeAtrRatio: 1.0,
        realizedVolatility: vol,
        baselineRealizedVolatility: vol,
        volatilityAcceleration: 1.0,
        sampleCount: candles?.length || 0,
      };
    }

    const trSeries: number[] = [];
    const returnsSeries: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      const curr = candles[i];
      const prev = candles[i - 1];
      const tr = Math.max(
        curr.high - curr.low,
        Math.abs(curr.high - prev.close),
        Math.abs(curr.low - prev.close)
      );
      const normTr = curr.close > 0 ? tr / curr.close : 0;
      if (Number.isFinite(normTr) && normTr >= 0) trSeries.push(normTr);
      if (prev.close > 0 && curr.close > 0) {
        returnsSeries.push((curr.close - prev.close) / prev.close);
      }
    }

    const sortedAtr = [...trSeries].sort((a, b) => a - b);
    const medianHistoricalAtr =
      sortedAtr.length > 0 ? sortedAtr[Math.floor(sortedAtr.length / 2)] : 0.001;

    const recentSlice = trSeries.slice(-Math.min(5, trSeries.length));
    const recentMeanNormAtr =
      recentSlice.length > 0
        ? recentSlice.reduce((a, b) => a + b, 0) / recentSlice.length
        : medianHistoricalAtr;

    const currentPrice = indicators?.currentPrice || candles[candles.length - 1].close || 1;
    const currentNormAtr =
      indicators?.atrNow && currentPrice > 0
        ? indicators.atrNow / currentPrice
        : recentMeanNormAtr;

    const relativeAtrRatio =
      medianHistoricalAtr > 0 ? currentNormAtr / medianHistoricalAtr : 1.0;

    // Realized volatility std dev of recent window vs full baseline window
    const calcStd = (arr: number[]) => {
      if (arr.length < 2) return 0;
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
      return Math.sqrt(variance);
    };

    const baselineVol = Math.max(1e-6, calcStd(returnsSeries));
    const recentReturns = returnsSeries.slice(-Math.min(8, returnsSeries.length));
    const prevReturns = returnsSeries.slice(
      Math.max(0, returnsSeries.length - 16),
      Math.max(0, returnsSeries.length - 8)
    );
    const recentVol = Math.max(1e-6, calcStd(recentReturns));
    const priorVol = prevReturns.length >= 4 ? Math.max(1e-6, calcStd(prevReturns)) : baselineVol;
    const volatilityAcceleration = priorVol > 0 ? recentVol / priorVol : 1.0;

    return {
      symbol,
      currentAtr: Number((currentNormAtr * currentPrice).toFixed(6)),
      medianHistoricalAtr: Number((medianHistoricalAtr * currentPrice).toFixed(6)),
      relativeAtrRatio: Number(relativeAtrRatio.toFixed(3)),
      realizedVolatility: Number(recentVol.toFixed(6)),
      baselineRealizedVolatility: Number(baselineVol.toFixed(6)),
      volatilityAcceleration: Number(volatilityAcceleration.toFixed(3)),
      sampleCount: candles.length,
    };
  }

  /**
   * Computes market-aware adaptive duration using all 10 domain factors cleanly,
   * decoupled from chart timeframe granularity.
   */
  public computeMarketAwareDuration(input: AdaptiveDurationInput): ACDEResult {
    const now = input.now ?? Date.now();
    const governance = input.governance || DEFAULT_DURATION_GOVERNANCE;
    const strategyVersion =
      input.strategyVersion || strategyEvolutionManager.getActiveVersion().version;
    const strategyId = input.strategyId || 'acde_multi_factor';
    const rawConf = input.confidence ?? 0.6;
    const confPct = rawConf <= 1 ? rawConf * 100 : rawConf;

    // 1. Symbol-normalized volatility & ATR profile (Factor 2 & Factor 3)
    const volProfile = this.computeSymbolVolatilityProfile(
      input.symbol,
      input.candles,
      input.indicators
    );

    // 2. Regime & data quality gate (Factor 1)
    if (input.regime.type === 'INSUFFICIENT_DATA' || (input.candles && input.candles.length < 5)) {
      const baseline = this.normalizeToLegalDuration({
        symbol: input.symbol,
        requestedDuration: 5,
        requestedUnit: 'minutes',
        contractType: input.contractType,
        strategyId,
        governance,
      });
      return {
        action: 'HOLD',
        duration: baseline.duration,
        unit: baseline.unit,
        originalDuration: baseline.duration,
        originalUnit: baseline.unit,
        wasAdjusted: false,
        holdReason: 'Insufficient market candles for reliable duration estimation (HOLD).',
        recommendation: null,
        volatilityProfile: volProfile,
        calibration: {
          uncalibrated: true,
          sampleCount: 0,
          reason: 'Insufficient candle history.',
        },
        chartTimeframeSeconds: input.chartTimeframeSeconds,
        evaluatedAt: now,
      };
    }

    // 3. Confidence gate (allows returning HOLD when not sufficiently justified)
    const minConfPct = governance.confidenceThreshold ?? 50;
    if (confPct < minConfPct && governance.fallbackBehavior === 'HOLD') {
      const baseline = this.normalizeToLegalDuration({
        symbol: input.symbol,
        requestedDuration: 5,
        requestedUnit: 'minutes',
        contractType: input.contractType,
        strategyId,
        governance,
      });
      return {
        action: 'HOLD',
        duration: baseline.duration,
        unit: baseline.unit,
        originalDuration: baseline.duration,
        originalUnit: baseline.unit,
        wasAdjusted: false,
        holdReason: `Signal confidence (${confPct.toFixed(0)}%) below ACDE confidence floor (${minConfPct}%).`,
        recommendation: null,
        volatilityProfile: volProfile,
        calibration: {
          uncalibrated: true,
          sampleCount: 0,
          reason: 'Blocked by ACDE confidence gate.',
        },
        chartTimeframeSeconds: input.chartTimeframeSeconds,
        evaluatedAt: now,
      };
    }

    // 4. Historical duration calibration check (Factor 8)
    const calibrationEval = strategyEvolutionManager.evaluateDurationHorizons({
      symbol: input.symbol,
      strategyVersion,
      regime: input.regime.type,
      minSamples: governance.recalibrationPolicy?.minSampleCount ?? 8,
      outOfSampleRatio: governance.recalibrationPolicy?.outOfSampleRatio ?? 0.3,
    });

    // 5. Compute Factors 4, 5, 6, 7, 9, 10
    const ind = input.indicators || {};
    const mtf = ind.mtfAnalysis;
    const micro = ind.microAnalysis;
    const pattern = ind.pattern;
    const bb = ind.bbNow;
    const currentPrice =
      ind.currentPrice ||
      (input.candles.length > 0 ? input.candles[input.candles.length - 1].close : 0);

    const factors: string[] = [];
    // Baseline structural holding horizon: 180s (3 minutes), strictly independent of chart granularity!
    let targetSeconds = 180;

    // Volatility & acceleration scaling using symbol's own ATR baseline
    if (volProfile.relativeAtrRatio >= 1.65 || volProfile.volatilityAcceleration >= 1.45) {
      targetSeconds *= 0.45;
      factors.push(
        `Relative ATR ${volProfile.relativeAtrRatio.toFixed(2)}x (accel ${volProfile.volatilityAcceleration.toFixed(2)}x) → compressed rapid horizon`
      );
    } else if (volProfile.relativeAtrRatio <= 0.72) {
      targetSeconds *= 1.55;
      factors.push(`Quiet symbol volatility (${volProfile.relativeAtrRatio.toFixed(2)}x median ATR) → extended drift window`);
    }

    // Factor 1: Market Regime
    if (input.regime.type === 'STRONG_UPTREND' || input.regime.type === 'STRONG_DOWNTREND') {
      targetSeconds *= 1.35;
      factors.push(`Strong trend (${input.regime.type}) favors trend ride`);
    } else if (input.regime.type === 'HIGH_VOLATILITY') {
      targetSeconds *= 0.55;
      factors.push('High volatility turbulence reduces safe exposure horizon');
    } else if (input.regime.type === 'CONSOLIDATION' || input.regime.type === 'SIDEWAYS') {
      targetSeconds *= 0.65;
      factors.push('Consolidation regime favors brisk boundary resolution');
    }

    // Factor 4 & 5: Momentum strength/persistence + directional stability
    const momentumAbs = Math.abs(micro?.momentum ?? 0);
    if (momentumAbs > 0.65 && (micro?.confidence ?? 0.5) >= 0.7) {
      targetSeconds *= 0.8;
      factors.push('Crisp impulse momentum stability');
    }

    // Factor 6: Candle structure / engulfing / 3-soldier acceleration
    if (
      pattern?.pattern === 'BULLISH_ENGULFING' ||
      pattern?.pattern === 'BEARISH_ENGULFING'
    ) {
      targetSeconds *= 0.75;
      factors.push('Engulfing breakout candle');
    } else if (
      pattern?.pattern === 'THREE_WHITE_SOLDIERS' ||
      pattern?.pattern === 'THREE_BLACK_CROWS'
    ) {
      targetSeconds *= 1.15;
      factors.push('3-candle persistent structure');
    }

    // Factor 7: Multi-timeframe agreement
    if (mtf && mtf.consistency >= 0.75) {
      targetSeconds *= 1.25;
      factors.push(`MTF alignment (${Math.round(mtf.consistency * 100)}%) supports follow-through`);
    } else if (mtf && mtf.consistency < 0.45) {
      targetSeconds *= 0.7;
      factors.push('Weak MTF agreement shortens target decay');
    }

    // Factor 9: Expected signal decay
    const signalDecaySeconds =
      input.expectedSignalDecaySeconds ??
      (volProfile.relativeAtrRatio >= 1.5 ? 60 : mtf && mtf.consistency >= 0.75 ? 600 : 300);
    targetSeconds = Math.min(targetSeconds, signalDecaySeconds * 0.9);

    // Factor 10: Risk & early-exit policy alignment
    if (input.earlyExitPolicy?.enabled && input.earlyExitPolicy.autoExecute && targetSeconds >= 60) {
      // Slightly more room when active early-exit protection monitors bid_price before expiry
      targetSeconds *= 1.1;
      factors.push('Early-exit risk shield active');
    }

    // Calibrated historical duration nudge ONLY when calibrated (sample >= minSampleCount)
    if (!calibrationEval.uncalibrated && calibrationEval.bestBucket) {
      const calSec = durationToSeconds(
        calibrationEval.bestBucket.duration,
        calibrationEval.bestBucket.durationUnit
      );
      if (calSec > 0) {
        targetSeconds = targetSeconds * 0.5 + calSec * 0.5;
        factors.push(
          `Calibrated history favors ${calibrationEval.bestBucket.duration}${calibrationEval.bestBucket.durationUnit}`
        );
      }
    }

    // Bollinger extreme tight squeeze -> HOLD check if severe chop
    if (bb && bb.upper && bb.lower && currentPrice > 0) {
      const bbWidth = (bb.upper - bb.lower) / currentPrice;
      if (bbWidth < 0.0012 && governance.fallbackBehavior === 'HOLD') {
        const baseline = this.normalizeToLegalDuration({
          symbol: input.symbol,
          requestedDuration: 3,
          requestedUnit: 'minutes',
          contractType: input.contractType,
          strategyId,
          governance,
        });
        return {
          action: 'HOLD',
          duration: baseline.duration,
          unit: baseline.unit,
          originalDuration: baseline.duration,
          originalUnit: baseline.unit,
          wasAdjusted: false,
          holdReason: `Bollinger compression (${(bbWidth * 100).toFixed(3)}%) makes directional expiry edge unreliable.`,
          recommendation: null,
          volatilityProfile: volProfile,
          calibration: {
            uncalibrated: calibrationEval.uncalibrated,
            sampleCount: calibrationEval.totalMatchingTrades,
            reason: calibrationEval.reason,
          },
          chartTimeframeSeconds: input.chartTimeframeSeconds,
          signalDecaySeconds,
          evaluatedAt: now,
        };
      }
    }

    // Validated AI recommendation blend (only if structured, unit-explicit, non-expired, and symbol-matching)
    if (input.aiRecommendation) {
      const aiCheck = this.validateStructuredRecommendation(
        input.aiRecommendation,
        { symbol: input.symbol, now },
        'GEMINI_AI'
      );
      if (aiCheck.valid && aiCheck.recommendation) {
        const aiSec = durationToSeconds(aiCheck.recommendation.value, aiCheck.recommendation.unit);
        if (aiCheck.recommendation.unit !== 'ticks' && aiSec > 0) {
          targetSeconds = targetSeconds * 0.7 + aiSec * 0.3;
          factors.push(`AI structured advisory (${aiCheck.recommendation.value}${aiCheck.recommendation.unit})`);
        } else if (aiCheck.recommendation.unit === 'ticks' && confPct >= 78 && volProfile.relativeAtrRatio >= 1.5) {
          const tickNorm = this.normalizeToLegalDuration({
            symbol: input.symbol,
            requestedDuration: aiCheck.recommendation.value,
            requestedUnit: 'ticks',
            contractType: input.contractType,
            strategyId,
            governance,
          });
          if (tickNorm.valid) {
            return this.buildSelectResult({
              duration: tickNorm.duration,
              unit: tickNorm.unit,
              originalDuration: aiCheck.recommendation.value,
              originalUnit: 'ticks',
              wasAdjusted: tickNorm.adjusted,
              adjustmentReason: tickNorm.adjustmentReason,
              confPct,
              strategyId,
              strategyVersion,
              symbol: input.symbol,
              regime: input.regime.type,
              chartTimeframeSeconds: input.chartTimeframeSeconds,
              factors: [...factors, `AI tick scalp (${tickNorm.duration} ticks)`],
              volProfile,
              calibrationEval,
              signalDecaySeconds,
              source: input.source || 'ACDE',
              now,
            });
          }
        }
      }
    }

    // Convert targetSeconds cleanly into optimal unit (ticks / seconds / minutes / hours / days)
    const bounds = this.getSymbolDurationBounds(
      input.symbol,
      input.contractType || 'CALL',
      governance,
      strategyId,
      now
    );

    let chosenValue = 3;
    let chosenUnit: DurationUnit = 'minutes';

    // Ultra-fast high-confidence high-ATR tick mode only when symbol supports ticks
    if (
      targetSeconds < 20 &&
      bounds.supportedUnits.includes('ticks') &&
      confPct >= 75 &&
      volProfile.relativeAtrRatio >= 1.65
    ) {
      chosenUnit = 'ticks';
      chosenValue = confPct >= 85 ? 5 : 8;
    } else if (targetSeconds < 120 && bounds.supportedUnits.includes('seconds')) {
      chosenUnit = 'seconds';
      const snapped = [15, 30, 45, 60, 90].reduce((prev, curr) =>
        Math.abs(curr - targetSeconds) < Math.abs(prev - targetSeconds) ? curr : prev
      );
      chosenValue = snapped;
    } else if (targetSeconds < 3600) {
      chosenUnit = 'minutes';
      const mins = Math.max(1, Math.round(targetSeconds / 60));
      const presets = [1, 2, 3, 5, 10, 15, 20, 30, 45];
      chosenValue = presets.reduce((prev, curr) =>
        Math.abs(curr - mins) < Math.abs(prev - mins) ? curr : prev
      );
    } else if (targetSeconds < 86400 && bounds.supportedUnits.includes('hours')) {
      chosenUnit = 'hours';
      chosenValue = Math.max(1, Math.min(12, Math.round(targetSeconds / 3600)));
    } else if (bounds.supportedUnits.includes('days')) {
      chosenUnit = 'days';
      chosenValue = 1;
    } else {
      chosenUnit = 'minutes';
      chosenValue = Math.max(1, Math.round(targetSeconds / 60));
    }

    // Never lengthen duration after a recent loss when policy forbids it
    if (
      governance.recalibrationPolicy?.neverLengthenAfterLoss !== false &&
      (input.consecutiveLosses ?? 0) > 0 &&
      input.lastLossDuration
    ) {
      const lossSec = durationToSeconds(input.lastLossDuration.value, input.lastLossDuration.unit);
      const chosenSec = durationToSeconds(chosenValue, chosenUnit);
      if (lossSec > 0 && chosenSec > lossSec) {
        chosenValue = input.lastLossDuration.value;
        chosenUnit = input.lastLossDuration.unit;
        factors.push('No-loss-recovery-lengthening guard kept horizon capped');
      }
    }

    const normalized = this.normalizeToLegalDuration({
      symbol: input.symbol,
      requestedDuration: chosenValue,
      requestedUnit: chosenUnit,
      contractType: input.contractType,
      strategyId,
      governance,
    });

    if (!normalized.valid) {
      return {
        action: 'HOLD',
        duration: chosenValue,
        unit: chosenUnit,
        originalDuration: chosenValue,
        originalUnit: chosenUnit,
        wasAdjusted: false,
        holdReason: normalized.rejectionReason || 'Duration outside broker & governance policy bounds.',
        recommendation: null,
        volatilityProfile: volProfile,
        calibration: {
          uncalibrated: calibrationEval.uncalibrated,
          sampleCount: calibrationEval.totalMatchingTrades,
          reason: calibrationEval.reason,
        },
        chartTimeframeSeconds: input.chartTimeframeSeconds,
        signalDecaySeconds,
        evaluatedAt: now,
      };
    }

    return this.buildSelectResult({
      duration: normalized.duration,
      unit: normalized.unit,
      originalDuration: normalized.originalDuration,
      originalUnit: normalized.originalUnit,
      wasAdjusted: normalized.adjusted,
      adjustmentReason: normalized.adjustmentReason,
      confPct,
      strategyId,
      strategyVersion,
      symbol: input.symbol,
      regime: input.regime.type,
      chartTimeframeSeconds: input.chartTimeframeSeconds,
      factors,
      volProfile,
      calibrationEval,
      signalDecaySeconds,
      source: input.source || 'ACDE',
      now,
    });
  }

  private buildSelectResult(params: {
    duration: number;
    unit: DurationUnit;
    originalDuration: number;
    originalUnit: DurationUnit;
    wasAdjusted: boolean;
    adjustmentReason?: string;
    confPct: number;
    strategyId: string;
    strategyVersion: string;
    symbol: string;
    regime: string;
    chartTimeframeSeconds?: number;
    factors: string[];
    volProfile: SymbolVolatilityProfile;
    calibrationEval: ReturnType<typeof strategyEvolutionManager.evaluateDurationHorizons>;
    signalDecaySeconds: number;
    source: DurationRecommendationSource;
    now: number;
  }): ACDEResult {
    const label = formatDurationLabel(params.duration, params.unit);
    const rec: DurationRecommendation = {
      value: params.duration,
      unit: params.unit,
      confidence: Math.round(params.confPct),
      strategyId: params.strategyId,
      strategyVersion: params.strategyVersion,
      symbol: params.symbol,
      marketRegime: params.regime,
      signalTimestamp: params.now,
      timeframeContext: params.chartTimeframeSeconds
        ? `Chart ${params.chartTimeframeSeconds}s (decoupled)`
        : 'Market structure',
      expectedHoldingWindow: label,
      validUntil: params.now + 120_000,
      rationale:
        params.factors.slice(0, 3).join(' • ') ||
        `ACDE normalized volatility horizon (${label})`,
      source: params.source,
    };

    return {
      action: 'SELECT',
      duration: params.duration,
      unit: params.unit,
      originalDuration: params.originalDuration,
      originalUnit: params.originalUnit,
      wasAdjusted: params.wasAdjusted,
      adjustmentReason: params.adjustmentReason,
      recommendation: rec,
      volatilityProfile: params.volProfile,
      calibration: {
        uncalibrated: params.calibrationEval.uncalibrated,
        sampleCount: params.calibrationEval.totalMatchingTrades,
        bestBucketKey: params.calibrationEval.bestBucket?.bucketKey,
        reason: params.calibrationEval.reason,
      },
      chartTimeframeSeconds: params.chartTimeframeSeconds,
      signalDecaySeconds: params.signalDecaySeconds,
      evaluatedAt: params.now,
    };
  }

  /**
   * Resolves exact execution duration right before proposal request in ExecutionController.
   * Respects MANUAL_OVERRIDE for manual requests unless broker/safety rules reject it,
   * while strictly validating structured recommendations for autonomous/AI sources.
   */
  public resolveExecutionDuration(params: {
    source: DurationRecommendationSource | string;
    symbol: string;
    contractType: 'CALL' | 'PUT';
    requestedDuration: number;
    requestedUnit: DurationUnit;
    governance?: DurationGovernancePolicy | null;
    recommendation?: Partial<DurationRecommendation> | null;
    strategyId?: string;
    now?: number;
  }): {
    approved: boolean;
    duration: number;
    unit: DurationUnit;
    originalDuration: number;
    originalUnit: DurationUnit;
    wasAdjusted: boolean;
    adjustmentReason?: string;
    rejectionReason?: string;
    validatedRecommendation: DurationRecommendation | null;
  } {
    const now = params.now ?? Date.now();
    const governance = params.governance || DEFAULT_DURATION_GOVERNANCE;
    const isManual = params.source === 'MANUAL';

    // Validate recommendation if provided by AI/Autonomous source
    let validatedRec: DurationRecommendation | null = null;
    if (params.recommendation) {
      const recCheck = this.validateStructuredRecommendation(
        params.recommendation,
        { symbol: params.symbol, now },
        (params.source as DurationRecommendationSource) || 'ACDE'
      );
      if (!recCheck.valid) {
        return {
          approved: false,
          duration: params.requestedDuration,
          unit: params.requestedUnit,
          originalDuration: params.requestedDuration,
          originalUnit: params.requestedUnit,
          wasAdjusted: false,
          rejectionReason: recCheck.reason || 'Structured duration recommendation failed validation.',
          validatedRecommendation: null,
        };
      }
      validatedRec = recCheck.recommendation;
    }

    // Respect manual operator override unless broker/safety rules forbid it
    const allowAdjustment = !(isManual && governance.mode === 'MANUAL_OVERRIDE');
    const legalCheck = this.normalizeToLegalDuration({
      symbol: params.symbol,
      requestedDuration: params.requestedDuration,
      requestedUnit: params.requestedUnit,
      contractType: params.contractType,
      strategyId: params.strategyId,
      governance,
      allowAdjustment,
    });

    if (!legalCheck.valid) {
      return {
        approved: false,
        duration: params.requestedDuration,
        unit: params.requestedUnit,
        originalDuration: params.requestedDuration,
        originalUnit: params.requestedUnit,
        wasAdjusted: false,
        rejectionReason: legalCheck.rejectionReason,
        validatedRecommendation: validatedRec,
      };
    }

    return {
      approved: true,
      duration: legalCheck.duration,
      unit: legalCheck.unit,
      originalDuration: legalCheck.originalDuration,
      originalUnit: legalCheck.originalUnit,
      wasAdjusted: legalCheck.adjusted,
      adjustmentReason: legalCheck.adjustmentReason,
      validatedRecommendation: validatedRec,
    };
  }

  /**
   * Verifies that a broker proposal quote's timestamps and expiry match the requested contract duration.
   * CRITICAL: Tick contracts ('ticks'/'t') use tick-specific validation (valid integer ticks, fresh quote timestamps,
   * future date_expiry) and NEVER compare tick counts against wall-clock seconds!
   */
  public verifyBrokerProposalExpiry(params: {
    symbol: string;
    requestedDuration: number;
    requestedUnit: DurationUnit;
    dateStartMs?: number;
    dateExpiryMs?: number;
    spotTimeMs?: number;
    brokerQuoteExpiresAtMs?: number;
    fetchedAt: number;
    now?: number;
    governance?: DurationGovernancePolicy | null;
  }): BrokerDurationVerification {
    const now = params.now ?? params.fetchedAt ?? Date.now();
    const derivCode = toDerivDurationUnit(params.requestedUnit);
    const maxQuoteAgeMs = 15_000;

    if (params.spotTimeMs !== undefined && now - params.spotTimeMs > maxQuoteAgeMs) {
      return {
        verified: false,
        requestedDuration: params.requestedDuration,
        requestedDurationUnit: params.requestedUnit,
        brokerDurationUnit: derivCode,
        brokerConfirmedStartMs: params.dateStartMs,
        brokerConfirmedExpiryMs: params.dateExpiryMs,
        note: `Stale spot_time (${Math.round((now - params.spotTimeMs) / 1000)}s old).`,
      };
    }

    if (params.brokerQuoteExpiresAtMs !== undefined && params.brokerQuoteExpiresAtMs <= now) {
      return {
        verified: false,
        requestedDuration: params.requestedDuration,
        requestedDurationUnit: params.requestedUnit,
        brokerDurationUnit: derivCode,
        brokerConfirmedStartMs: params.dateStartMs,
        brokerConfirmedExpiryMs: params.dateExpiryMs,
        note: 'Proposal valid_until quote window already expired.',
      };
    }

    if (params.dateExpiryMs !== undefined && params.dateExpiryMs <= now) {
      return {
        verified: false,
        requestedDuration: params.requestedDuration,
        requestedDurationUnit: params.requestedUnit,
        brokerDurationUnit: derivCode,
        brokerConfirmedStartMs: params.dateStartMs,
        brokerConfirmedExpiryMs: params.dateExpiryMs,
        note: 'Broker date_expiry is in the past.',
      };
    }

    // Tick contracts MUST validate using tick-specific rules — NEVER compare ticks to wall-clock seconds
    if (params.requestedUnit === 'ticks') {
      const bounds = this.getSymbolDurationBounds(params.symbol, 'CALL', params.governance);
      const minT = bounds.effectiveBounds.minTicks ?? 1;
      const maxT = bounds.effectiveBounds.maxTicks ?? 10;
      const isInt = Number.isInteger(params.requestedDuration);

      if (!isInt || params.requestedDuration < minT || params.requestedDuration > maxT) {
        return {
          verified: false,
          requestedDuration: params.requestedDuration,
          requestedDurationUnit: 'ticks',
          brokerDurationUnit: 't',
          brokerConfirmedStartMs: params.dateStartMs,
          brokerConfirmedExpiryMs: params.dateExpiryMs,
          note: `Invalid tick count ${params.requestedDuration}t outside broker tick bounds [${minT}..${maxT}].`,
        };
      }

      return {
        verified: true,
        requestedDuration: params.requestedDuration,
        requestedDurationUnit: 'ticks',
        brokerDurationUnit: 't',
        brokerConfirmedStartMs: params.dateStartMs,
        brokerConfirmedExpiryMs: params.dateExpiryMs,
        note: `Tick contract verified (${params.requestedDuration}t; broker expiry ceiling validated independently of wall-clock seconds).`,
      };
    }

    // Time-based contracts compare expected duration seconds against (dateExpiryMs - baselineStartMs)
    const expectedSec = durationToSeconds(params.requestedDuration, params.requestedUnit);
    if (params.dateExpiryMs !== undefined) {
      const startRef = params.dateStartMs ?? params.fetchedAt;
      const observedSec = (params.dateExpiryMs - startRef) / 1000;
      const toleranceSec = Math.max(5, Math.min(180, expectedSec * 0.08));

      if (Math.abs(observedSec - expectedSec) > toleranceSec) {
        return {
          verified: false,
          requestedDuration: params.requestedDuration,
          requestedDurationUnit: params.requestedUnit,
          brokerDurationUnit: derivCode,
          brokerConfirmedStartMs: params.dateStartMs,
          brokerConfirmedExpiryMs: params.dateExpiryMs,
          observedHorizonSeconds: Number(observedSec.toFixed(1)),
          expectedHorizonSeconds: expectedSec,
          toleranceSeconds: Number(toleranceSec.toFixed(1)),
          note: `Broker expiry mismatch: observed ${observedSec.toFixed(1)}s vs requested ${expectedSec}s (±${toleranceSec.toFixed(1)}s tolerance).`,
        };
      }

      return {
        verified: true,
        requestedDuration: params.requestedDuration,
        requestedDurationUnit: params.requestedUnit,
        brokerDurationUnit: derivCode,
        brokerConfirmedStartMs: params.dateStartMs,
        brokerConfirmedExpiryMs: params.dateExpiryMs,
        observedHorizonSeconds: Number(observedSec.toFixed(1)),
        expectedHorizonSeconds: expectedSec,
        toleranceSeconds: Number(toleranceSec.toFixed(1)),
        note: `Broker expiry verified (${observedSec.toFixed(0)}s ≈ requested ${expectedSec}s).`,
      };
    }

    return {
      verified: false,
      requestedDuration: params.requestedDuration,
      requestedDurationUnit: params.requestedUnit,
      brokerDurationUnit: derivCode,
      brokerConfirmedStartMs: params.dateStartMs,
      brokerConfirmedExpiryMs: params.dateExpiryMs,
      expectedHorizonSeconds: expectedSec,
      note: 'Broker proposal response omitted date_expiry; cannot verify time-based contract expiry.',
    };
  }
}

export const acde = new AdaptiveContractDurationEngine();

export function toEnhancedTradeDuration(
  acdeResult: ACDEResult,
  recommendedBy = 'ACDE'
): EnhancedTradeDuration {
  const sec = durationToSeconds(acdeResult.duration, acdeResult.unit);
  const category: EnhancedTradeDuration['category'] =
    acdeResult.unit === 'ticks' || sec <= 10
      ? 'ultra_fast'
      : sec <= 60
      ? 'scalp'
      : sec <= 600
      ? 'standard'
      : 'swing';

  return {
    value: acdeResult.duration,
    unit: acdeResult.unit as TradeDurationUnit,
    seconds: sec,
    label: `${formatDurationLabel(acdeResult.duration, acdeResult.unit)} (${acdeResult.action === 'HOLD' ? 'HOLD' : 'ACDE'})`,
    category,
    recommendedBy: acdeResult.recommendation?.source || recommendedBy,
    rationale: acdeResult.holdReason || acdeResult.recommendation?.rationale || 'Market-aware normalized horizon',
    confidence: acdeResult.recommendation?.confidence,
    strategyId: acdeResult.recommendation?.strategyId,
    strategyVersion: acdeResult.recommendation?.strategyVersion,
    uncalibrated: acdeResult.calibration.uncalibrated,
    action: acdeResult.action,
    holdReason: acdeResult.holdReason,
  };
}
