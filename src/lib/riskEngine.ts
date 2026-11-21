import {
  TradeRecord,
  CoreRiskMetrics,
  PositionSizingMode,
  MarketRegime,
  DurationUnit,
  DerivDurationUnitCode,
  DurationGovernancePolicy,
} from '../types/trading';
import { acde } from './adaptiveDurationEngine';

export interface KellyStakeResult {
  recommendedStake: number;
  kellyFraction: number;
  rawKellyFraction: number;
  winProbability: number;
  netOdds: number;
  mode: PositionSizingMode;
  equityBoundMin: number;
  equityBoundMax: number;
  rationale: string;
  expectedValue: number;
  isCalibrated?: boolean;
  blocked: boolean;
  blockReason?: string;
}

export interface TradeProposalQuote {
  proposalId: string;
  askPrice: number;
  payout?: number;
  spot?: number;
  spotTimeMs?: number;
  dateStartMs?: number;
  dateExpiryMs?: number;
  brokerQuoteExpiresAtMs?: number;
  requestedDuration?: number;
  requestedDurationUnit?: DurationUnit;
  brokerDurationUnit?: DerivDurationUnitCode;
  brokerConfirmedDuration?: number;
  brokerDurationVerified?: boolean;
  brokerVerificationNote?: string;
  symbol?: string;
  currency?: string;
  accountId?: string;
  fetchedAt: number;
  expiresAt: number;
}

export interface TradeRiskValidationParams {
  balance: number;
  balanceFreshness?: 'SYNCING' | 'LIVE' | 'STALE' | 'UNAVAILABLE' | 'RECONCILIATION_PENDING';
  stake: number;
  symbol: string;
  winRate?: number;
  confidence?: number;
  mode?: PositionSizingMode;
  maxStakePercent?: number;
  minStake?: number;
  payoutRate?: number;
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
  emergencyStopActive?: boolean;
  duplicateIntentActive?: boolean;
  proposal?: TradeProposalQuote;
  expectedAccountId?: string;
  expectedCurrency?: string;
  now?: number;
}

export interface TradeRiskValidationResult {
  approved: boolean;
  blockers: string[];
  recommendedStake: number;
}

/**
 * Calculates dynamic position size using the Kelly Criterion or Fixed % of Account Equity.
 * Hard safety invariants:
 * 1. balance <= 0 ALWAYS returns 0 and blocks trade.
 * 2. minStake NEVER overrides maxStakePercent (if equityBoundMax < equityBoundMin, trade is blocked with 0).
 * 3. Negative Kelly edge (rawKellyFraction <= 0) ALWAYS returns 0 and blocks trade.
 */
