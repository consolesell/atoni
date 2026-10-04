import { TradeRecord, CoreRiskMetrics, PositionSizingMode, MarketRegime } from '../types/trading';

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
 * Validates and maps Deriv contract duration to the nearest legal discrete duration
 * for that symbol and contract type.
 */
export interface ValidatedDuration {
  duration: number;
  unit: 'ticks' | 'seconds' | 'minutes';
  exactLegalString: string;
  isAdjusted: boolean;
}

export function validateDerivDuration(
  symbol: string,
  requestedDuration: number,
  unit: 'ticks' | 'seconds' | 'minutes' = 'minutes'
): ValidatedDuration {
  let finalDur = requestedDuration;
  let finalUnit = unit;
  let isAdjusted = false;

  if (unit === 'ticks') {
    // Deriv synthetics tick contracts: exactly 1 to 10 ticks (discrete integers)
    const legalTicks = [1, 2, 3, 5, 8, 10];
    const rounded = Math.round(requestedDuration);
    const nearest = legalTicks.reduce((prev, curr) =>
      Math.abs(curr - rounded) < Math.abs(prev - rounded) ? curr : prev
    );
    finalDur = Math.max(1, Math.min(10, nearest));
    isAdjusted = finalDur !== requestedDuration;
  } else if (unit === 'seconds') {
    // Deriv synthetics 1HZ seconds: minimum 15 seconds, max 86400
    const clamped = Math.max(15, Math.min(86400, Math.round(requestedDuration)));
    if (clamped <= 60) {
      const nearest = [15, 30, 45, 60].reduce((prev, curr) =>
        Math.abs(curr - clamped) < Math.abs(prev - clamped) ? curr : prev
      );
      finalDur = nearest;
    } else {
      finalDur = clamped;
    }
    isAdjusted = finalDur !== requestedDuration;
  } else {
    // Deriv synthetics minutes: minimum 1m, legal discrete steps: 1, 2, 3, 5, 10, 15, 20, 30, 45, 60
    const legalMinutes = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60];
    const rounded = Math.round(requestedDuration);
    const nearest = legalMinutes.reduce((prev, curr) =>
      Math.abs(curr - rounded) < Math.abs(prev - rounded) ? curr : prev
    );
    finalDur = Math.max(1, Math.min(60, nearest));
    isAdjusted = finalDur !== requestedDuration;
  }

  return {
    duration: finalDur,
    unit: finalUnit,
    exactLegalString: `${finalDur} ${finalUnit}`,
    isAdjusted,
  };
}

/**
 * Calculates dynamic position size using the Kelly Criterion or Fixed % of Account Equity
 * to eliminate asymmetric risk and prevent single large losses from erasing streaks of wins.
 *
 * Kelly formula for binary contracts:
 * f* = (p * (b + 1) - 1) / b
 * where:
 *   p = calibrated empirical win probability
 *   b = net payout ratio (0.95 for Deriv Rise/Fall contracts)
 *
 * We apply Fractional Kelly (Quarter or Half) with strict min/max equity bounds.
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
  maxStakePercent?: number; // default 2.5% - 3.0% of balance
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
    maxStakePercent = 0.03, // 3% max equity per trade
    minStake = 1.0,
    payoutRate = 0.95,
  } = params;

  if (balance <= 0) {
    return {
      recommendedStake: minStake,
      kellyFraction: 0,
      rawKellyFraction: 0,
      winProbability: winRate,
      netOdds: payoutRate,
      mode,
      equityBoundMin: minStake,
      equityBoundMax: minStake,
      rationale: 'Zero or negative balance fallback to minimum bound.',
      expectedValue: 0,
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
    calibratedWinProb = Math.min(
      0.85,
      Math.max(0.45, winRate > 0 ? winRate * 0.6 + confidence * 0.4 : confidence)
    );
  }

  const b = payoutRate; // 0.95
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

  const equityBoundMin = Math.max(0.5, minStake);
  const equityBoundMax = Math.max(equityBoundMin, balance * maxStakePercent);

  let calculatedStake = fixedStake;
  let effectiveFraction = 0;
  let rationale = '';

  if (mode === 'FIXED') {
    calculatedStake = Math.max(equityBoundMin, Math.min(fixedStake, equityBoundMax));
    effectiveFraction = calculatedStake / balance;
    rationale = `Fixed stake of $${calculatedStake.toFixed(2)} (${(effectiveFraction * 100).toFixed(1)}% of balance).`;
  } else if (mode === 'EQUITY_PERCENT') {
    const pct = Math.min(maxStakePercent, 0.02); // 2%
    calculatedStake = Math.max(equityBoundMin, Math.min(balance * pct, equityBoundMax));
    effectiveFraction = calculatedStake / balance;
    rationale = `Fixed Equity Sizing: ${(pct * 100).toFixed(1)}% of $${balance.toFixed(2)} = $${calculatedStake.toFixed(2)}.`;
  } else {
    // Kelly Criterion
    if (rawKellyFraction <= 0) {
      // Negative expectancy under current win probability
      calculatedStake = equityBoundMin;
      effectiveFraction = calculatedStake / balance;
      rationale = `Unfavorable Kelly edge (${(rawKellyFraction * 100).toFixed(1)}%). Pruned stake to minimum safe bound ($${equityBoundMin.toFixed(2)}).`;
    } else {
      const fractionalFraction = rawKellyFraction * fractionMultiplier;
      // Cap by maxStakePercent (e.g. 3%) to prevent over-betting on high perceived win probability
      effectiveFraction = Math.min(fractionalFraction, maxStakePercent);
      const rawStake = balance * effectiveFraction;

      calculatedStake = Math.max(equityBoundMin, Math.min(rawStake, equityBoundMax));
      // Round to 2 decimal places
      calculatedStake = Math.round(calculatedStake * 100) / 100;

      rationale = `${mode === 'KELLY_QUARTER' ? 'Quarter' : 'Half'}-Kelly Sizing: Calibrated Win Prob ${(p * 100).toFixed(1)}%, Raw f* ${(rawKellyFraction * 100).toFixed(1)}% → Scaled ${(effectiveFraction * 100).toFixed(2)}% of equity ($${calculatedStake.toFixed(2)}).`;
    }
  }

  const expectedValue = (p * b - q) * calculatedStake;

  return {
    recommendedStake: Math.max(equityBoundMin, calculatedStake),
    kellyFraction: effectiveFraction,
    rawKellyFraction,
    winProbability: p,
    netOdds: b,
    mode,
    equityBoundMin,
    equityBoundMax,
    rationale,
    expectedValue,
  };
}

/**
 * Calculates core risk and performance metrics from closed trade records.
 */
export function calculateCoreRiskMetrics(
  trades: TradeRecord[],
  currentBalance: number,
  startingBalance: number = 10000
): CoreRiskMetrics {
  const settledTrades = trades.filter((t) => t.result === 'WIN' || t.result === 'LOSS');
  const winningTrades = settledTrades.filter((t) => (t.profit || 0) > 0);
  const losingTrades = settledTrades.filter((t) => (t.profit || 0) <= 0);

  const grossProfits = winningTrades.reduce((acc, t) => acc + (t.profit || 0), 0);
  const grossLosses = losingTrades.reduce((acc, t) => acc + Math.abs(t.profit || 0), 0);

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
  let peakBalance = Math.max(startingBalance, currentBalance);
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;

  // Reconstruct equity curve forward in time
  const chronological = [...settledTrades].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let runningBalance = startingBalance;
  let currentPeak = startingBalance;

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
