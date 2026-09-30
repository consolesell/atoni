import { Candle, CandlestickPatternResult } from '../types/trading';

export interface PatternLearningRecord {
  pattern: string;
  displayName: string;
  category: 'REVERSAL_BULL' | 'REVERSAL_BEAR' | 'CONTINUATION_BULL' | 'CONTINUATION_BEAR' | 'INDECISION';
  sampleCount: number;
  wins: number;
  losses: number;
  empiricalWinRate: number; // e.g. 0.68
  defaultWinRate: number;
  confidenceWeight: number; // 0.5 to 1.5
  lastObservedEpoch?: number;
}

const STORAGE_KEY = 'sbagent_pattern_memory_v1';

const DEFAULT_PATTERN_LIBRARY: Record<string, Omit<PatternLearningRecord, 'pattern'>> = {
  BULLISH_ENGULFING: {
    displayName: 'Bullish Engulfing',
    category: 'REVERSAL_BULL',
    sampleCount: 14,
    wins: 10,
    losses: 4,
    empiricalWinRate: 0.71,
    defaultWinRate: 0.70,
    confidenceWeight: 1.15,
  },
  BEARISH_ENGULFING: {
    displayName: 'Bearish Engulfing',
    category: 'REVERSAL_BEAR',
    sampleCount: 12,
    wins: 8,
    losses: 4,
    empiricalWinRate: 0.67,
    defaultWinRate: 0.68,
    confidenceWeight: 1.12,
  },
  HAMMER_PINBAR: {
    displayName: 'Bullish Hammer / Pin Bar',
    category: 'REVERSAL_BULL',
    sampleCount: 18,
    wins: 12,
    losses: 6,
    empiricalWinRate: 0.67,
    defaultWinRate: 0.66,
    confidenceWeight: 1.10,
  },
  SHOOTING_STAR: {
    displayName: 'Shooting Star / Bearish Pin Bar',
    category: 'REVERSAL_BEAR',
    sampleCount: 15,
    wins: 10,
    losses: 5,
    empiricalWinRate: 0.67,
    defaultWinRate: 0.66,
    confidenceWeight: 1.10,
  },
  MORNING_STAR: {
    displayName: 'Morning Star Triple-Bar Reversal',
    category: 'REVERSAL_BULL',
    sampleCount: 9,
    wins: 7,
    losses: 2,
    empiricalWinRate: 0.78,
    defaultWinRate: 0.75,
    confidenceWeight: 1.25,
  },
  EVENING_STAR: {
    displayName: 'Evening Star Triple-Bar Exhaustion',
    category: 'REVERSAL_BEAR',
    sampleCount: 8,
    wins: 6,
    losses: 2,
    empiricalWinRate: 0.75,
    defaultWinRate: 0.74,
    confidenceWeight: 1.22,
  },
  DOJI: {
    displayName: 'Neutral Indecision Doji',
    category: 'INDECISION',
    sampleCount: 22,
    wins: 12,
    losses: 10,
    empiricalWinRate: 0.54,
    defaultWinRate: 0.52,
    confidenceWeight: 0.85,
  },
  THREE_WHITE_SOLDIERS: {
    displayName: 'Three White Soldiers',
    category: 'CONTINUATION_BULL',
    sampleCount: 7,
    wins: 5,
    losses: 2,
    empiricalWinRate: 0.71,
    defaultWinRate: 0.72,
    confidenceWeight: 1.20,
  },
  THREE_BLACK_CROWS: {
    displayName: 'Three Black Crows',
    category: 'CONTINUATION_BEAR',
    sampleCount: 6,
    wins: 4,
    losses: 2,
    empiricalWinRate: 0.67,
    defaultWinRate: 0.70,
    confidenceWeight: 1.18,
  },
  TWEEZER_BOTTOM: {
    displayName: 'Tweezer Bottom Double Support',
    category: 'REVERSAL_BULL',
    sampleCount: 5,
    wins: 3,
    losses: 2,
    empiricalWinRate: 0.60,
    defaultWinRate: 0.64,
    confidenceWeight: 1.05,
  },
};