export function calculateDynamicStake(params: {
  balance: number;
  winRate: number; // 0 to 1 (e.g. 0.62)
  confidence?: number; // 0 to 1
  symbol?: string;
  regime?: MarketRegime;
  closedTrades?: TradeRecord[];
  mode?: PositionSizingMode;
  fixedStake?: number;
  maxStakePercent?: number; // default 3.0% of balance
  minStake?: number; // default $1.00
  payoutRate?: number; // default 0.95 (95% net payout)
}): KellyStakeResult {
  const {
    balance,
    winRate,
    confidence = 0.6,
    symbol = '',
    regime,
    closedTrades,
    mode = 'KELLY_HALF',
    fixedStake = 5.0,
    maxStakePercent = 0.03,
    minStake = 1.0,
    payoutRate = 0.95,
  } = params;

  if (!Number.isFinite(balance) || balance <= 0) {
    return {
      recommendedStake: 0,
      kellyFraction: 0,
      rawKellyFraction: 0,
      winProbability: winRate,
      netOdds: payoutRate,
      mode,
      equityBoundMin: 0,
      equityBoundMax: 0,
      rationale: 'Zero or negative balance blocks all trades.',
      expectedValue: 0,
      blocked: true,
      blockReason: 'Account balance is zero or unavailable.',
    };
  }

  // 1. Calibrate empirical win probability by symbol and regime bucket
  let calibratedWinProb = winRate;
  let isCalibrated = false;

  if (closedTrades && closedTrades.length > 0) {
    const calibration = getCalibratedWinProbability({
      symbol,
      regime,
      confidence,
      closedTrades,
    });
    calibratedWinProb = calibration.calibratedP;
    isCalibrated = true;
  } else {
    const baseProb = winRate > 0 ? winRate * 0.6 + confidence * 0.4 : confidence;
    calibratedWinProb = Math.min(0.85, Math.max(0.05, baseProb));
  }

  const b = payoutRate > 0 ? payoutRate : 0.95;
  const p = calibratedWinProb;
  const q = 1 - p;

  // Raw Kelly Formula: f* = (p * b - q) / b
  const rawKellyFraction = (p * b - q) / b;

  // Fractional Kelly scaling multiplier
  let fractionMultiplier = 0.5; // Half-Kelly default
  if (mode === 'KELLY_QUARTER') {
    fractionMultiplier = 0.25;
  } else if (mode === 'EQUITY_PERCENT') {
    fractionMultiplier = 0.02; // Fixed 2%
  }

  const effectiveMinStake = Math.max(0.35, minStake);
  // CRITICAL: minStake must NEVER override maxStakePercent
  const equityBoundMax = Math.max(0, Math.round(balance * maxStakePercent * 100) / 100);
  const equityBoundMin = Math.min(effectiveMinStake, equityBoundMax);

  if (equityBoundMax < effectiveMinStake) {
    return {
      recommendedStake: 0,
      kellyFraction: 0,
      rawKellyFraction,
      winProbability: p,
      netOdds: b,
      mode,
      equityBoundMin: effectiveMinStake,
      equityBoundMax,
      rationale: `Max stake cap ($${equityBoundMax.toFixed(2)}, ${(maxStakePercent * 100).toFixed(1)}% of $${balance.toFixed(2)}) is below minimum stake ($${effectiveMinStake.toFixed(2)}). Trade blocked.`,
      expectedValue: 0,
      isCalibrated,
      blocked: true,
      blockReason: 'Max stake percentage ceiling is below minimum legal stake.',
    };
  }

  let calculatedStake = 0;
  let effectiveFraction = 0;
  let rationale = '';
  let blocked = false;
  let blockReason: string | undefined;

  if (mode === 'FIXED') {
    if (fixedStake < effectiveMinStake) {
      blocked = true;
      blockReason = `Fixed stake ($${fixedStake.toFixed(2)}) is below minimum stake ($${effectiveMinStake.toFixed(2)}).`;
      rationale = blockReason;
    } else {
      calculatedStake = Math.min(fixedStake, equityBoundMax);
      calculatedStake = Math.round(calculatedStake * 100) / 100;
      effectiveFraction = calculatedStake / balance;
      rationale = `Fixed stake of $${calculatedStake.toFixed(2)} (${(effectiveFraction * 100).toFixed(1)}% of balance, capped at $${equityBoundMax.toFixed(2)}).`;
    }
  } else if (mode === 'EQUITY_PERCENT') {
    const pct = Math.min(maxStakePercent, 0.02);
    const rawPctStake = Math.round(balance * pct * 100) / 100;
    if (rawPctStake < effectiveMinStake) {
      blocked = true;
      blockReason = `Equity-percent stake ($${rawPctStake.toFixed(2)}) is below minimum stake ($${effectiveMinStake.toFixed(2)}).`;
      rationale = blockReason;
    } else {
      calculatedStake = Math.min(rawPctStake, equityBoundMax);
      effectiveFraction = calculatedStake / balance;
      rationale = `Fixed Equity Sizing: ${(pct * 100).toFixed(1)}% of $${balance.toFixed(2)} = $${calculatedStake.toFixed(2)}.`;
    }
  } else {
    // Kelly Criterion
    if (rawKellyFraction <= 0) {
      // Negative expectancy MUST block trade — never fall back to minStake
      calculatedStake = 0;
      effectiveFraction = 0;
      blocked = true;
      blockReason = `Negative Kelly edge (${(rawKellyFraction * 100).toFixed(1)}%) — trade blocked.`;
      rationale = blockReason;
    } else {
      const fractionalFraction = rawKellyFraction * fractionMultiplier;
      effectiveFraction = Math.min(fractionalFraction, maxStakePercent);
      const rawStake = Math.round(balance * effectiveFraction * 100) / 100;

      if (rawStake < effectiveMinStake) {
        calculatedStake = 0;
        effectiveFraction = 0;
        blocked = true;
        blockReason = `Kelly stake ($${rawStake.toFixed(2)}) is below minimum stake ($${effectiveMinStake.toFixed(2)}).`;
        rationale = blockReason;
      } else {
        calculatedStake = Math.min(rawStake, equityBoundMax);
        calculatedStake = Math.round(calculatedStake * 100) / 100;
        effectiveFraction = calculatedStake / balance;
        rationale = `${mode === 'KELLY_QUARTER' ? 'Quarter' : 'Half'}-Kelly Sizing: Calibrated Win Prob ${(p * 100).toFixed(1)}%, Raw f* ${(rawKellyFraction * 100).toFixed(1)}% → Scaled ${(effectiveFraction * 100).toFixed(2)}% of equity ($${calculatedStake.toFixed(2)}).`;
      }
    }
  }

  const expectedValue = blocked ? 0 : (p * b - q) * calculatedStake;

  return {
    recommendedStake: blocked ? 0 : calculatedStake,
    kellyFraction: effectiveFraction,
    rawKellyFraction,
    winProbability: p,
    netOdds: b,
    mode,
    equityBoundMin,
    equityBoundMax,
    rationale,
    expectedValue,
    isCalibrated,
    blocked,
    blockReason,
  };
}

