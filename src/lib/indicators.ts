import {
  Candle,
  CandlestickPatternResult,
  MarketMoodResult,
  MarketRegime,
  MicroStructureResult,
  MultiTimeframeAnalysis,
  TechnicalIndicators,
  Tick,
  VWAPAnalysis,
} from '../types/trading';
import { IndicatorSettings } from '../types/settings';

/* ---------- Advanced Mathematical Indicators ---------- */

export const calculateSMA = calcMA;
export const calculateEMA = calcEMA;
export const calculateRSI = calcRSI;
export const calculateBollingerBands = calcBollinger;
export const calculateATR = calcATR;
export const calculateMACD = calcMACD;
export const detectCandlestickPattern = identifyCandlestickPattern;
export const calculateMarketMood = marketMood;
export const calculateMultiTimeframeAnalysis = analyzeMultiTimeframeCandles;
export const calculateVWAPAnalysis = analyzeVolumeWeightedPrice;

export function calcMA(values: number[], period = 14): (number | null)[] {
  const res: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      res.push(null);
      continue;
    }
    const slice = values.slice(i - period + 1, i + 1);
    res.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return res;
}

export function calcEMA(values: number[], period = 14): (number | null)[] {
  const res: (number | null)[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      res.push(values[i]);
    } else {
      const prev = res[i - 1] ?? values[i];
      res.push(values[i] * k + prev * (1 - k));
    }
  }
  return res;
}

export function calcRSI(values: number[], period = 14): (number | null)[] {
  if (values.length <= period) return Array(values.length).fill(null);
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gains.push(Math.max(0, d));
    losses.push(Math.max(0, -d));
  }
  const rsi: (number | null)[] = Array(values.length).fill(null);
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const g = gains[i - 1];
    const l = losses[i - 1];
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

export function calcBollinger(
  values: number[],
  period = 20,
  mult = 2
): { upper: number | null; middle: number | null; lower: number | null }[] {
  const res: { upper: number | null; middle: number | null; lower: number | null }[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      res.push({ upper: null, middle: null, lower: null });
      continue;
    }
    const slice = values.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const std = Math.sqrt(variance);
    res.push({ upper: mean + mult * std, middle: mean, lower: mean - mult * std });
  }
  return res;
}

export function calcVolatility(closes: number[], period = 20): number {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  return Math.sqrt(variance);
}

export function calcMACD(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): { macdLine: (number | null)[]; signalLine: (number | null)[]; histogram: (number | null)[] } {
  const emaFast = calcEMA(values, fastPeriod);
  const emaSlow = calcEMA(values, slowPeriod);
  const macdLine: (number | null)[] = emaFast.map((f, i) => {
    const s = emaSlow[i];
    return f !== null && s !== null ? f - s : null;
  });

  const validMacd = macdLine.map((m) => m ?? 0);
  const signalLine = calcEMA(validMacd, signalPeriod);
  const histogram: (number | null)[] = macdLine.map((m, i) => {
    const s = signalLine[i];
    return m !== null && s !== null ? m - s : null;
  });

  return { macdLine, signalLine, histogram };
}

export function calcATR(candles: Candle[], period = 14): (number | null)[] {
  if (candles.length < period + 1) return Array(candles.length).fill(null);
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const atr: (number | null)[] = [null];
  const sum = tr.slice(0, period).reduce((a, b) => a + b, 0);
  atr.push(sum / period);
  for (let i = period; i < tr.length; i++) {
    const prevAtr = atr[atr.length - 1] ?? 0;
    atr.push((prevAtr * (period - 1) + tr[i]) / period);
  }
  return atr;
}

/* ---------- Market Regime Detection ---------- */

