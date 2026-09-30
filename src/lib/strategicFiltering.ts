import {
  Candle,
  TechnicalIndicators,
  MarketRegime,
  DecisionResult,
  HighestWinGateResult,
  MarketStabilityMetrics,
} from '../types/trading';

/**
 * ---------------------------------------------------------------------------
 * STRATEGIC EXECUTION & HIGHEST-WIN PRIORITIZATION ENGINE
 * ---------------------------------------------------------------------------
 * Pre-trade evaluation engine that strictly filters out low-probability setups
 * to completely avoid unnecessary or gamble executions.
 */
export function evaluateHighestWinGate(params: {
  currentPrice: number;
  candles: Candle[];
  indicators: TechnicalIndicators | null;
  regime: MarketRegime;
  decision: DecisionResult | null;
  direction: 'CALL' | 'PUT';
  confluenceScore?: number;
  minWinProbabilityThreshold?: number; // default 62%
}): HighestWinGateResult {
  const {
    currentPrice,
    candles,
    indicators,
    regime,
    decision,
    direction,
    confluenceScore = 60,
    minWinProbabilityThreshold = 62,
  } = params;

  if (!candles || candles.length < 15 || !indicators) {
    return {
      passed: false,
      winProbabilityScore: 40,
      qualityGrade: 'REJECT',
      isGambleSetup: true,
      blockReason: 'Insufficient tick/candle stream for pre-trade win verification.',
      metrics: {
        trendQuality: 40,
        volatilityNoise: 80,
        indicatorConvergence: 40,
        confluenceRank: 40,
        regimeViability: 40,
      },
      recommendation: 'STAND_ASIDE',
    };
  }

  const isCall = direction === 'CALL';
  const ma14 = indicators.ma14Now ?? currentPrice;
  const ma50 = indicators.ma50Now ?? currentPrice;
  const rsi = indicators.rsiNow ?? 50;
  const bb = indicators.bbNow ?? { upper: currentPrice * 1.01, lower: currentPrice * 0.99, middle: currentPrice };
  const pattern = indicators.pattern;

  // 1. Trend Quality Vector (0 - 100)
  let trendQuality = 50;
  if (isCall) {
    if (currentPrice > ma14 && ma14 > ma50) trendQuality = 90;
    else if (currentPrice > ma14) trendQuality = 75;
    else if (currentPrice > ma50) trendQuality = 60;
    else trendQuality = 35; // Counter-trend buying
  } else {
    if (currentPrice < ma14 && ma14 < ma50) trendQuality = 90;
    else if (currentPrice < ma14) trendQuality = 75;
    else if (currentPrice < ma50) trendQuality = 60;
    else trendQuality = 35; // Counter-trend selling
  }

  // 2. Volatility Noise Vector (0 = purely erratic noise, 100 = clean price discovery)
  const vol = indicators.volatility || 0.003;
  let volatilityNoiseScore = 70;
  if (vol > 0.015) {
    volatilityNoiseScore = 30; // Extreme noise
  } else if (vol > 0.008) {
    volatilityNoiseScore = 55;
  } else if (vol < 0.001) {
    volatilityNoiseScore = 45; // Stagnant, spread risk
  } else {
    volatilityNoiseScore = 88; // Sweet spot
  }

  // 3. Indicator Convergence Vector (0 - 100)
  let convergenceScore = 50;
  let matchedSignals = 0;
  let conflictingSignals = 0;

  if (isCall) {
    if (rsi > 42 && rsi < 68) matchedSignals++;
    else if (rsi >= 75) conflictingSignals++; // Overbought risk
    if (currentPrice > (bb.middle || currentPrice)) matchedSignals++;
    if (pattern.signal.includes('BULLISH')) matchedSignals += 1.5;
    if (pattern.signal.includes('BEARISH')) conflictingSignals += 1.5;
  } else {
    if (rsi < 58 && rsi > 32) matchedSignals++;
    else if (rsi <= 25) conflictingSignals++; // Oversold risk
    if (currentPrice < (bb.middle || currentPrice)) matchedSignals++;
    if (pattern.signal.includes('BEARISH')) matchedSignals += 1.5;
    if (pattern.signal.includes('BULLISH')) conflictingSignals += 1.5;
  }

  convergenceScore = Math.min(100, Math.max(10, Math.round(50 + matchedSignals * 15 - conflictingSignals * 20)));

  // 4. Regime Viability (0 - 100)
  let regimeViability = 60;
  if (regime.type === 'STRONG_UPTREND') regimeViability = isCall ? 95 : 20;
  else if (regime.type === 'STRONG_DOWNTREND') regimeViability = !isCall ? 95 : 20;
  else if (regime.type === 'UPTREND') regimeViability = isCall ? 80 : 35;
  else if (regime.type === 'DOWNTREND') regimeViability = !isCall ? 80 : 35;
  else if (regime.type === 'CONSOLIDATION') regimeViability = 50;
  else if (regime.type === 'HIGH_VOLATILITY') regimeViability = 40;

  // 5. Confluence Rank (0 - 100)
  const confluenceRank = Math.min(100, Math.max(20, confluenceScore));

  // Compute Overall Win Probability Score
  const winProbabilityScore = Math.round(
    trendQuality * 0.25 +
    volatilityNoiseScore * 0.20 +
    convergenceScore * 0.25 +
    regimeViability * 0.15 +
    confluenceRank * 0.15
  );

  // Quality Grade
  let qualityGrade: HighestWinGateResult['qualityGrade'] = 'B';
  if (winProbabilityScore >= 85) qualityGrade = 'A+';
  else if (winProbabilityScore >= 75) qualityGrade = 'A';
  else if (winProbabilityScore >= 65) qualityGrade = 'B+';
  else if (winProbabilityScore >= 55) qualityGrade = 'B';
  else qualityGrade = 'REJECT';

  // Gamble Setup Detection: Filters out genuine high-risk gambles while allowing legitimate trend and momentum setups
  const isGambleSetup =
    winProbabilityScore < Math.max(35, minWinProbabilityThreshold - 12) ||
    (isCall && regime.type === 'STRONG_DOWNTREND') ||
    (!isCall && regime.type === 'STRONG_UPTREND') ||
    volatilityNoiseScore < 30 ||
    conflictingSignals >= 2.5;

  let blockReason: string | undefined;
  if (isGambleSetup) {
    if (winProbabilityScore < minWinProbabilityThreshold) {
      blockReason = `Low probability setup (${winProbabilityScore}% < ${minWinProbabilityThreshold}% threshold). Gamble execution filtered out.`;
    } else if (conflictingSignals >= 2) {
      blockReason = `Conflicting structural indicators detected (RSI extremity / reversal pattern clash).`;
    } else if (volatilityNoiseScore < 40) {
      blockReason = `Excessive market noise / volatility chop exceeds safe sniper threshold.`;
    } else {
      blockReason = `Severe regime mismatch: Attempting ${direction} contract against active ${regime.type}.`;
    }
  }

  const passed = !isGambleSetup && winProbabilityScore >= minWinProbabilityThreshold;

  return {
    passed,
    winProbabilityScore,
    qualityGrade,
    isGambleSetup,
    blockReason,
    metrics: {
      trendQuality,
      volatilityNoise: volatilityNoiseScore,
      indicatorConvergence: convergenceScore,
      confluenceRank,
      regimeViability,
    },
    recommendation: passed ? 'EXECUTE' : isGambleSetup ? 'FILTER_OUT' : 'STAND_ASIDE',
  };
}