/**
 * Hard pre-execution risk & proposal validator enforced at the single central execution boundary.
 */
export function validateTradeRiskGate(params: TradeRiskValidationParams): TradeRiskValidationResult {
  const blockers: string[] = [];
  const now = params.now ?? Date.now();

  if (params.emergencyStopActive) {
    blockers.push('Emergency stop is active.');
  }

  if (params.balanceFreshness && params.balanceFreshness !== 'LIVE') {
    blockers.push(`Balance freshness is ${params.balanceFreshness}; live confirmed balance is required.`);
  }

  if (!Number.isFinite(params.balance) || params.balance <= 0) {
    blockers.push('Account balance must be greater than $0.00.');
  }

  if (!Number.isFinite(params.stake) || params.stake <= 0) {
    blockers.push('Trade stake must be greater than $0.00.');
  } else if (params.stake > params.balance) {
    blockers.push(`Insufficient balance ($${params.balance.toFixed(2)}) for stake $${params.stake.toFixed(2)}.`);
  }

  const maxStakePercent = params.maxStakePercent ?? 0.05;
  const maxAllowedStake = Math.max(0, params.balance * maxStakePercent);
  if (params.mode !== 'FIXED' && params.stake > maxAllowedStake + 0.001 && params.balance > 0) {
    blockers.push(
      `Stake $${params.stake.toFixed(2)} exceeds ${(maxStakePercent * 100).toFixed(1)}% equity ceiling ($${maxAllowedStake.toFixed(2)}).`
    );
  }

  const sizingCheck = calculateDynamicStake({
    balance: params.balance,
    winRate: params.winRate ?? 0.62,
    confidence: params.confidence ?? 0.62,
    symbol: params.symbol,
    mode: params.mode ?? 'KELLY_HALF',
    fixedStake: params.stake,
    maxStakePercent: params.maxStakePercent ?? 0.05,
    minStake: params.minStake ?? 0.35,
    payoutRate: params.payoutRate ?? 0.95,
  });

  if (sizingCheck.blocked && params.mode !== 'FIXED') {
    blockers.push(sizingCheck.blockReason || sizingCheck.rationale);
  }

  if (params.duplicateIntentActive) {
    blockers.push('Duplicate order intent detected while prior purchase is still in flight or pending reconciliation.');
  }

  if (params.openContractsCount >= params.maxConcurrentContracts) {
    blockers.push(`Max concurrent contracts limit (${params.maxConcurrentContracts}) reached.`);
  }

  if (params.openExposure + params.stake > params.maxOpenExposure + 0.001) {
    blockers.push(
      `Total open exposure ($${(params.openExposure + params.stake).toFixed(2)}) exceeds cap ($${params.maxOpenExposure.toFixed(2)}).`
    );
  }

  if (params.dailyLoss >= params.maxDailyLoss) {
    blockers.push(`Daily loss limit reached ($${params.dailyLoss.toFixed(2)} / $${params.maxDailyLoss.toFixed(2)}).`);
  }

  if (params.drawdownPercent >= params.maxDrawdownPercent) {
    blockers.push(
      `Session drawdown circuit breaker reached (${params.drawdownPercent.toFixed(1)}% >= ${params.maxDrawdownPercent.toFixed(1)}%).`
    );
  }

  if (params.consecutiveLosses >= params.maxConsecutiveLosses) {
    blockers.push(`Consecutive loss limit reached (${params.consecutiveLosses}/${params.maxConsecutiveLosses}).`);
  }

  if (params.proposal) {
    const p = params.proposal;
    if (!p.proposalId || !String(p.proposalId).trim()) {
      blockers.push('Missing proposal ID.');
    }
    if (!Number.isFinite(p.askPrice) || p.askPrice <= 0) {
      blockers.push('Deriv proposal quote is missing a valid positive ask_price.');
    }
    const maxAgeMs = 15_000;
    if (!Number.isFinite(p.expiresAt) || now > p.expiresAt || now - p.fetchedAt > maxAgeMs) {
      blockers.push('Proposal quote is stale or expired; fetch a fresh proposal.');
    }
    if (p.spotTimeMs !== undefined && (!Number.isFinite(p.spotTimeMs) || p.spotTimeMs <= 0 || now - p.spotTimeMs > maxAgeMs)) {
      blockers.push('Proposal quote spot_time is stale or invalid; fetch a fresh proposal.');
    }
    if (p.brokerQuoteExpiresAtMs !== undefined && (!Number.isFinite(p.brokerQuoteExpiresAtMs) || now > p.brokerQuoteExpiresAtMs)) {
      blockers.push('Broker proposal validity window expired; fetch a fresh proposal.');
    }
    if (p.dateExpiryMs !== undefined && (!Number.isFinite(p.dateExpiryMs) || p.dateExpiryMs <= now)) {
      blockers.push('Proposal contract date_expiry is already in the past.');
    }
    if (p.askPrice > params.stake * 1.05 + 0.01) {
      blockers.push(`Proposal ask price ($${p.askPrice.toFixed(2)}) exceeds authorized stake ($${params.stake.toFixed(2)}).`);
    }
    if (p.askPrice > params.balance) {
      blockers.push(`Proposal ask price ($${p.askPrice.toFixed(2)}) exceeds live balance ($${params.balance.toFixed(2)}).`);
    }
    if (p.symbol && p.symbol !== params.symbol) {
      blockers.push(`Proposal symbol mismatch (${p.symbol} != ${params.symbol}).`);
    }
    if (params.expectedCurrency && p.currency && p.currency !== params.expectedCurrency) {
      blockers.push(`Proposal currency mismatch (${p.currency} != ${params.expectedCurrency}).`);
    }
    if (params.expectedAccountId && p.accountId && p.accountId !== params.expectedAccountId) {
      blockers.push('Proposal belongs to a different Deriv account.');
    }
    if (p.brokerDurationVerified === false) {
      blockers.push(
        p.brokerVerificationNote || 'Broker proposal duration/expiry verification failed.'
      );
    }
  }

  return {
    approved: blockers.length === 0,
    blockers,
    recommendedStake: sizingCheck.recommendedStake,
  };
}

