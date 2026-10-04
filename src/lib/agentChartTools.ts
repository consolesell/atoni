import { Candle, TechnicalIndicators, MarketRegime, DecisionResult } from '../types/trading';
import { ChartDrawing, HorizontalLineDrawing, TrendLineDrawing, RectangleDrawing, FibonacciDrawing } from '../types/drawings';
import { SniperConfluenceResult, AgentChartToolsConfig } from '../types/sniper';

function safeNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  return fallback;
}

function safeFixed(val: unknown, dec = 2, fallback = '0.00'): string {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val.toFixed(Math.max(0, Math.min(8, dec)));
  }
  return fallback;
}

/**
 * Finds local pivot highs and lows in the candle array
 */
function findPivots(candles: Candle[], leftBars = 3, rightBars = 3) {
  const highs: { index: number; price: number; epoch: number }[] = [];
  const lows: { index: number; price: number; epoch: number }[] = [];

  if (!candles || candles.length < leftBars + rightBars + 1) {
    return { highs, lows };
  }

  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const current = candles[i];
    if (!current || !Number.isFinite(current.high) || !Number.isFinite(current.low)) continue;

    let isHigh = true;
    let isLow = true;

    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      const other = candles[j];
      if (!other || !Number.isFinite(other.high) || !Number.isFinite(other.low)) continue;
      if (other.high >= current.high) isHigh = false;
      if (other.low <= current.low) isLow = false;
    }

    if (isHigh) highs.push({ index: i, price: current.high, epoch: current.epoch || Date.now() });
    if (isLow) lows.push({ index: i, price: current.low, epoch: current.epoch || Date.now() });
  }

  return { highs, lows };
}

/**
 * Core Real-Time Agent Chart Drawing Generator
 * Dynamically computes and projects architectural trading tools on canvas
 */
