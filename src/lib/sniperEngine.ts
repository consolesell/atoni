import {
  Candle,
  TechnicalIndicators,
  MarketRegime,
  DecisionResult,
  TradingAgent,
} from '../types/trading';
import {
  EnhancedTradeDuration,
  SniperConfluenceResult,
  SniperFactor,
  TradeDurationUnit,
} from '../types/sniper';

/* -------------------------------------------------------------------------- */
/* 1. ENHANCED TRADE DURATION PRESETS & ADAPTIVE COMPUTATION                  */
/* -------------------------------------------------------------------------- */

export const PRESET_DURATIONS: EnhancedTradeDuration[] = [
  // Ticks (Ultra-fast sniper scalps)
  { value: 1, unit: 'ticks', seconds: 1, label: '1 Tick', category: 'ultra_fast', rationale: 'Micro tick impulse' },
  { value: 2, unit: 'ticks', seconds: 2, label: '2 Ticks', category: 'ultra_fast', rationale: 'Sub-second velocity snap' },
  { value: 3, unit: 'ticks', seconds: 3, label: '3 Ticks', category: 'ultra_fast', rationale: 'Micro-breakout confirmation' },
  { value: 5, unit: 'ticks', seconds: 5, label: '5 Ticks', category: 'scalp', rationale: 'Institutional 5-tick sniper scalp' },
  { value: 10, unit: 'ticks', seconds: 10, label: '10 Ticks', category: 'scalp', rationale: 'Extended tick wave resolution' },

  // Seconds (High-frequency momentum contracts)
  { value: 15, unit: 'seconds', seconds: 15, label: '15s', category: 'scalp', rationale: 'Fast volatility impulse capture' },
  { value: 30, unit: 'seconds', seconds: 30, label: '30s', category: 'scalp', rationale: 'Half-minute order block reaction' },
  { value: 45, unit: 'seconds', seconds: 45, label: '45s', category: 'scalp', rationale: 'Three-candle impulse resolution' },
  { value: 60, unit: 'seconds', seconds: 60, label: '60s', category: 'standard', rationale: '1-minute candle close alignment' },

  // Minutes (Standard & Regime swing horizons)
  { value: 2, unit: 'minutes', seconds: 120, label: '2m', category: 'standard', rationale: 'Short trend expansion wave' },
  { value: 5, unit: 'minutes', seconds: 300, label: '5m', category: 'standard', rationale: 'Equilibrium swing transition' },
  { value: 15, unit: 'minutes', seconds: 900, label: '15m', category: 'swing', rationale: 'Macro trend continuation' },
  { value: 30, unit: 'minutes', seconds: 1800, label: '30m', category: 'swing', rationale: 'Higher timeframe session position' },
];

/**
 * Calculates adaptive, intelligent sniper duration based on live market physics
 */
export function calculateSniperOptimalDuration(
  regime: MarketRegime,
  volatility: number,
  confluenceScore: number,
  patternName?: string
): EnhancedTradeDuration {
  // Base volatility ratio compared to standard synthetic baseline (0.004)
  const volRatio = Math.max(0.2, volatility / 0.004);

  // 1. In high-volatility turbulence or explosive engulfing breakouts -> fast sniper ticks or short seconds
  if (volRatio > 2.2 || regime.type === 'HIGH_VOLATILITY') {
    if (confluenceScore >= 80) {
      return {
        value: 5,
        unit: 'ticks',
        seconds: 5,
        label: '5 Ticks (Adaptive)',
        category: 'scalp',
        recommendedBy: 'Sniper Volatility Engine',
        rationale: 'High ATR turbulence: immediate 5-tick sniper impulse capture',
      };
    }
    return {
      value: 15,
      unit: 'seconds',
      seconds: 15,
      label: '15s (Adaptive)',
      category: 'scalp',
      recommendedBy: 'Impulse Scalper',
      rationale: 'High velocity expansion: 15-second breakout horizon',
    };
  }

  // 2. In strong trending regimes with high confluence -> 60s or 2m - 5m
  if (regime.type === 'STRONG_UPTREND' || regime.type === 'STRONG_DOWNTREND') {
    if (volRatio < 0.8) {
      return {
        value: 5,
        unit: 'minutes',
        seconds: 300,
        label: '5m (Adaptive)',
        category: 'standard',
        recommendedBy: 'Trend Hunter Agent',
        rationale: 'Smooth persistent trend: 5-minute directional expansion',
      };
    }
    return {
      value: 60,
      unit: 'seconds',
      seconds: 60,
      label: '60s (Adaptive)',
      category: 'standard',
      recommendedBy: 'Trend Scalper',
      rationale: 'Trend alignment with moderate volatility: 60s swing lock',
    };
  }

  // 3. In consolidation / tight squeeze -> 30s or 2m
  if (regime.type === 'CONSOLIDATION') {
    return {
      value: 30,
      unit: 'seconds',
      seconds: 30,
      label: '30s (Adaptive)',
      category: 'scalp',
      recommendedBy: 'Mean Reversion Agent',
      rationale: 'Range-bound market: fast 30-second ping-pong target',
    };
  }

  // Default balanced sniper horizon
  return {
    value: 60,
    unit: 'seconds',
    seconds: 60,
    label: '60s (Adaptive)',
    category: 'standard',
    recommendedBy: 'Balanced Multi-Factor',
    rationale: 'Equilibrium conditions: standard 60-second execution window',
  };
}