export interface CalibratedProbabilityParams {
  symbol?: string;
  regime?: MarketRegime;
  confidence?: number;
  closedTrades?: TradeRecord[];
}

/**
 * Builds calibrated empirical win-probability buckets by symbol and market regime.
 * Uses Bayesian Laplace prior P(W) = (wins + 2) / (samples + 4) as specified in sbagent.md.
 * Only the calibrated empirical probability is fed into the Kelly Criterion.
 */
export function getCalibratedWinProbability(params: CalibratedProbabilityParams): {
  calibratedP: number;
  sampleCount: number;
  empiricalWinRate: number;
  source: 'BUCKET_CALIBRATED' | 'BAYESIAN_SMOOTHED' | 'GLOBAL_FALLBACK';
  rationale: string;
} {
  const { symbol = '', regime, confidence = 0.6, closedTrades = [] } = params;

  // 1. Filter trades for the specific symbol
  const symbolTrades = symbol ? closedTrades.filter((t) => t.symbol === symbol) : closedTrades;

  // 2. Filter trades for the specific regime if available
  const regimeTrades =
    regime && regime.type
      ? symbolTrades.filter((t) => t.regime === regime.type || (t as any).marketRegime === regime.type)
      : symbolTrades;

  // Select appropriate empirical bucket with sample size confidence
  let activeBucket = regimeTrades;
  let source: 'BUCKET_CALIBRATED' | 'BAYESIAN_SMOOTHED' | 'GLOBAL_FALLBACK' = 'BUCKET_CALIBRATED';

  if (activeBucket.length < 3 && symbolTrades.length >= 3) {
    activeBucket = symbolTrades;
    source = 'BAYESIAN_SMOOTHED';
  } else if (activeBucket.length < 3) {
    activeBucket = closedTrades;
    source = 'GLOBAL_FALLBACK';
  }

  const samples = activeBucket.length;
  const wins = activeBucket.filter((t) => t.result === 'WIN').length;

  // Bayesian Laplace Smoothing: P(W) = (wins + 2) / (samples + 4) from sbagent.md Section 3
  const laplaceEmpiricalRate = (wins + 2) / (samples + 4);

  // Calibrate model confidence: As empirical samples grow, empirical evidence dominates
  const weightEmpirical = Math.min(0.85, 0.45 + (samples / (samples + 8)) * 0.4);
  const weightModel = 1 - weightEmpirical;
  const calibratedP = Math.min(
    0.85,
    Math.max(0.42, laplaceEmpiricalRate * weightEmpirical + confidence * weightModel)
  );

  const rationale = `[Calibrated p] Bucket (${symbol || 'All'}:${regime?.type || 'Any'}) ${wins}/${samples} wins (Laplace ${(laplaceEmpiricalRate * 100).toFixed(1)}%) blended with confidence ${(confidence * 100).toFixed(0)}% → p = ${(calibratedP * 100).toFixed(1)}%`;

  return {
    calibratedP: Math.round(calibratedP * 1000) / 1000,
    sampleCount: samples,
    empiricalWinRate: Math.round(laplaceEmpiricalRate * 1000) / 1000,
    source,
    rationale,
  };
}