export function generateAgentChartDrawings(
  symbol: string,
  candles: Candle[],
  indicators: TechnicalIndicators | null,
  regime: MarketRegime,
  decision: DecisionResult | null,
  sniperSetup: SniperConfluenceResult | null,
  config: AgentChartToolsConfig
): ChartDrawing[] {
  try {
    if (!config?.enabled || !candles || candles.length < 15) {
      return [];
    }

    const drawings: ChartDrawing[] = [];
    const now = Date.now();
    const latestCandle = candles[candles.length - 1];
    if (!latestCandle || !Number.isFinite(latestCandle.close)) {
      return [];
    }
    const currentPrice = latestCandle.close;
  const { highs, lows } = findPivots(candles, 2, 2);

  // ---------------------------------------------------------------------------
  // TOOL 1: KEY SUPPORT & RESISTANCE LEVELS (Structure Hunter Agent)
  // ---------------------------------------------------------------------------
  if (config.showSupportResistance) {
    // Group pivot highs into resistance levels
    if (highs.length > 0) {
      // Find the most significant recent resistance above current price
      const abovePivots = highs.filter((h) => h.price > currentPrice);
      if (abovePivots.length > 0) {
        // Sort by recency/relevance
        const nearestRes = abovePivots.sort((a, b) => a.price - b.price)[0];
        const resDrawing: HorizontalLineDrawing = {
          id: `agent-sr-res-${symbol}`,
          type: 'horizontal',
          price: nearestRes.price,
          color: '#f43f5e',
          symbol,
          createdAt: now,
          source: 'agent',
          agentName: 'Structure Hunter',
          confidence: 0.88,
          label: `[Agent: Resistance $${nearestRes.price.toFixed(2)}]`,
          sublabel: 'Ceiling Rejection Pivot',
          isRealtime: true,
        };
        drawings.push(resDrawing);
      }
    }

    // Group pivot lows into support levels
    if (lows.length > 0) {
      const belowPivots = lows.filter((l) => l.price < currentPrice);
      if (belowPivots.length > 0) {
        const nearestSup = belowPivots.sort((a, b) => b.price - a.price)[0];
        const supDrawing: HorizontalLineDrawing = {
          id: `agent-sr-sup-${symbol}`,
          type: 'horizontal',
          price: nearestSup.price,
          color: '#10b981',
          symbol,
          createdAt: now,
          source: 'agent',
          agentName: 'Structure Hunter',
          confidence: 0.9,
          label: `[Agent: Support $${nearestSup.price.toFixed(2)}]`,
          sublabel: 'Floor Demand Pivot',
          isRealtime: true,
        };
        drawings.push(supDrawing);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // TOOL 2: DYNAMIC TRENDLINE (Trend Hunter Agent)
  // ---------------------------------------------------------------------------
  if (config.showTrendlines) {
    if (regime.type === 'STRONG_UPTREND' || (decision && decision.action.includes('BUY'))) {
      // Connect two recent higher lows for ascending trendline
      if (lows.length >= 2) {
        const recentLows = lows.slice(-3);
        const p1 = recentLows[0];
        const p2 = recentLows[recentLows.length - 1];

        if (p1 && p2 && p2.index > p1.index) {
          const trendDrawing: TrendLineDrawing = {
            id: `agent-trend-up-${symbol}`,
            type: 'trendline',
            p1: { time: p1.index, price: p1.price },
            p2: { time: p2.index, price: p2.price },
            color: '#06b6d4',
            symbol,
            createdAt: now,
            source: 'agent',
            agentName: 'Trend Hunter',
            confidence: 0.84,
            label: '[Agent: Bullish Ascending Trendline]',
            sublabel: 'Support Slope',
            isRealtime: true,
          };
          drawings.push(trendDrawing);
        }
      }
    } else if (regime.type === 'STRONG_DOWNTREND' || (decision && decision.action.includes('SELL'))) {
      // Connect two recent lower highs for descending trendline
      if (highs.length >= 2) {
        const recentHighs = highs.slice(-3);
        const p1 = recentHighs[0];
        const p2 = recentHighs[recentHighs.length - 1];

        if (p1 && p2 && p2.index > p1.index) {
          const trendDrawing: TrendLineDrawing = {
            id: `agent-trend-down-${symbol}`,
            type: 'trendline',
            p1: { time: p1.index, price: p1.price },
            p2: { time: p2.index, price: p2.price },
            color: '#f97316',
            symbol,
            createdAt: now,
            source: 'agent',
            agentName: 'Trend Hunter',
            confidence: 0.84,
            label: '[Agent: Bearish Descending Trendline]',
            sublabel: 'Resistance Slope',
            isRealtime: true,
          };
          drawings.push(trendDrawing);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // TOOL 3: AUTOMATED FIBONACCI RETRACEMENT GRID (Fibonacci / Mean Reversion Agent)
  // ---------------------------------------------------------------------------
  if (config.showFibonacci && candles.length >= 25) {
    // Scan recent 40 candles for swing high and swing low
    const windowCandles = candles.slice(-45);
    let minIdx = 0;
    let maxIdx = 0;
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    windowCandles.forEach((c, idx) => {
      const globalIdx = candles.length - 45 + idx;
      if (c.low < minPrice) {
        minPrice = c.low;
        minIdx = globalIdx;
      }
      if (c.high > maxPrice) {
        maxPrice = c.high;
        maxIdx = globalIdx;
      }
    });

    if (maxPrice > minPrice && Math.abs(maxIdx - minIdx) >= 4) {
      // Draw from base swing to peak swing
      const fibDrawing: FibonacciDrawing = {
        id: `agent-fib-${symbol}`,
        type: 'fibonacci',
        p1: { time: Math.min(minIdx, maxIdx), price: minIdx < maxIdx ? minPrice : maxPrice },
        p2: { time: Math.max(minIdx, maxIdx), price: minIdx < maxIdx ? maxPrice : minPrice },
        color: '#fbbf24',
        symbol,
        createdAt: now,
        source: 'agent',
        agentName: 'Fibonacci Engine',
        confidence: 0.87,
        label: '[Agent: Golden Pocket Fib Grid]',
        sublabel: '0.618 Sniper Retracement Zone',
        isRealtime: true,
      };
      drawings.push(fibDrawing);
    }
  }

  // ---------------------------------------------------------------------------
  // TOOL 4: INSTITUTIONAL ORDER BLOCKS / FAIR VALUE GAPS (Scalper Agent)
  // ---------------------------------------------------------------------------
  if (config.showOrderBlocks && candles.length >= 12) {
    // Scan last 15 candles for Fair Value Gaps (FVG)
    // Bullish FVG: Candle 1 High < Candle 3 Low (Gap between wick 1 and wick 3)
    const scanSlice = candles.slice(-16);
    for (let i = 0; i < scanSlice.length - 2; i++) {
      const c1 = scanSlice[i];
      const c2 = scanSlice[i + 1];
      const c3 = scanSlice[i + 2];
      const globalIdx1 = candles.length - 16 + i;
      const globalIdx3 = candles.length - 16 + i + 2;

      // Bullish Imbalance FVG
      if (c3.low > c1.high && (c2.close > c2.open)) {
        const rectDrawing: RectangleDrawing = {
          id: `agent-fvg-bull-${symbol}`,
          type: 'rectangle',
          p1: { time: globalIdx1, price: c3.low },
          p2: { time: candles.length - 1, price: c1.high },
          color: '#10b981',
          symbol,
          createdAt: now,
          source: 'agent',
          agentName: 'Institutional Scalper',
          confidence: 0.85,
          label: '[Agent: Bullish Demand Order Block]',
          sublabel: 'Fair Value Imbalance Gap',
          isRealtime: true,
        };
        drawings.push(rectDrawing);
        break;
      }

      // Bearish Imbalance FVG
      if (c3.high < c1.low && (c2.close < c2.open)) {
        const rectDrawing: RectangleDrawing = {
          id: `agent-fvg-bear-${symbol}`,
          type: 'rectangle',
          p1: { time: globalIdx1, price: c1.low },
          p2: { time: candles.length - 1, price: c3.high },
          color: '#f43f5e',
          symbol,
          createdAt: now,
          source: 'agent',
          agentName: 'Institutional Scalper',
          confidence: 0.85,
          label: '[Agent: Bearish Supply Order Block]',
          sublabel: 'Fair Value Imbalance Gap',
          isRealtime: true,
        };
        drawings.push(rectDrawing);
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // TOOL 5: SNIPER ENTRY, TAKE-PROFIT & STOP-LOSS BOX (Sniper Risk Agent)
  // ---------------------------------------------------------------------------
  if (
    config.showSniperTargets &&
    sniperSetup &&
    sniperSetup.direction !== 'NEUTRAL' &&
    Number.isFinite(sniperSetup.optimalEntryPrice) &&
    Number.isFinite(sniperSetup.takeProfitPrice) &&
    Number.isFinite(sniperSetup.stopLossPrice)
  ) {
    const isCall = sniperSetup.direction === 'CALL';
    const lastIdx = candles.length - 1;
    const startX = Math.max(0, lastIdx - 8);
    const diffPts = Math.abs(sniperSetup.takeProfitPrice - sniperSetup.optimalEntryPrice);

    // Target Box (Take-Profit)
    const tpBox: RectangleDrawing = {
      id: `agent-sniper-tp-${symbol}`,
      type: 'rectangle',
      p1: { time: startX, price: sniperSetup.optimalEntryPrice },
      p2: { time: lastIdx + 6, price: sniperSetup.takeProfitPrice },
      color: '#10b981',
      symbol,
      createdAt: now,
      source: 'agent',
      agentName: 'Sniper Risk Agent',
      confidence: (sniperSetup.score || 70) / 100,
      label: `[Agent Sniper TP: +${safeFixed(diffPts, 2)} pts | R:R ${sniperSetup.riskRewardRatio || 1.8}:1]`,
      sublabel: `Take-Profit Target @ $${safeFixed(sniperSetup.takeProfitPrice, 2)}`,
      isRealtime: true,
    };
    drawings.push(tpBox);

    // Invalidation Level (Stop-Loss line)
    const slLine: HorizontalLineDrawing = {
      id: `agent-sniper-sl-${symbol}`,
      type: 'horizontal',
      price: sniperSetup.stopLossPrice,
      color: '#ef4444',
      symbol,
      createdAt: now,
      source: 'agent',
      agentName: 'Sniper Risk Agent',
      confidence: (sniperSetup.score || 70) / 100,
      label: `[Agent Sniper SL: $${safeFixed(sniperSetup.stopLossPrice, 2)}]`,
      sublabel: 'Invalidation Level',
      isRealtime: true,
    };
    drawings.push(slLine);
  }

  return drawings;
  } catch (err) {
    console.warn('generateAgentChartDrawings safe return on error:', err);
    return [];
  }
}