class AdaptivePatternEngine {
  private memory: Map<string, PatternLearningRecord> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          Object.entries(parsed).forEach(([pattern, data]) => {
            this.memory.set(pattern, data as PatternLearningRecord);
          });
          return;
        }
      }
    } catch (e) {
      console.warn('Pattern memory load warning:', e);
    }

    // Initialize with defaults
    Object.entries(DEFAULT_PATTERN_LIBRARY).forEach(([pattern, data]) => {
      this.memory.set(pattern, { pattern, ...data });
    });
  }

  public saveToStorage() {
    try {
      if (typeof window !== 'undefined') {
        const obj: Record<string, PatternLearningRecord> = {};
        this.memory.forEach((val, key) => {
          obj[key] = val;
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
      }
    } catch {
      // Ignore
    }
  }

  public getPatternStats(): PatternLearningRecord[] {
    return Array.from(this.memory.values());
  }

  /**
   * Evaluates candles and returns detected candlestick pattern with empirically adjusted strength.
   */
  public detectPattern(candles: Candle[]): CandlestickPatternResult & {
    patternKey: string;
    empiricalWinRate: number;
    sampleCount: number;
  } {
    if (!candles || candles.length < 3) {
      return {
        pattern: 'NONE',
        patternKey: 'NONE',
        strength: 0,
        signal: 'NEUTRAL',
        empiricalWinRate: 0.5,
        sampleCount: 0,
      };
    }

    const c1 = candles[candles.length - 3];
    const c2 = candles[candles.length - 2];
    const c3 = candles[candles.length - 1];

    const body1 = Math.abs(c1.close - c1.open);
    const body2 = Math.abs(c2.close - c2.open);
    const body3 = Math.abs(c3.close - c3.open);

    const range1 = c1.high - c1.low;
    const range2 = c2.high - c2.low;
    const range3 = c3.high - c3.low;

    const upperWick3 = c3.high - Math.max(c3.open, c3.close);
    const lowerWick3 = Math.min(c3.open, c3.close) - c3.low;

    const isBull1 = c1.close > c1.open;
    const isBull2 = c2.close > c2.open;
    const isBull3 = c3.close > c3.open;

    let detectedKey: string | null = null;
    let baseStrength = 0.5;
    let signal: CandlestickPatternResult['signal'] = 'NEUTRAL';

    // 1. Morning Star (Bearish candle -> Small-body gapping candle -> Strong Bullish candle)
    if (!isBull1 && body1 > range1 * 0.4 && body2 < range2 * 0.35 && isBull3 && c3.close > (c1.open + c1.close) / 2) {
      detectedKey = 'MORNING_STAR';
      baseStrength = 0.88;
      signal = 'STRONG_BULLISH';
    }
    // 2. Evening Star (Bullish candle -> Small-body candle -> Strong Bearish candle)
    else if (isBull1 && body1 > range1 * 0.4 && body2 < range2 * 0.35 && !isBull3 && c3.close < (c1.open + c1.close) / 2) {
      detectedKey = 'EVENING_STAR';
      baseStrength = 0.88;
      signal = 'STRONG_BEARISH';
    }
    // 3. Three White Soldiers
    else if (isBull1 && isBull2 && isBull3 && c2.close > c1.close && c3.close > c2.close && body3 > 0 && body2 > 0) {
      detectedKey = 'THREE_WHITE_SOLDIERS';
      baseStrength = 0.90;
      signal = 'STRONG_BULLISH';
    }
    // 4. Three Black Crows
    else if (!isBull1 && !isBull2 && !isBull3 && c2.close < c1.close && c3.close < c2.close && body3 > 0 && body2 > 0) {
      detectedKey = 'THREE_BLACK_CROWS';
      baseStrength = 0.90;
      signal = 'STRONG_BEARISH';
    }
    // 5. Bullish Engulfing
    else if (!isBull2 && isBull3 && c3.open <= c2.close && c3.close >= c2.open && body3 > body2 * 1.1) {
      detectedKey = 'BULLISH_ENGULFING';
      baseStrength = 0.85;
      signal = 'STRONG_BULLISH';
    }
    // 6. Bearish Engulfing
    else if (isBull2 && !isBull3 && c3.open >= c2.close && c3.close <= c2.open && body3 > body2 * 1.1) {
      detectedKey = 'BEARISH_ENGULFING';
      baseStrength = 0.85;
      signal = 'STRONG_BEARISH';
    }
    // 7. Hammer / Bullish Pin Bar
    else if (lowerWick3 > body3 * 2 && upperWick3 < body3 * 0.35 && (isBull3 || lowerWick3 > range3 * 0.6)) {
      detectedKey = 'HAMMER_PINBAR';
      baseStrength = 0.82;
      signal = 'BULLISH';
    }
    // 8. Shooting Star / Bearish Pin Bar
    else if (upperWick3 > body3 * 2 && lowerWick3 < body3 * 0.35 && (!isBull3 || upperWick3 > range3 * 0.6)) {
      detectedKey = 'SHOOTING_STAR';
      baseStrength = 0.82;
      signal = 'BEARISH';
    }
    // 9. Tweezer Bottom (Near-identical lows with reversal close)
    else if (Math.abs(c3.low - c2.low) < range3 * 0.08 && isBull3 && !isBull2) {
      detectedKey = 'TWEEZER_BOTTOM';
      baseStrength = 0.78;
      signal = 'BULLISH';
    }
    // 10. Doji
    else if (body3 <= range3 * 0.12 && range3 > 0) {
      detectedKey = 'DOJI';
      baseStrength = 0.70;
      signal = 'REVERSAL_PENDING';
    }

    if (!detectedKey) {
      return {
        pattern: 'NONE',
        patternKey: 'NONE',
        strength: 0,
        signal: 'NEUTRAL',
        empiricalWinRate: 0.5,
        sampleCount: 0,
      };
    }

    const learningRecord = this.memory.get(detectedKey);
    const empiricalWinRate = learningRecord?.empiricalWinRate ?? 0.65;
    const sampleCount = learningRecord?.sampleCount ?? 0;
    const weight = learningRecord?.confidenceWeight ?? 1.0;

    // Dynamically adjust pattern strength based on its historical empirical win probability
    const adjustedStrength = Math.min(0.98, Math.max(0.35, baseStrength * weight));

    return {
      pattern: learningRecord?.displayName || detectedKey.replace(/_/g, ' '),
      patternKey: detectedKey,
      strength: Math.round(adjustedStrength * 100) / 100,
      signal,
      empiricalWinRate: Math.round(empiricalWinRate * 100) / 100,
      sampleCount,
    };
  }

  /**
   * Adaptive Feedback Loop: Records a closed trade outcome to update pattern win-probability.
   */
  public recordTradeOutcome(patternKey: string, won: boolean) {
    if (!patternKey || patternKey === 'NONE') return;

    let rec = this.memory.get(patternKey);
    if (!rec) {
      rec = {
        pattern: patternKey,
        displayName: patternKey.replace(/_/g, ' '),
        category: won ? 'REVERSAL_BULL' : 'INDECISION',
        sampleCount: 0,
        wins: 0,
        losses: 0,
        empiricalWinRate: 0.5,
        defaultWinRate: 0.5,
        confidenceWeight: 1.0,
      };
    }

    rec.sampleCount += 1;
    if (won) {
      rec.wins += 1;
    } else {
      rec.losses += 1;
    }

    // Bayesian smoothed win probability: (wins + 2) / (samples + 4)
    rec.empiricalWinRate = (rec.wins + 2) / (rec.sampleCount + 4);

    // Adaptive Weight: scales confidence when win-rate is strong
    rec.confidenceWeight = Math.min(1.4, Math.max(0.6, rec.empiricalWinRate / 0.6));
    rec.lastObservedEpoch = Date.now();

    this.memory.set(patternKey, rec);
    this.saveToStorage();
  }

  public resetToDefaults() {
    this.memory.clear();
    Object.entries(DEFAULT_PATTERN_LIBRARY).forEach(([pattern, data]) => {
      this.memory.set(pattern, { pattern, ...data });
    });
    this.saveToStorage();
  }
}

export const adaptivePatternEngine = new AdaptivePatternEngine();

export function detectPattern(candles: Candle[]): CandlestickPatternResult {
  return adaptivePatternEngine.detectPattern(candles);
}

export function recordPatternOutcome(patternKey: string, won: boolean): void {
  adaptivePatternEngine.recordTradeOutcome(patternKey, won);
}