/**
 * Validates and maps Deriv contract duration via the single authoritative ACDE normalizer.
 * Never silently discards original requested values when adjusted.
 */
export interface ValidatedDuration {
  duration: number;
  unit: DurationUnit;
  originalDuration: number;
  originalUnit: DurationUnit;
  exactLegalString: string;
  isAdjusted: boolean;
  adjustmentReason?: string;
  valid: boolean;
  rejectionReason?: string;
}

export function validateDerivDuration(
  symbol: string,
  requestedDuration: number,
  unit: DurationUnit = 'minutes',
  options?: {
    contractType?: 'CALL' | 'PUT';
    strategyId?: string;
    governance?: DurationGovernancePolicy | null;
    allowAdjustment?: boolean;
  }
): ValidatedDuration {
  const res = acde.normalizeToLegalDuration({
    symbol,
    requestedDuration,
    requestedUnit: unit,
    contractType: options?.contractType,
    strategyId: options?.strategyId,
    governance: options?.governance,
    allowAdjustment: options?.allowAdjustment,
  });

  return {
    duration: res.duration,
    unit: res.unit,
    originalDuration: res.originalDuration,
    originalUnit: res.originalUnit,
    exactLegalString: res.exactLegalString,
    isAdjusted: res.adjusted,
    adjustmentReason: res.adjustmentReason,
    valid: res.valid,
    rejectionReason: res.rejectionReason,
  };
}

// Core metrics calculation follows below

/**
 * Calculates core risk and performance metrics from closed trade records.
 */