export function detectMarketRegime(candles: Candle[]): MarketRegime {
  if (candles.length < 20) {
    return { type: 'INSUFFICIENT_DATA', volatility: 0, trend: 0, confidence: 0 };
  }

  const closes = candles.map((c) => c.close);
  const volatility = calcVolatility(closes, Math.min(20, closes.length));
  const ma20 = calcMA(closes, Math.min(20, closes.length));
  const ma50 = calcMA(closes, Math.min(50, closes.length));
  const atr = calcATR(candles, Math.min(14, candles.length - 2));

  const currentPrice = closes[closes.length - 1];
  const ma20Current = ma20[ma20.length - 1];
  const ma50Current = ma50[ma50.length - 1] ?? ma20Current;
  const atrCurrent = atr[atr.length - 1];

  const trendStrength =
    ma20Current && ma50Current ? (ma20Current - ma50Current) / ma50Current : 0;

  const volPercentage = currentPrice > 0 ? volatility / currentPrice : 0;
  const isHighVol = volPercentage > 0.008;
  const isLowVol = volPercentage < 0.0015;

  let regimeType: MarketRegime['type'] = 'NEUTRAL';
  let confidence = 0.5;

  if (Math.abs(trendStrength) > 0.015 && !isLowVol) {
    regimeType = trendStrength > 0 ? 'STRONG_UPTREND' : 'STRONG_DOWNTREND';
    confidence = 0.85;
  } else if (Math.abs(trendStrength) > 0.006) {
    regimeType = trendStrength > 0 ? 'UPTREND' : 'DOWNTREND';
    confidence = 0.72;
  } else if (isHighVol) {
    regimeType = 'HIGH_VOLATILITY';
    confidence = 0.65;
  } else if (isLowVol) {
    regimeType = 'CONSOLIDATION';
    confidence = 0.68;
  } else {
    regimeType = 'SIDEWAYS';
    confidence = 0.55;
  }

  return {
    type: regimeType,
    volatility: volPercentage,
    trend: trendStrength,
    confidence,
    atr: atrCurrent,
  };
}

/* ---------- Candlestick Pattern Recognition ---------- */

export function identifyCandlestickPattern(candles: Candle[]): CandlestickPatternResult {
  if (candles.length < 3) return { pattern: 'NONE', strength: 0, signal: 'NEUTRAL' };

  const c1 = candles[candles.length - 3];
  const c2 = candles[candles.length - 2];
  const c3 = candles[candles.length - 1];

  const body1 = Math.abs(c1.close - c1.open);
  const body2 = Math.abs(c2.close - c2.open);
  const body3 = Math.abs(c3.close - c3.open);

  const range3 = c3.high - c3.low;

  const upperWick3 = c3.high - Math.max(c3.open, c3.close);
  const lowerWick3 = Math.min(c3.open, c3.close) - c3.low;

  const isBullish1 = c1.close > c1.open;
  const isBullish2 = c2.close > c2.open;
  const isBullish3 = c3.close > c3.open;

  // Doji
  if (body3 < range3 * 0.1 && range3 > 0) {
    return { pattern: 'DOJI', strength: 0.72, signal: 'REVERSAL_PENDING' };
  }

  // Hammer
  if (lowerWick3 > body3 * 2 && upperWick3 < body3 * 0.35 && isBullish3) {
    return { pattern: 'HAMMER', strength: 0.85, signal: 'BULLISH' };
  }

  // Shooting Star
  if (upperWick3 > body3 * 2 && lowerWick3 < body3 * 0.35 && !isBullish3) {
    return { pattern: 'SHOOTING_STAR', strength: 0.85, signal: 'BEARISH' };
  }

  // Bullish Engulfing
  if (!isBullish2 && isBullish3 && c3.open <= c2.close && c3.close >= c2.open && body3 > body2 * 1.15) {
    return { pattern: 'BULLISH_ENGULFING', strength: 0.88, signal: 'STRONG_BULLISH' };
  }

  // Bearish Engulfing
  if (isBullish2 && !isBullish3 && c3.open >= c2.close && c3.close <= c2.open && body3 > body2 * 1.15) {
    return { pattern: 'BEARISH_ENGULFING', strength: 0.88, signal: 'STRONG_BEARISH' };
  }

  // Three White Soldiers
  if (isBullish1 && isBullish2 && isBullish3 && c2.close > c1.close && c3.close > c2.close) {
    return { pattern: 'THREE_WHITE_SOLDIERS', strength: 0.92, signal: 'STRONG_BULLISH' };
  }

  // Three Black Crows
  if (!isBullish1 && !isBullish2 && !isBullish3 && c2.close < c1.close && c3.close < c2.close) {
    return { pattern: 'THREE_BLACK_CROWS', strength: 0.92, signal: 'STRONG_BEARISH' };
  }

  return { pattern: 'NONE', strength: 0, signal: 'NEUTRAL' };
}

