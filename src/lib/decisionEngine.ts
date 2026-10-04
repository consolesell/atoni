import {
  AIPredictionResult,
  Candle,
  DecisionResult,
  MarketRegime,
  TechnicalIndicators,
  TradingAgent,
} from '../types/trading';

export const DEFAULT_AGENTS: TradingAgent[] = [
  {
    name: 'trend_follower',
    displayName: 'Trend Follower',
    description: 'Specializes in strong directional momentum, moving average crosses, and persistent trends.',
    weights: { ma: 1.5, momentum: 1.2, rsi: 0.8, bb: 0.9 },
    wins: 0,
    trades: 0,
    winRate: 0.55,
  },
  {
    name: 'mean_reversion',
    displayName: 'Mean Reversion',
    description: 'Targets oversold/overbought extremes, Bollinger Band touches, and RSI divergences.',
    weights: { ma: 0.7, momentum: 0.6, rsi: 1.5, bb: 1.6 },
    wins: 0,
    trades: 0,
    winRate: 0.52,
  },
  {
    name: 'volatility_scalper',
    displayName: 'Volatility Scalper',
    description: 'Exploits high-volatility expansions, quick micro-structure momentum bursts, and breakouts.',
    weights: { ma: 0.8, momentum: 1.4, rsi: 0.9, bb: 1.4 },
    wins: 0,
    trades: 0,
    winRate: 0.54,
  },
  {
    name: 'balanced',
    displayName: 'Balanced Multi-Factor',
    description: 'Weighted consensus combining trend, momentum, volatility bands, and candlestick geometry.',
    weights: { ma: 1.0, momentum: 1.0, rsi: 1.0, bb: 1.0 },
    wins: 0,
    trades: 0,
    winRate: 0.58,
  },
];

/* ---------- Duration Optimizer ---------- */

export function optimizeTradeDuration(
  decisionAction: string,
  regime: MarketRegime,
  volatility: number,
  confidence: number,
  pattern: { pattern: string; strength: number },
  indicators: Partial<TechnicalIndicators>
): { duration: number; riskScore: number; rationale: string } {
  let multiplier = 1.0;
  let riskScore = 0.5;
  const factors: string[] = [];

  // Volatility base move speed
  const normalVol = 0.005;
  const volRatio = normalVol > 0 ? volatility / normalVol : 1;

  if (volRatio > 2.0) {
    multiplier *= 0.65;
    riskScore = 0.75;
    factors.push(`High volatility (${(volatility * 100).toFixed(2)}%) → Fast target resolution`);
  } else if (volRatio < 0.6) {
    multiplier *= 1.35;
    riskScore = 0.35;
    factors.push(`Low volatility → Extended move formation`);
  }

  // Market Regime bias
  if (regime.type === 'STRONG_UPTREND' || regime.type === 'STRONG_DOWNTREND') {
    multiplier *= 1.3;
    riskScore = 0.3;
    factors.push('Persistent strong trend');
  } else if (regime.type === 'HIGH_VOLATILITY') {
    multiplier *= 0.7;
    riskScore = 0.8;
    factors.push('Volatile turbulence buffer');
  } else if (regime.type === 'CONSOLIDATION') {
    multiplier *= 0.9;
    riskScore = 0.6;
    factors.push('Range-bound contraction');
  }

  // Pattern-specific timing
  if (pattern.pattern === 'BULLISH_ENGULFING' || pattern.pattern === 'BEARISH_ENGULFING') {
    multiplier *= 0.75;
    factors.push('Engulfing impulse breakout');
  } else if (pattern.pattern === 'THREE_WHITE_SOLDIERS' || pattern.pattern === 'THREE_BLACK_CROWS') {
    multiplier *= 0.85;
    factors.push('3-candle momentum continuation');
  }

  // Confidence scaling
  if (confidence > 0.75) {
    multiplier *= 1.2;
    factors.push('High conviction bonus');
  } else if (confidence < 0.45) {
    multiplier *= 0.8;
    factors.push('Low conviction quick-exit');
  }

  // Calculate final minutes (base 15m)
  let minutes = 15 * multiplier;
  if (minutes <= 8) minutes = Math.round(minutes);
  else if (minutes <= 20) minutes = Math.round(minutes / 2) * 2;
  else minutes = Math.round(minutes / 5) * 5;

  const finalDuration = Math.max(5, Math.min(60, minutes));
  const rationale = factors.slice(0, 3).join(' • ') || 'Standard equilibrium duration';

  return { duration: finalDuration, riskScore, rationale };
}

/* ---------- Multi-Agent Algorithmic Deliberation ---------- */