/**
 * ---------------------------------------------------------------------------
 * MARKET STABILITY MONITORING
 * ---------------------------------------------------------------------------
 * Continuous volatility and market regime analysis.
 * If market instability or high noise is detected, recommends switching
 * execution to a stable market pair.
 */
export function analyzeMarketStability(
  symbol: string,
  candles: Candle[],
  indicators: TechnicalIndicators | null,
  regime: MarketRegime,
  allowedSymbols: string[] = ['1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V', 'R_10', 'R_25']
): MarketStabilityMetrics {
  const currentPrice = candles[candles.length - 1]?.close || 1000;
  const vol = indicators?.volatility || 0.003;
  const atr = indicators?.atrNow || currentPrice * 0.003;
  const atrPercent = (atr / (currentPrice || 1)) * 100;

  // Calculate noise ratio: ratio of wick lengths to body sizes across last 10 candles
  let totalWick = 0;
  let totalBody = 0;
  const recent = candles.slice(-10);
  for (const c of recent) {
    const body = Math.abs(c.close - c.open);
    const wick = (c.high - c.low) - body;
    totalBody += body;
    totalWick += Math.max(0, wick);
  }
  const noiseRatio = totalBody > 0 ? Number((totalWick / totalBody).toFixed(2)) : 1.5;

  // Stability Index (0 - 100): 100 = calm predictable structure, <45 = erratic noise
  let stabilityIndex = 75;
  if (regime.type === 'HIGH_VOLATILITY') stabilityIndex -= 30;
  if (regime.type === 'CONSOLIDATION') stabilityIndex -= 10;
  if (noiseRatio > 2.0) stabilityIndex -= 25;
  else if (noiseRatio > 1.2) stabilityIndex -= 12;
  if (atrPercent > 1.5) stabilityIndex -= 20;

  stabilityIndex = Math.max(10, Math.min(98, stabilityIndex));

  const isStable = stabilityIndex >= 48;
  const switchRecommended = !isStable;

  // Select target stable symbol
  let targetStableSymbol: string | undefined;
  let switchReason: string | undefined;

  if (switchRecommended) {
    // Select lowest volatility index available that is different from current
    const stableCandidates = ['1HZ10V', 'R_10', '1HZ25V', 'R_25'].filter((s) => s !== symbol && allowedSymbols.includes(s));
    targetStableSymbol = stableCandidates[0] || (symbol !== '1HZ10V' ? '1HZ10V' : 'R_10');
    switchReason = `Market instability on ${symbol} (Stability Index: ${stabilityIndex}%, Noise Ratio: ${noiseRatio}x). Auto-switching to stable baseline ${targetStableSymbol}.`;
  }

  return {
    symbol,
    stabilityIndex,
    noiseRatio,
    isStable,
    regime: regime.type,
    atrPercent: Number(atrPercent.toFixed(3)),
    switchRecommended,
    targetStableSymbol,
    switchReason,
  };
}