/* ---------- Predictive Micro-Structure Analysis ---------- */

export function analyzeMicroStructure(
  tickBuffer: Tick[],
  currentCandle: Candle | undefined
): MicroStructureResult {
  if (tickBuffer.length < 5 || !currentCandle) {
    return { momentum: 0, volatility: 0, prediction: 'UNCERTAIN', confidence: 0.3 };
  }

  const recentTicks = tickBuffer.slice(-20);
  const prices = recentTicks.map((t) => t.quote);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const momentum = (prices[prices.length - 1] - prices[0]) / (prices[0] || 1);

  const variance =
    prices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / prices.length;
  const microVol = Math.sqrt(variance);

  let prediction = 'UNCERTAIN';
  const currentBody = Math.abs(currentCandle.close - currentCandle.open);
  const currentRange = currentCandle.high - currentCandle.low;

  if (microVol / avgPrice > 0.0005 && momentum > 0.0003) {
    prediction = 'BULLISH_CONTINUATION';
  } else if (microVol / avgPrice > 0.0005 && momentum < -0.0003) {
    prediction = 'BEARISH_CONTINUATION';
  } else if (microVol / avgPrice < 0.00015) {
    prediction = 'CONSOLIDATION_LIKELY';
  } else if (currentBody < currentRange * 0.15) {
    prediction = 'DOJI_FORMING';
  }

  return {
    momentum,
    volatility: avgPrice > 0 ? microVol / avgPrice : 0,
    prediction,
    confidence: Math.min(recentTicks.length / 20, 1),
  };
}

/* ---------- Multi-Timeframe Candle Analysis ---------- */

export function analyzeMultiTimeframeCandles(candles: Candle[]): MultiTimeframeAnalysis {
  if (!candles || candles.length < 15) {
    return { strength: 0, direction: 'NEUTRAL', consistency: 0.5 };
  }

  const recent5 = candles.slice(-5);
  const recent10 = candles.slice(-10);
  const recent20 = candles.slice(-20);

  const shortTrend =
    recent5.reduce((sum, c, i) => {
      if (i === 0) return 0;
      return sum + (c.close > recent5[i - 1].close ? 1 : -1);
    }, 0) / Math.max(1, recent5.length - 1);

  const medTrend =
    recent10.reduce((sum, c, i) => {
      if (i === 0) return 0;
      return sum + (c.close > recent10[i - 1].close ? 1 : -1);
    }, 0) / Math.max(1, recent10.length - 1);

  const longTrend =
    recent20.reduce((sum, c, i) => {
      if (i === 0) return 0;
      return sum + (c.close > recent20[i - 1].close ? 1 : -1);
    }, 0) / Math.max(1, recent20.length - 1);

  const composite = shortTrend * 0.5 + medTrend * 0.3 + longTrend * 0.2;
  const allBullish = shortTrend > 0.2 && medTrend > 0.1 && longTrend > 0;
  const allBearish = shortTrend < -0.2 && medTrend < -0.1 && longTrend < 0;
  const consistency = allBullish || allBearish ? 0.9 : Math.min(1, Math.abs(composite) + 0.3);

  return {
    strength: Math.abs(composite),
    direction: composite > 0.15 ? 'BULLISH' : composite < -0.15 ? 'BEARISH' : 'NEUTRAL',
    consistency,
    shortTrend,
    medTrend,
    longTrend,
  };
}

/* ---------- Volume Weighted Price Analysis (VWAP) ---------- */

export function analyzeVolumeWeightedPrice(candles: Candle[]): VWAPAnalysis {
  if (!candles || candles.length < 5) {
    return { vwap: 0, deviation: 0, signal: 'NEUTRAL' };
  }

  const recent = candles.slice(-20);
  let volumeSum = 0;
  let priceVolumeSum = 0;

  recent.forEach((c) => {
    const volume = c.volume || 1;
    const typicalPrice = (c.high + c.low + c.close) / 3;
    priceVolumeSum += typicalPrice * volume;
    volumeSum += volume;
  });

  const vwap = volumeSum > 0 ? priceVolumeSum / volumeSum : recent[recent.length - 1].close;
  const currentPrice = recent[recent.length - 1].close;
  const deviation = vwap > 0 ? (currentPrice - vwap) / vwap : 0;

  let signal: VWAPAnalysis['signal'] = 'NEUTRAL';
  if (deviation > 0.002) signal = 'ABOVE_VWAP';
  else if (deviation < -0.002) signal = 'BELOW_VWAP';

  return { vwap, deviation, signal, currentPrice };
}

