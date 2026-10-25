import {
  AutonomyPreset,
  AutonomySessionContext,
  AutonomyConfigResult,
  AppliedAutonomySettings,
  DEFAULT_SBAGENT_PRESET,
} from '../types/autonomy';
import { validateDerivDuration } from './riskEngine';
import { auditLogger } from './auditLogger';

const PRESET_STORAGE_KEY = 'sbagent_autonomy_preset_v1';

export function loadAutonomyPreset(): AutonomyPreset {
  if (typeof window === 'undefined') return DEFAULT_SBAGENT_PRESET;
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SBAGENT_PRESET, ...parsed };
    }
  } catch (e) {
    console.warn('[sbagentAutonomyEngine] Error loading preset from localStorage:', e);
  }
  return DEFAULT_SBAGENT_PRESET;
}

export function saveAutonomyPreset(preset: AutonomyPreset): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(preset));
  } catch (e) {
    console.warn('[sbagentAutonomyEngine] Error saving preset to localStorage:', e);
  }
}

export interface PrerequisitesValidationParams {
  isDerivConnected: boolean;
  symbol: string;
  balance: number;
  preset: AutonomyPreset;
}

export function validateAutonomyPrerequisites(
  params: PrerequisitesValidationParams
): string[] {
  const blockers: string[] = [];

  if (!params.isDerivConnected) {
    blockers.push('Deriv WebSocket stream not connected / authenticated.');
  }

  if (!params.symbol || typeof params.symbol !== 'string' || params.symbol.trim() === '') {
    blockers.push('Active market symbol not calibrated.');
  }

  if (params.balance <= 0) {
    blockers.push('Account balance must be greater than $0.00 (Anchor depleted).');
  }

  if (params.preset.risk.maxStake < 0.5) {
    blockers.push('Maximum stake ceiling cannot be lower than $0.50.');
  }

  if (params.preset.risk.sessionDrawdownCap < 1.0 || params.preset.risk.sessionDrawdownCap > 25.0) {
    blockers.push('Session drawdown protection must be calibrated between 1% and 25%.');
  }

  if (!params.preset.allowedSymbols || params.preset.allowedSymbols.length === 0) {
    blockers.push('At least one allowed rotation symbol must be specified.');
  }

  return blockers;
}

export interface SBAgentAutonomyState {
  autonomyGranted: boolean;
  grantedAt: number | null;
  context: AutonomySessionContext | null;
  lastPlan: AppliedAutonomySettings | null;
}

class SBAgentAutonomyController {
  public state: SBAgentAutonomyState = {
    autonomyGranted: false,
    grantedAt: null,
    context: null,
    lastPlan: null,
  };

  /**
   * Called when human operator grants explicit autonomy to SBAgent
   */
  public onAutonomyGranted(ctx: AutonomySessionContext): void {
    this.state.autonomyGranted = true;
    this.state.grantedAt = Date.now();
    this.state.context = ctx;

    auditLogger.record({
      type: 'RISK_SHIELD',
      symbol: ctx.symbol,
      action: 'SBAGENT_AUTONOMY_MODE_GRANTED',
      reason: `Human operator explicitly granted autonomous execution for ${ctx.symbol} in ${ctx.accountMode} mode.`,
      agentConsensus: 'EXPLICIT_GRANT_ESTABLISHED',
      consensusScore: 100,
    });
  }

  /**
   * Called when autonomy is stopped or revoked
   */
  public onAutonomyRevoked(reason = 'user'): void {
    const wasGranted = this.state.autonomyGranted;
    this.state.autonomyGranted = false;
    this.state.grantedAt = null;
    this.state.context = null;

    if (wasGranted) {
      auditLogger.record({
        type: 'RISK_SHIELD',
        symbol: this.state.lastPlan?.symbol || 'UNKNOWN',
        action: 'SBAGENT_AUTONOMY_REVOKED',
        reason: `Autonomy revoked by ${reason}. All auto-trading loops immediately severed.`,
        agentConsensus: 'GRANT_TERMINATED',
      });
    }
  }