export function runAlgorithmicDecisionEngine(
  candles: Candle[],
  indicators: TechnicalIndicators,
  agents: TradingAgent[] = DEFAULT_AGENTS,
  minConfidenceThreshold = 0.38,
  consecutiveLosses = 0
): DecisionResult {
  const currentPrice = indicators.currentPrice;
  const ma14 = indicators.ma14Now ?? currentPrice;
  const ma50 = indicators.ma50Now ?? currentPrice;
  const rsi = indicators.rsiNow ?? 50;
  const bb = indicators.bbNow ?? { upper: currentPrice * 1.01, lower: currentPrice * 0.99, middle: currentPrice };
  const macd = indicators.macdNow ?? 0;
  const pattern = indicators.pattern;
  const mood = indicators.mood ?? { mood: 'NEUTRAL', strength: 0.5, ratio: 0.5 };
  const mtf = indicators.mtfAnalysis ?? { direction: 'NEUTRAL', strength: 0.5, consistency: 0.5 };
  const vwap = indicators.vwapAnalysis ?? { signal: 'NEUTRAL', deviation: 0, vwap: currentPrice };

  // Calculate individual signals per agent
  let bestAgent = agents[0];
  let highestWeightScore = -Infinity;
  let buyVotes = 0;
  let sellVotes = 0;
  let holdVotes = 0;
  let totalAgentWeight = 0;
  let agreedAgentWeight = 0;

  agents.forEach((agent) => {
    const trendSignal = (currentPrice > ma14 ? 1 : -1) * agent.weights.ma;
    const prevPrice = candles[candles.length - 2]?.close ?? currentPrice;
    const momentumSignal = ((currentPrice - prevPrice) / (prevPrice || 1)) * 1000 * agent.weights.momentum;
    const rsiSignal = (rsi < 32 ? 1.2 : rsi > 68 ? -1.2 : 0) * agent.weights.rsi;
    const bbSignal = (currentPrice <= (bb.lower ?? 0) ? 1.3 : currentPrice >= (bb.upper ?? Infinity) ? -1.3 : 0) * agent.weights.bb;

    const agentScore = trendSignal + momentumSignal + rsiSignal + bbSignal;
    agent.currentSignal = agentScore;
    agent.recommendedAction = agentScore > 1.2 ? 'BUY' : agentScore < -1.2 ? 'SELL' : 'HOLD';

    if (agent.recommendedAction === 'BUY') buyVotes++;
    else if (agent.recommendedAction === 'SELL') sellVotes++;
    else holdVotes++;

    const agentWeight = agent.winRate * 0.7 + (agent.trades > 5 ? 0.3 : 0.1);
    totalAgentWeight += agentWeight;

    if (agentWeight > highestWeightScore) {
      highestWeightScore = agentWeight;
      bestAgent = agent;
    }
  });

  // Composite global signal
  const trendComponent = currentPrice > ma14 ? 1.2 : -1.2;
  const maCrossComponent = ma14 > ma50 ? 1.0 : -1.0;
  const rsiComponent = rsi < 30 ? 1.5 : rsi > 70 ? -1.5 : (rsi > 52 ? 0.4 : -0.4);
  const bbComponent = currentPrice <= (bb.lower ?? 0) ? 1.5 : currentPrice >= (bb.upper ?? Infinity) ? -1.5 : 0;
  const macdComponent = macd > 0 ? 0.8 : -0.8;
  const patternComponent = pattern.signal.includes('BULLISH') ? pattern.strength * 1.5 : pattern.signal.includes('BEARISH') ? -pattern.strength * 1.5 : 0;
  const moodComponent = mood.mood === 'BULLISH' ? mood.strength * 0.8 : mood.mood === 'BEARISH' ? -mood.strength * 0.8 : 0;
  const mtfComponent = mtf.direction === 'BULLISH' ? mtf.consistency * 1.2 : mtf.direction === 'BEARISH' ? -mtf.consistency * 1.2 : 0;
  const vwapComponent = vwap.signal === 'BELOW_VWAP' ? 0.5 : vwap.signal === 'ABOVE_VWAP' ? -0.5 : 0;

  const compositeSignal =
    trendComponent +
    maCrossComponent +
    rsiComponent +
    bbComponent +
    macdComponent +
    patternComponent +
    moodComponent +
    mtfComponent +
    vwapComponent;

  // Preliminary directional bias
  const preliminaryAction = compositeSignal > 1.2 ? 'BUY' : compositeSignal < -1.2 ? 'SELL' : 'HOLD';

  // Calculate consensus for the preliminary direction
  const agreeingCount = preliminaryAction === 'BUY' ? buyVotes : preliminaryAction === 'SELL' ? sellVotes : 0;
  const agreementRatio = agents.length > 0 ? agreeingCount / agents.length : 0;

  // Sum weights of agreeing agents
  agents.forEach((agent) => {
    if (agent.recommendedAction === preliminaryAction && preliminaryAction !== 'HOLD') {
      agreedAgentWeight += (agent.winRate * 0.7 + (agent.trades > 5 ? 0.3 : 0.1));
    }
  });

  const weightedAgreement = totalAgentWeight > 0 ? agreedAgentWeight / totalAgentWeight : 0;
  // Hard Consensus Rule from sbagent.md: >= 3/4 agreeing OR weighted >= 0.62
  const hasConsensus = preliminaryAction !== 'HOLD' && (agreementRatio >= 0.75 || weightedAgreement >= 0.62);

  // Base confidence calculation - calibrated to realistically scale across signals
  const absSignal = Math.abs(compositeSignal);
  const baseNormalizedSignal = Math.min(1.0, absSignal / 3.0);
  let confidence = Math.min(
    0.95,
    Math.max(
      0.35,
      0.36 + baseNormalizedSignal * 0.38 + (indicators.regime?.confidence || 0.6) * 0.16 + (pattern?.strength || 0) * 0.10
    )
  );

  const adjustments: string[] = [];

  // Verification checks & conflict penalties
  if (compositeSignal > 0 && rsi > 78) {
    confidence *= 0.88;
    adjustments.push('RSI approaching extreme overbought (>78)');
  } else if (compositeSignal < 0 && rsi < 22) {
    confidence *= 0.88;
    adjustments.push('RSI approaching extreme oversold (<22)');
  }

  // Multi-Timeframe Conflict Check
  const isMtfBearConflict = mtf.direction === 'BEARISH' && compositeSignal > 0 && mtf.consistency >= 0.65;
  const isMtfBullConflict = mtf.direction === 'BULLISH' && compositeSignal < 0 && mtf.consistency >= 0.65;

  if (isMtfBearConflict) {
    confidence *= 0.82;
    adjustments.push('Higher timeframe bearish trend conflicts with Rise signal');
  } else if (isMtfBullConflict) {
    confidence *= 0.82;
    adjustments.push('Higher timeframe bullish trend conflicts with Fall signal');
  }

  if (pattern.signal.includes('BULLISH') && compositeSignal > 0) {
    confidence = Math.min(0.98, confidence * 1.12);
    adjustments.push(`Confirmed by ${pattern.pattern} pattern`);
  } else if (pattern.signal.includes('BEARISH') && compositeSignal < 0) {
    confidence = Math.min(0.98, confidence * 1.12);
    adjustments.push(`Confirmed by ${pattern.pattern} pattern`);
  }

  // =========================================================================
  // HARD HOLD RULES ENFORCEMENT (From sbagent.md Section 4: HOLD Directives)
  // =========================================================================
  const bbUpper = bb.upper ?? (currentPrice * 1.01);
  const bbLower = bb.lower ?? (currentPrice * 0.99);
  const bbWidth = (bbUpper - bbLower) / (currentPrice || 1);
  const isBbSqueezeHold = bbWidth < 0.0015; // Tight consolidation trap rule from sbagent.md

  let action: DecisionResult['action'] = 'HOLD';
  let reason = 'Market conditions in equilibrium or below confidence gate';

  if (isBbSqueezeHold) {
    // HOLD Rule 1: Tight consolidation with Bollinger Band Width < 0.0015
    action = 'HOLD';
    reason = `⏸️ [HOLD RULE] Volatility squeeze / BB Width ${(bbWidth * 100).toFixed(3)}% < 0.15% (consolidation trap)`;
    adjustments.push('BB Width < 0.0015 hard HOLD active');
  } else if (isMtfBearConflict || isMtfBullConflict) {
    // HOLD Rule 2: Multi-Timeframe trend conflict with higher timeframe consistency >= 65%
    action = 'HOLD';
    reason = `⏸️ [HOLD RULE] Multi-Timeframe trend conflict (${mtf.direction} MTF consistency ${(mtf.consistency * 100).toFixed(0)}%)`;
    adjustments.push('MTF conflict hard HOLD active');
  } else if (consecutiveLosses >= 2) {
    // HOLD Rule 3: Consecutive losses shield (>= 2 consecutive losses triggers rotation/cooldown)
    action = 'HOLD';
    reason = `⏸️ [HOLD RULE] Consecutive losses shield (${consecutiveLosses} losses) - risk cooldown active`;
    adjustments.push('Consecutive loss shield hard HOLD active');
  } else if (!hasConsensus && preliminaryAction !== 'HOLD') {
    // HOLD Rule 4: Consensus Gate: Require >= 3/4 agreement OR weighted >= 0.62
    action = 'HOLD';
    reason = `⏸️ [HOLD RULE] Consensus gate not met (${agreeingCount}/${agents.length} agreed, weighted ${(weightedAgreement * 100).toFixed(0)}% < 62%)`;
    adjustments.push('Consensus gate (<3/4 & <62%) hard HOLD active');
  } else if (compositeSignal > 2.4 && confidence >= minConfidenceThreshold && hasConsensus) {
    action = 'STRONG BUY';
    reason = `Strong Bullish Convergence (+${compositeSignal.toFixed(2)}) with ${agreeingCount}/4 Consensus (${(weightedAgreement * 100).toFixed(0)}% weight)`;
  } else if (compositeSignal > 1.2 && confidence >= minConfidenceThreshold && hasConsensus) {
    action = 'BUY';
    reason = `Bullish Setup (+${compositeSignal.toFixed(2)}) supported by ${indicators.regime.type} (${agreeingCount}/4 Consensus)`;
  } else if (compositeSignal < -2.4 && confidence >= minConfidenceThreshold && hasConsensus) {
    action = 'STRONG SELL';
    reason = `Strong Bearish Convergence (${compositeSignal.toFixed(2)}) with ${agreeingCount}/4 Consensus (${(weightedAgreement * 100).toFixed(0)}% weight)`;
  } else if (compositeSignal < -1.2 && confidence >= minConfidenceThreshold && hasConsensus) {
    action = 'SELL';
    reason = `Bearish Setup (${compositeSignal.toFixed(2)}) supported by ${indicators.regime.type} (${agreeingCount}/4 Consensus)`;
  }

  // Duration optimization
  const durationOpt = optimizeTradeDuration(
    action,
    indicators.regime,
    indicators.volatility,
    confidence,
    pattern,
    indicators
  );

  // Targets
  const direction = action.includes('BUY') ? 1 : action.includes('SELL') ? -1 : 0;
  const moveUnit = Math.max(indicators.volatility * currentPrice, currentPrice * 0.0008);
  const targetPrice = direction !== 0 ? currentPrice + direction * moveUnit * 1.4 : undefined;
  const stopPrice = direction !== 0 ? currentPrice - direction * moveUnit * 0.75 : undefined;

  return {
    action,
    reason,
    confidence: Math.round(confidence * 100) / 100,
    compositeSignal: Math.round(compositeSignal * 100) / 100,
    indicators,
    regime: indicators.regime,
    mood,
    agent: bestAgent.name,
    duration: durationOpt.duration,
    takeProfitEnabled: true,
    takeProfitAmount: 0.4,
    targetPrice,
    stopPrice,
    adjustments,
    consensus: {
      buyVotes,
      sellVotes,
      holdVotes,
      totalAgents: agents.length,
      agreementRatio,
      weightedAgreement,
      hasConsensus,
      consensusDirection: hasConsensus ? preliminaryAction as ('BUY' | 'SELL') : 'HOLD',
      thresholdRequired: 0.62,
      rationale: hasConsensus
        ? `Consensus satisfied: ${agreeingCount}/${agents.length} agreed (${(weightedAgreement * 100).toFixed(0)}% weight)`
        : `Consensus withheld: ${agreeingCount}/${agents.length} agreed, ${(weightedAgreement * 100).toFixed(0)}% weight < 62%`,
    },
  };
}

/* ---------- Server-Side Gemini AI Prediction Fetcher ---------- */

export async function fetchGeminiAIPrediction(
  symbol: string,
  currentPrice: number,
  decision: DecisionResult,
  candles: Candle[]
): Promise<AIPredictionResult | null> {
  try {
    const res = await fetch('/api/ai/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        currentPrice,
        decision: decision.action,
        compositeSignal: decision.compositeSignal,
        regime: decision.regime,
        indicators: {
          ma14: decision.indicators.ma14Now,
          ma50: decision.indicators.ma50Now,
          rsi: decision.indicators.rsiNow,
          bb: decision.indicators.bbNow,
          volatility: decision.indicators.volatility,
          pattern: decision.indicators.pattern,
          mtf: decision.indicators.mtfAnalysis,
          mood: decision.mood,
        },
        recentCandles: candles.slice(-8),
        activeAgent: decision.agent,
      }),
    });

    if (!res.ok) {
      throw new Error(`AI prediction request failed with HTTP ${res.status}`);
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('Could not fetch Gemini AI prediction from server:', err);
    return null;
  }
}