/* ---------- Market Mood Engine ---------- */

export function marketMood(candles: Candle[]): MarketMoodResult {
  if (!candles || candles.length < 5) {
    return { mood: 'NEUTRAL', strength: 0.5, ratio: 0.5 };
  }

  const closes = candles.map((c) => c.close);
  const upMoves = closes.filter((v, i) => i > 0 && v > closes[i - 1]).length;
  const downMoves = closes.filter((v, i) => i > 0 && v < closes[i - 1]).length;
  const moodRatio = upMoves / (upMoves + downMoves || 1);

  let mood: MarketMoodResult['mood'] = 'NEUTRAL';
  let strength = 0.5;

  if (moodRatio > 0.58) {
    mood = 'BULLISH';
    strength = Math.min(1, (moodRatio - 0.5) * 2.5);
  } else if (moodRatio < 0.42) {
    mood = 'BEARISH';
    strength = Math.min(1, (0.5 - moodRatio) * 2.5);
  } else {
    strength = 1 - Math.abs(moodRatio - 0.5) * 2;
  }

  return { mood, strength: Math.max(0, Math.min(1, strength)), ratio: moodRatio };
}

/* ---------- Master Analysis Runner ---------- */

export function analyzeAllIndicators(
  candles: Candle[],
  tickBuffer: Tick[] = [],
  config?: Partial<IndicatorSettings>
): TechnicalIndicators {
  if (!candles || candles.length === 0) {
    throw new Error("Candles array is empty");
  }

  const fastMaPeriod = config?.fastMaPeriod || 14;
  const slowMaPeriod = config?.slowMaPeriod || 50;
  const rsiPeriod = config?.rsiPeriod || 14;
  const bbPeriod = config?.bbPeriod || 20;
  const bbStdDev = config?.bbStdDev || 2;
  const atrPeriod = config?.atrPeriod || 14;

  // Ensure candles used for indicator calculation belong to the same price scale
  const latestPrice = candles[candles.length - 1]?.close || 0;
  
  // Prune any historical candles belonging to previous symbols with different price orders of magnitude
  const consistentCandles = latestPrice > 0
    ? candles.filter((c) => Math.abs(c.close - latestPrice) / latestPrice < 0.35)
    : candles;
  const activeCandles = consistentCandles.length >= 10 ? consistentCandles : candles;

  const closes = activeCandles.map((c) => c.close);
  const i = closes.length - 1;
  const currentPrice = closes[i] || latestPrice;

  const ma14 = calcMA(closes, fastMaPeriod);
  const ma50 = calcMA(closes, slowMaPeriod);
  const rsi = calcRSI(closes, rsiPeriod);
  const bb = calcBollinger(closes, bbPeriod, bbStdDev);
  const macd = calcMACD(closes, 12, 26, 9);
  const atr = calcATR(activeCandles, atrPeriod);
  const volatility = calcVolatility(closes, bbPeriod);

  const regime = detectMarketRegime(activeCandles);
  const pattern = identifyCandlestickPattern(activeCandles);
  const microAnalysis = analyzeMicroStructure(tickBuffer, activeCandles[i]);
  const mtfAnalysis = analyzeMultiTimeframeCandles(activeCandles);
  const vwapAnalysis = analyzeVolumeWeightedPrice(activeCandles);
  const mood = marketMood(activeCandles);

  return {
    ma14,
    ma50,
    rsi,
    bb,
    macd,
    atr,
    volatility,
    ma14Now: ma14[i] ?? null,
    ma50Now: ma50[i] ?? null,
    rsiNow: rsi[i] ?? null,
    bbNow: bb[i] ?? null,
    macdNow: macd.histogram[i] ?? null,
    atrNow: atr[i] ?? null,
    currentPrice,
    pattern,
    microAnalysis,
    mtfAnalysis,
    vwapAnalysis,
    mood,
    regime,
  };
}