  /**
   * Intelligent self-configuration before any trade order is permitted
   */
  public configureForAutonomy(ctx: AutonomySessionContext): AutonomyConfigResult {
    // 1. Hard gate: SBAgent must see explicit autonomy grant
    if (!this.state.autonomyGranted) {
      return {
        ok: false,
        blockers: ['SBAgent autonomy grant has not been established. Explicit human grant required.'],
      };
    }

    const blockers: string[] = [];

    // 2. Market microstructure & legal duration validation
    const durationBound = validateDerivDuration(ctx.symbol, 15, 'minutes');
    const legalDuration = durationBound.duration;
    const legalUnit = durationBound.unit;

    // 3. Mathematical Half-Kelly stake calibration
    const winProbEstimate = 0.65;
    const payoutFactor = 0.95;
    const q = 1 - winProbEstimate;
    const b = payoutFactor;
    const rawKelly = Math.max(0, (b * winProbEstimate - q) / b);
    const halfKellyPercent = rawKelly * 0.5; // Half-Kelly conservatism
    let calibratedStake = Number((ctx.balance * halfKellyPercent).toFixed(2));

    // Clamp between $1.00 minimum and preset max stake ceiling
    calibratedStake = Math.max(1.0, Math.min(ctx.risk.maxStake, calibratedStake));
    if (calibratedStake > ctx.balance) {
      calibratedStake = Number(ctx.balance.toFixed(2));
    }

    if (calibratedStake <= 0) {
      blockers.push('Calculated stake is $0.00. Check account equity balance.');
    }

    // 4. Regime-aware agent weights
    const regime = ctx.regime || 'NEUTRAL';
    const agentWeights: Record<string, number> = {
      trend_following: regime.includes('TREND') ? 0.40 : 0.20,
      mean_reversion: regime.includes('CONSOLIDATION') || regime.includes('SIDEWAYS') ? 0.40 : 0.20,
      volatility_breakout: regime.includes('VOLATILITY') ? 0.35 : 0.25,
      candlestick_pattern: 0.20,
    };

    // 5. Build full applied settings plan
    const appliedSettings: AppliedAutonomySettings = {
      strategyName: ctx.strategyRef || 'sbagent.md-v4.1',
      symbol: ctx.symbol,
      calibratedStake,
      calibratedDuration: legalDuration,
      calibratedDurationUnit: legalUnit,
      regime,
      agentWeights,
      consensusThreshold: ctx.risk.sizingMode === 'CONSERVATIVE_KELLY' ? 0.75 : 0.62,
      sessionDrawdownCap: ctx.risk.sessionDrawdownCap,
      maxExposure: ctx.risk.maxExposure,
      holdRules: {
        bbWidthTooTight: true,
        mtfConflict: true,
        consecutiveLossLimit: ctx.risk.maxConsecutiveLosses,
      },
      circuitBreakerArmed: true,
      timestamp: Date.now(),
    };

    if (blockers.length > 0) {
      return { ok: false, blockers };
    }

    this.state.lastPlan = appliedSettings;
    return {
      ok: true,
      appliedSettings,
    };
  }

  /**
   * Autonomous decision-making: uses consensus, HOLD rules, and calibrated confidence
   */
  public decide(snapshot: AutonomousMarketSnapshot): AutonomousDecision {
    if (!this.state.autonomyGranted) {
      return { action: 'HOLD', reason: 'No autonomy grant active' };
    }

    const plan = this.state.lastPlan;
    const holdRules = plan?.holdRules;

    // HOLD Rule 1: Consecutive Loss Limit
    if (holdRules && snapshot.consecutiveLosses >= holdRules.consecutiveLossLimit) {
      return {
        action: 'HOLD',
        reason: `Consecutive loss ceiling (${snapshot.consecutiveLosses}/${holdRules.consecutiveLossLimit}) reached. Cooling down.`,
      };
    }

    // HOLD Rule 2: Bollinger Band width compression
    const bb = snapshot.indicators?.bollingerBands;
    if (holdRules?.bbWidthTooTight && bb && bb.upper && bb.lower && bb.middle) {
      const bandwidth = (bb.upper - bb.lower) / (bb.middle || 1);
      if (bandwidth < 0.001) {
        return {
          action: 'HOLD',
          reason: 'Bollinger Band width ultra-compressed (<0.1% bandwidth). Squeeze pause.',
        };
      }
    }

    // HOLD Rule 3: Consensus Threshold Gate
    const threshold = plan?.consensusThreshold ?? 0.62;
    if (snapshot.consensusScore < threshold) {
      return {
        action: 'HOLD',
        reason: `Consensus agreement score (${Math.round(snapshot.consensusScore * 100)}%) below required threshold (${Math.round(threshold * 100)}%).`,
      };
    }

    // Directional Execution
    if (snapshot.consensusDirection === 'BUY') {
      return {
        action: 'BUY',
        direction: 'CALL',
        confidence: snapshot.algorithmicConfidence,
        reason: `Consensus agreement (${Math.round(snapshot.consensusScore * 100)}%) confirmed BUY/CALL.`,
      };
    }

    if (snapshot.consensusDirection === 'SELL') {
      return {
        action: 'SELL',
        direction: 'PUT',
        confidence: snapshot.algorithmicConfidence,
        reason: `Consensus agreement (${Math.round(snapshot.consensusScore * 100)}%) confirmed SELL/PUT.`,
      };
    }

    return {
      action: 'HOLD',
      reason: 'Neutral market alignment across agent ensemble.',
    };
  }
}

export interface AutonomousDecision {
  action: 'BUY' | 'SELL' | 'HOLD';
  direction?: 'CALL' | 'PUT';
  confidence?: number;
  reason: string;
}

export interface AutonomousMarketSnapshot {
  symbol: string;
  currentPrice: number;
  candles: any[];
  indicators: any;
  regime: string;
  consecutiveLosses: number;
  openExposure: number;
  balance: number;
  consensusScore: number;
  consensusDirection: 'BUY' | 'SELL' | 'NEUTRAL';
  algorithmicConfidence: number;
}

export const SBAgent = new SBAgentAutonomyController();