export function calculateCoreRiskMetrics(
  trades: TradeRecord[],
  currentBalance: number,
  startingBalance?: number
): CoreRiskMetrics {
  const settledTrades = trades.filter((t) => t.result === 'WIN' || t.result === 'LOSS');
  const winningTrades = settledTrades.filter((t) => (t.profit || 0) > 0);
  const losingTrades = settledTrades.filter((t) => (t.profit || 0) <= 0);

  const grossProfits = winningTrades.reduce((acc, t) => acc + (t.profit || 0), 0);
  const grossLosses = losingTrades.reduce((acc, t) => acc + Math.abs(t.profit || 0), 0);
  const netSettledPnl = settledTrades.reduce((acc, t) => acc + (t.profit || 0), 0);
  const effectiveStartingBalance =
    typeof startingBalance === 'number' && Number.isFinite(startingBalance) && startingBalance > 0
      ? startingBalance
      : Math.max(0.5, Math.round((currentBalance - netSettledPnl) * 100) / 100);

  // Profit Factor: Gross Profits / Gross Losses
  let profitFactor = 0;
  if (grossLosses === 0) {
    profitFactor = grossProfits > 0 ? 99.9 : 1.0;
  } else {
    profitFactor = Math.round((grossProfits / grossLosses) * 100) / 100;
  }

  // Win & Loss Rates
  const totalTrades = settledTrades.length;
  const winRate = totalTrades > 0 ? winningTrades.length / totalTrades : 0.5;
  const lossRate = 1 - winRate;

  const averageWin = winningTrades.length > 0 ? grossProfits / winningTrades.length : 0;
  const averageLoss = losingTrades.length > 0 ? grossLosses / losingTrades.length : 0;

  // Trade Expectancy: (Win Rate * Avg Win) - (Loss Rate * Avg Loss)
  const tradeExpectancy =
    totalTrades > 0
      ? Math.round((winRate * averageWin - lossRate * averageLoss) * 100) / 100
      : 0;

  // Risk-Reward Ratio (Average Win / Average Loss)
  const riskRewardRatio =
    averageLoss > 0 ? Math.round((averageWin / averageLoss) * 100) / 100 : averageWin > 0 ? 0.95 : 0.95;

  // Max Drawdown calculation from balance curve over trade history
  let peakBalance = Math.max(effectiveStartingBalance, currentBalance);
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;

  // Reconstruct equity curve forward in time
  const chronological = [...settledTrades].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let runningBalance = effectiveStartingBalance;
  let currentPeak = effectiveStartingBalance;

  chronological.forEach((t) => {
    runningBalance += t.profit || 0;
    if (runningBalance > currentPeak) {
      currentPeak = runningBalance;
    }
    const drop = currentPeak - runningBalance;
    if (drop > maxDrawdown) {
      maxDrawdown = drop;
      maxDrawdownPercent = currentPeak > 0 ? (drop / currentPeak) * 100 : 0;
    }
  });

  // Calculate current and maximum consecutive streaks
  let currentWins = 0;
  let currentLosses = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;

  chronological.forEach((t) => {
    if (t.result === 'WIN') {
      currentWins++;
      currentLosses = 0;
      if (currentWins > maxConsecutiveWins) maxConsecutiveWins = currentWins;
    } else if (t.result === 'LOSS') {
      currentLosses++;
      currentWins = 0;
      if (currentLosses > maxConsecutiveLosses) maxConsecutiveLosses = currentLosses;
    }
  });

  // Kelly stake suggestion based on recent performance
  const kellyResult = calculateDynamicStake({
    balance: currentBalance,
    winRate,
    confidence: winRate,
    mode: 'KELLY_HALF',
  });

  return {
    profitFactor,
    grossProfits: Math.round(grossProfits * 100) / 100,
    grossLosses: Math.round(grossLosses * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    maxDrawdownPercent: Math.round(maxDrawdownPercent * 10) / 10,
    tradeExpectancy,
    riskRewardRatio,
    winRate: Math.round(winRate * 1000) / 10, // e.g. 62.5%
    lossRate: Math.round(lossRate * 1000) / 10,
    totalTrades,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    averageWin: Math.round(averageWin * 100) / 100,
    averageLoss: Math.round(averageLoss * 100) / 100,
    consecutiveWins: currentWins,
    consecutiveLosses: currentLosses,
    peakBalance: Math.round(Math.max(peakBalance, currentPeak) * 100) / 100,
    troughBalance: Math.round((currentPeak - maxDrawdown) * 100) / 100,
    recommendedKellyStake: kellyResult.recommendedStake,
    kellyFraction: kellyResult.kellyFraction,
  };
}