/* -------------------------------------------------------------------------- */
/* 2. SNIPER ENTRY AND EXIT PRECISION ENGINE                                  */
/* -------------------------------------------------------------------------- */

export function evaluateSniperConfluence(
  currentPrice: number,
  candles: Candle[],
  indicators: TechnicalIndicators | null,
  regime: MarketRegime,
  decision: DecisionResult | null,
  agents?: TradingAgent[]
): SniperConfluenceResult {
  if (!candles || candles.length < 5 || !indicators) {
    return {
      score: 50,
      isPrimed: false,
      readinessLevel: 'MONITORING',
      direction: 'NEUTRAL',
      factors: [],
      optimalEntryPrice: currentPrice,
      entryZoneMin: currentPrice * 0.999,
      entryZoneMax: currentPrice * 1.001,
      distanceToOptimal: 0,
      distancePercent: 0,
      takeProfitPrice: currentPrice * 1.002,
      stopLossPrice: currentPrice * 0.999,
      riskRewardRatio: 2.0,
      recommendedDuration: PRESET_DURATIONS[5], // 30s
      sniperTriggerArmed: false,
      triggerCondition: 'Awaiting sufficient candle synchronization',
      summaryReason: 'Initializing indicators and order stream...',
      suggestedStakeMultiplier: 1.0,
    };
  }

  const ma14 = indicators.ma14Now ?? currentPrice;
  const ma50 = indicators.ma50Now ?? currentPrice;
  const rsi = indicators.rsiNow ?? 50;
  const bb = indicators.bbNow ?? {
    upper: currentPrice * 1.004,
    lower: currentPrice * 0.996,
    middle: currentPrice,
  };
  const atr = indicators.atrNow || Math.max(0.5, currentPrice * (indicators.volatility || 0.002));
  const pattern = indicators.pattern;

  // Determine tentative direction based on algorithmic consensus or dominant trend
  let tentativeDirection: 'CALL' | 'PUT' | 'NEUTRAL' = 'NEUTRAL';
  if (decision && decision.action.includes('BUY')) tentativeDirection = 'CALL';
  else if (decision && decision.action.includes('SELL')) tentativeDirection = 'PUT';
  else if (currentPrice > ma14 && ma14 > ma50) tentativeDirection = 'CALL';
  else if (currentPrice < ma14 && ma14 < ma50) tentativeDirection = 'PUT';

  const factors: SniperFactor[] = [];

  // VECTOR 1: Micro-Momentum & Moving Average Pullback Geometry (Weight: 25)
  let vector1Score = 0;
  let vector1Desc = '';
  if (tentativeDirection === 'CALL') {
    const isAboveMA50 = currentPrice >= ma50;
    const isNearMA14 = Math.abs(currentPrice - ma14) / (currentPrice || 1) < 0.0015;
    if (isAboveMA50 && isNearMA14) {
      vector1Score = 0.95;
      vector1Desc = 'Optimal sniper pullback to rising EMA14 support in bullish regime';
    } else if (currentPrice > ma14) {
      vector1Score = 0.8;
      vector1Desc = 'Bullish momentum extension above fast EMA14';
    } else {
      vector1Score = 0.4;
      vector1Desc = 'Price dipping below EMA14; watching for recovery';
    }
  } else if (tentativeDirection === 'PUT') {
    const isBelowMA50 = currentPrice <= ma50;
    const isNearMA14 = Math.abs(currentPrice - ma14) / (currentPrice || 1) < 0.0015;
    if (isBelowMA50 && isNearMA14) {
      vector1Score = 0.95;
      vector1Desc = 'Optimal sniper re-test of falling EMA14 resistance in bearish regime';
    } else if (currentPrice < ma14) {
      vector1Score = 0.8;
      vector1Desc = 'Bearish momentum extension below fast EMA14';
    } else {
      vector1Score = 0.4;
      vector1Desc = 'Price popping above EMA14; watching for rejection';
    }
  } else {
    vector1Score = 0.5;
    vector1Desc = 'Moving averages flat; awaiting directional break';
  }

  factors.push({
    id: 'momentum_ema',
    name: 'EMA Structure & Pullback',
    weight: 25,
    score: vector1Score,
    isMet: vector1Score >= 0.75,
    verdict: vector1Score >= 0.75 ? 'ALIGNED' : 'WAITING',
    detail: vector1Desc,
  });

  // VECTOR 2: RSI Sniper Pocket / Divergence (Weight: 20)
  let vector2Score = 0;
  let vector2Desc = '';
  if (tentativeDirection === 'CALL') {
    // In bull trend, optimal entry is a shallow pullback to 38-50 RSI
    if (rsi >= 38 && rsi <= 52) {
      vector2Score = 0.95;
      vector2Desc = `RSI in golden sniper dip zone (${rsi.toFixed(1)}): fresh upside runway`;
    } else if (rsi < 35) {
      vector2Score = 0.9;
      vector2Desc = `RSI oversold (${rsi.toFixed(1)}): prime mean-reversion spring`;
    } else if (rsi > 70) {
      vector2Score = 0.35;
      vector2Desc = `RSI overbought (${rsi.toFixed(1)}): late entry risk for CALL`;
    } else {
      vector2Score = 0.65;
      vector2Desc = `RSI moderate (${rsi.toFixed(1)})`;
    }
  } else if (tentativeDirection === 'PUT') {
    // In bear trend, optimal entry is a shallow bounce to 48-62 RSI
    if (rsi >= 48 && rsi <= 62) {
      vector2Score = 0.95;
      vector2Desc = `RSI in golden short-bounce pocket (${rsi.toFixed(1)}): fresh downside runway`;
    } else if (rsi > 65) {
      vector2Score = 0.9;
      vector2Desc = `RSI overbought (${rsi.toFixed(1)}): prime mean-reversion rejection`;
    } else if (rsi < 30) {
      vector2Score = 0.35;
      vector2Desc = `RSI oversold (${rsi.toFixed(1)}): late entry risk for PUT`;
    } else {
      vector2Score = 0.65;
      vector2Desc = `RSI moderate (${rsi.toFixed(1)})`;
    }
  } else {
    vector2Score = 0.5;
    vector2Desc = `RSI neutral at ${rsi.toFixed(1)}`;
  }

  factors.push({
    id: 'rsi_pocket',
    name: 'RSI Value Pocket',
    weight: 20,
    score: vector2Score,
    isMet: vector2Score >= 0.75,
    verdict: vector2Score >= 0.75 ? 'OPTIMAL' : 'SUB-OPTIMAL',
    detail: vector2Desc,
  });

  // VECTOR 3: Bollinger Band Extremity & Squeeze (Weight: 15)
  let vector3Score = 0;
  let vector3Desc = '';
  const bbDistLower = Math.abs(currentPrice - (bb.lower || currentPrice)) / (currentPrice || 1);
  const bbDistUpper = Math.abs(currentPrice - (bb.upper || currentPrice)) / (currentPrice || 1);

  if (tentativeDirection === 'CALL') {
    if (bbDistLower < 0.0012) {
      vector3Score = 0.95;
      vector3Desc = 'Price touching lower Bollinger Band: high probability floor bounce';
    } else if (currentPrice < (bb.middle || currentPrice)) {
      vector3Score = 0.8;
      vector3Desc = 'Trading in lower band value half; favorable discount';
    } else {
      vector3Score = 0.55;
      vector3Desc = 'Price near upper band; premium territory';
    }
  } else if (tentativeDirection === 'PUT') {
    if (bbDistUpper < 0.0012) {
      vector3Score = 0.95;
      vector3Desc = 'Price touching upper Bollinger Band: high probability ceiling rejection';
    } else if (currentPrice > (bb.middle || currentPrice)) {
      vector3Score = 0.8;
      vector3Desc = 'Trading in upper band premium half; favorable short price';
    } else {
      vector3Score = 0.55;
      vector3Desc = 'Price near lower band; discount territory';
    }
  } else {
    vector3Score = 0.5;
    vector3Desc = 'Price oscillating near Bollinger midpoint';
  }

  factors.push({
    id: 'bollinger_edge',
    name: 'Bollinger Band Margin',
    weight: 15,
    score: vector3Score,
    isMet: vector3Score >= 0.75,
    verdict: vector3Score >= 0.75 ? 'EDGE TEST' : 'MID-RANGE',
    detail: vector3Desc,
  });

  // VECTOR 4: Candlestick Geometry / Pattern Trigger (Weight: 15)
  let vector4Score = 0.5;
  let vector4Desc = 'Standard candlestick formation';
  if (pattern && pattern.pattern !== 'NONE') {
    if (tentativeDirection === 'CALL' && pattern.signal.includes('BULLISH')) {
      vector4Score = Math.min(1.0, 0.6 + pattern.strength * 0.4);
      vector4Desc = `Bullish pattern confirmation: ${pattern.pattern.replace(/_/g, ' ')} (${(pattern.strength * 100).toFixed(0)}% conviction)`;
    } else if (tentativeDirection === 'PUT' && pattern.signal.includes('BEARISH')) {
      vector4Score = Math.min(1.0, 0.6 + pattern.strength * 0.4);
      vector4Desc = `Bearish pattern confirmation: ${pattern.pattern.replace(/_/g, ' ')} (${(pattern.strength * 100).toFixed(0)}% conviction)`;
    } else {
      vector4Score = 0.35;
      vector4Desc = `Conflicting pattern detected: ${pattern.pattern.replace(/_/g, ' ')}`;
    }
  }

  factors.push({
    id: 'candle_pattern',
    name: 'Candlestick Micro-Pattern',
    weight: 15,
    score: vector4Score,
    isMet: vector4Score >= 0.75,
    verdict: vector4Score >= 0.75 ? 'CONFIRMED' : 'NEUTRAL',
    detail: vector4Desc,
  });

  // VECTOR 5: Multi-Agent Consensus Score (Weight: 15)
  let vector5Score = 0.5;
  let vector5Desc = 'Consensus in equilibrium';
  if (agents && agents.length > 0) {
    const agreeingAgents = agents.filter((ag) => {
      const rec = ag.recommendedAction;
      return tentativeDirection === 'CALL' ? rec === 'BUY' : rec === 'SELL';
    });
    const agreementRatio = agreeingAgents.length / agents.length;
    vector5Score = agreementRatio;
    vector5Desc = `${agreeingAgents.length} of ${agents.length} agents voting ${tentativeDirection} (${(agreementRatio * 100).toFixed(0)}% consensus)`;
  } else if (decision) {
    vector5Score = Math.min(1.0, decision.confidence);
    vector5Desc = `Algorithmic agent confidence: ${(decision.confidence * 100).toFixed(0)}%`;
  }

  factors.push({
    id: 'agent_consensus',
    name: 'Multi-Agent Consensus',
    weight: 15,
    score: vector5Score,
    isMet: vector5Score >= 0.75,
    verdict: vector5Score >= 0.75 ? 'HIGH CONSENSUS' : 'DIVIDED',
    detail: vector5Desc,
  });

  // VECTOR 6: Micro Market Regime Match (Weight: 10)
  let vector6Score = 0.6;
  let vector6Desc = `Regime ${regime.type}`;
  if (
    (tentativeDirection === 'CALL' && regime.type === 'STRONG_UPTREND') ||
    (tentativeDirection === 'PUT' && regime.type === 'STRONG_DOWNTREND')
  ) {
    vector6Score = 0.95;
    vector6Desc = `Tailwind alignment: ${regime.type} providing continuous trend power`;
  } else if (regime.type === 'CONSOLIDATION' || regime.type === 'SIDEWAYS' || regime.type === 'NEUTRAL') {
    vector6Score = 0.5;
    vector6Desc = 'Equilibrium regime: requires precise boundary scalp';
  } else if (regime.type === 'HIGH_VOLATILITY') {
    vector6Score = 0.75;
    vector6Desc = 'High volatility: wide pip swings favorable for micro-tick sniper execution';
  }

  factors.push({
    id: 'regime_flow',
    name: 'Macro Regime Tailwind',
    weight: 10,
    score: vector6Score,
    isMet: vector6Score >= 0.75,
    verdict: vector6Score >= 0.75 ? 'FAVORABLE' : 'NEUTRAL',
    detail: vector6Desc,
  });

  // TOTAL CONFLUENCE SCORE (0 to 100)
  const totalConfluence = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0)
  );

  const isPrimed = totalConfluence >= 75 && tentativeDirection !== 'NEUTRAL';

  // Readiness categorization
  let readinessLevel: SniperConfluenceResult['readinessLevel'] = 'BUILDING';
  if (totalConfluence >= 88 && isPrimed) readinessLevel = 'EXECUTE_NOW';
  else if (totalConfluence >= 75 && isPrimed) readinessLevel = 'SNIPER_PRIMED';
  else if (totalConfluence >= 62) readinessLevel = 'ARMED';
  else if (totalConfluence >= 48) readinessLevel = 'MONITORING';

  // -------------------------------------------------------------------------
  // SNIPER ENTRY, TAKE-PROFIT & STOP-LOSS EXACT CALCULATIONS
  // -------------------------------------------------------------------------
  const dirMultiplier = tentativeDirection === 'CALL' ? 1 : tentativeDirection === 'PUT' ? -1 : 0;

  // Optimal sniper entry is typically a slight limit pullback from spot (0.15 - 0.3 ATR)
  const entryOffset = atr * 0.18;
  const optimalEntryPrice =
    dirMultiplier === 1
      ? currentPrice - entryOffset // slight dip buy for CALL
      : dirMultiplier === -1
      ? currentPrice + entryOffset // slight spike sell for PUT
      : currentPrice;

  const entryZoneWidth = atr * 0.25;
  const entryZoneMin = Math.min(currentPrice, optimalEntryPrice) - entryZoneWidth * 0.5;
  const entryZoneMax = Math.max(currentPrice, optimalEntryPrice) + entryZoneWidth * 0.5;

  const distanceToOptimal = Math.abs(currentPrice - optimalEntryPrice);
  const distancePercent = (distanceToOptimal / (currentPrice || 1)) * 100;

  // Sniper Take-Profit: Target 1.8x ATR
  const takeProfitDistance = atr * 1.8;
  const takeProfitPrice =
    dirMultiplier === 1
      ? optimalEntryPrice + takeProfitDistance
      : dirMultiplier === -1
      ? optimalEntryPrice - takeProfitDistance
      : currentPrice * 1.005;

  // Sniper Stop-Loss: Tight invalidation at 0.75x ATR (Providing 2.4:1 Risk/Reward Ratio)
  const stopLossDistance = atr * 0.75;
  const stopLossPrice =
    dirMultiplier === 1
      ? optimalEntryPrice - stopLossDistance
      : dirMultiplier === -1
      ? optimalEntryPrice + stopLossDistance
      : currentPrice * 0.998;

  const riskRewardRatio = Number((takeProfitDistance / (stopLossDistance || 1)).toFixed(2));

  // Recommended Duration for this specific sniper setup
  const recommendedDuration = calculateSniperOptimalDuration(
    regime,
    indicators.volatility || 0.003,
    totalConfluence,
    pattern?.pattern
  );

  // Trigger Condition Text
  const triggerCondition =
    tentativeDirection === 'CALL'
      ? `Auto-fire CALL when price touches $${optimalEntryPrice.toFixed(2)} with confluence ≥ 75%`
      : tentativeDirection === 'PUT'
      ? `Auto-fire PUT when price touches $${optimalEntryPrice.toFixed(2)} with confluence ≥ 75%`
      : 'Awaiting direction trigger';

  // Summary message
  let summaryReason = '';
  if (isPrimed) {
    summaryReason = `🎯 SNIPER LOCK: ${totalConfluence}% Confluence on ${tentativeDirection}. Optimal Entry $${optimalEntryPrice.toFixed(2)} with ${riskRewardRatio}:1 R:R.`;
  } else {
    summaryReason = `Confluence at ${totalConfluence}%. Monitoring pullback to $${optimalEntryPrice.toFixed(2)}.`;
  }

  // Recommended stake scaling (multiplier 1.0 to 1.5 for prime setups)
  const suggestedStakeMultiplier = isPrimed ? (totalConfluence >= 85 ? 1.5 : 1.25) : 1.0;

  return {
    score: totalConfluence,
    isPrimed,
    readinessLevel,
    direction: tentativeDirection,
    factors,
    optimalEntryPrice,
    entryZoneMin,
    entryZoneMax,
    distanceToOptimal,
    distancePercent,
    takeProfitPrice,
    stopLossPrice,
    riskRewardRatio,
    recommendedDuration,
    sniperTriggerArmed: false,
    triggerCondition,
    summaryReason,
    suggestedStakeMultiplier,
  };
}
