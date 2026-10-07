/// <reference lib="webworker" />
import { analyzeAllIndicators } from '../lib/indicators';
import { detectPattern } from '../lib/adaptivePatternEngine';
import { runAlgorithmicDecisionEngine } from '../lib/decisionEngine';
import { IndicatorWorkerPayload, IndicatorWorkerResponse } from '../types/worker';

/**
 * Dedicated Background Web Worker for Technical Indicators, Candlestick Pattern Detection,
 * and Multi-Agent Algorithmic Deliberation.
 *
 * Offloads compute-heavy mathematical loops, array reductions, exponential smoothing,
 * Bollinger/MACD regressions, and multi-candle geometric pattern recognitions from the
 * browser's main UI thread, ensuring smooth 60fps chart rendering during high-frequency
 * Deriv synthetic tick streams.
 */

self.onmessage = (event: MessageEvent<IndicatorWorkerPayload>) => {
  const payload = event.data;
  if (!payload || !payload.candles) {
    return;
  }

  const startTime = performance.now();
  const { id, candles, tickBuffer, config, agents, minConfidence, consecutiveLosses } = payload;

  try {
    if (candles.length < 5) {
      return;
    }

    // 1. Compute full indicator stack (SMA, EMA, RSI, Bollinger Bands, ATR, MACD, Volatility, VWAP, Mood, MicroStructure)
    const indicators = analyzeAllIndicators(candles, tickBuffer || [], config);

    // 2. Compute multi-bar candlestick pattern detection with empirical machine learning weights
    const pattern = detectPattern(candles);
    if (pattern) {
      indicators.pattern = pattern;
    }

    // 3. Compute Multi-Agent Algorithmic Decision Engine if agents are provided
    let decision = undefined;
    let regime = indicators.regime;

    if (agents && agents.length > 0) {
      decision = runAlgorithmicDecisionEngine(
        candles,
        indicators,
        agents,
        minConfidence ?? 0.38,
        consecutiveLosses ?? 0
      );
      if (decision.regime) {
        regime = decision.regime;
      }
    }

    const calculationTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

    const response: IndicatorWorkerResponse = {
      id,
      type: 'SUCCESS',
      indicators,
      pattern,
      decision,
      regime,
      calculationTimeMs,
    };

    self.postMessage(response);
  } catch (err: any) {
    const errorResponse: IndicatorWorkerResponse = {
      id,
      type: 'ERROR',
      error: err?.message || String(err),
    };
    self.postMessage(errorResponse);
  }
};
