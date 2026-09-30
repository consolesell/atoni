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
  minConfidenceThreshold = 0.38
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

  agents.forEach((agent) => {
    const trendSignal = (currentPrice > ma14 ? 1 : -1) * agent.weights.ma;
    const prevPrice = candles[candles.length - 2]?.close ?? currentPrice;
    const momentumSignal = ((currentPrice - prevPrice) / (prevPrice || 1)) * 1000 * agent.weights.momentum;
    const rsiSignal = (rsi < 32 ? 1.2 : rsi > 68 ? -1.2 : 0) * agent.weights.rsi;
    const bbSignal = (currentPrice <= (bb.lower ?? 0) ? 1.3 : currentPrice >= (bb.upper ?? Infinity) ? -1.3 : 0) * agent.weights.bb;

    const agentScore = trendSignal + momentumSignal + rsiSignal + bbSignal;
    agent.currentSignal = agentScore;
    agent.recommendedAction = agentScore > 1.2 ? 'BUY' : agentScore < -1.2 ? 'SELL' : 'HOLD';

    const weightedPerformance = agent.winRate * 0.7 + (agent.trades > 5 ? 0.3 : 0.1);
    if (weightedPerformance > highestWeightScore) {
      highestWeightScore = weightedPerformance;
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

  if (mtf.direction === 'BEARISH' && compositeSignal > 0 && mtf.consistency > 0.7) {
    confidence *= 0.86;
    adjustments.push('Higher timeframe bearish trend conflicts with Rise signal');
  } else if (mtf.direction === 'BULLISH' && compositeSignal < 0 && mtf.consistency > 0.7) {
    confidence *= 0.86;
    adjustments.push('Higher timeframe bullish trend conflicts with Fall signal');
  }

  if (pattern.signal.includes('BULLISH') && compositeSignal > 0) {
    confidence = Math.min(0.98, confidence * 1.12);
    adjustments.push(`Confirmed by ${pattern.pattern} pattern`);
  } else if (pattern.signal.includes('BEARISH') && compositeSignal < 0) {
    confidence = Math.min(0.98, confidence * 1.12);
    adjustments.push(`Confirmed by ${pattern.pattern} pattern`);
  }

  // Decision determination
  let action: DecisionResult['action'] = 'HOLD';
  let reason = 'Market conditions in equilibrium or below confidence gate';

  if (compositeSignal > 2.4 && confidence >= minConfidenceThreshold) {
    action = 'STRONG BUY';
    reason = `Strong Bullish Convergence (+${compositeSignal.toFixed(2)}) confirmed by ${bestAgent.displayName}`;
  } else if (compositeSignal > 1.2 && confidence >= minConfidenceThreshold) {
    action = 'BUY';
    reason = `Bullish Technical Setup (+${compositeSignal.toFixed(2)}) supported by ${indicators.regime.type}`;
  } else if (compositeSignal < -2.4 && confidence >= minConfidenceThreshold) {
    action = 'STRONG SELL';
    reason = `Strong Bearish Convergence (${compositeSignal.toFixed(2)}) confirmed by ${bestAgent.displayName}`;
  } else if (compositeSignal < -1.2 && confidence >= minConfidenceThreshold) {
    action = 'SELL';
    reason = `Bearish Technical Setup (${compositeSignal.toFixed(2)}) supported by ${indicators.regime.type}`;
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
