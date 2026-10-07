import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Candle,
  CandlestickPatternResult,
  DecisionResult,
  MarketRegime,
  TechnicalIndicators,
  Tick,
  TradingAgent,
} from '../types/trading';
import { IndicatorSettings } from '../types/settings';
import {
  IndicatorWorkerPayload,
  IndicatorWorkerResponse,
  IndicatorWorkerStats,
} from '../types/worker';
import { analyzeAllIndicators } from '../lib/indicators';
import { detectPattern } from '../lib/adaptivePatternEngine';
import { runAlgorithmicDecisionEngine } from '../lib/decisionEngine';

interface UseIndicatorWorkerParams {
  candles: Candle[];
  tickBuffer: Tick[];
  indicatorConfig?: Partial<IndicatorSettings>;
  agents?: TradingAgent[];
  minConfidence?: number;
  consecutiveLosses?: number;
  symbol?: string;
  enabled?: boolean;
}

interface UseIndicatorWorkerReturn {
  indicators: TechnicalIndicators | null;
  pattern: CandlestickPatternResult | null;
  decision: DecisionResult | null;
  regime: MarketRegime | null;
  workerStats: IndicatorWorkerStats;
  isCalculating: boolean;
}

/**
 * Custom React Hook that offloads technical indicators calculation,
 * candlestick pattern detection, and algorithmic decision voting into
 * a dedicated Web Worker.
 *
 * Implements high-frequency tick debouncing, stale result discarding,
 * and seamless synchronous main-thread fallback if Web Workers are restricted.
 */
export function useIndicatorWorker({
  candles,
  tickBuffer,
  indicatorConfig,
  agents,
  minConfidence = 0.38,
  consecutiveLosses = 0,
  symbol,
  enabled = true,
}: UseIndicatorWorkerParams): UseIndicatorWorkerReturn {
  const [indicators, setIndicators] = useState<TechnicalIndicators | null>(null);
  const [pattern, setPattern] = useState<CandlestickPatternResult | null>(null);
  const [decision, setDecision] = useState<DecisionResult | null>(null);
  const [regime, setRegime] = useState<MarketRegime | null>(null);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);

  const [workerStats, setWorkerStats] = useState<IndicatorWorkerStats>({
    isWorkerActive: false,
    calculationTimeMs: 0,
    workerExecutionCount: 0,
    lastCalculatedAt: null,
  });

  const workerRef = useRef<Worker | null>(null);
  const isBusyRef = useRef<boolean>(false);
  const nextRequestIdRef = useRef<number>(1);
  const lastCompletedIdRef = useRef<number>(0);
  const pendingPayloadRef = useRef<IndicatorWorkerPayload | null>(null);

  // Synchronous fallback runner if Web Worker is unavailable or errors
  const runFallbackCalculation = useCallback(
    (payload: IndicatorWorkerPayload) => {
      const startTime = performance.now();
      try {
        const computedIndicators = analyzeAllIndicators(
          payload.candles,
          payload.tickBuffer || [],
          payload.config
        );
        const detectedPattern = detectPattern(payload.candles);
        if (detectedPattern) {
          computedIndicators.pattern = detectedPattern;
        }

        let computedDecision = undefined;
        let computedRegime = computedIndicators.regime;

        if (payload.agents && payload.agents.length > 0) {
          computedDecision = runAlgorithmicDecisionEngine(
            payload.candles,
            computedIndicators,
            payload.agents,
            payload.minConfidence ?? 0.38,
            payload.consecutiveLosses ?? 0
          );
          if (computedDecision.regime) {
            computedRegime = computedDecision.regime;
          }
        }

        const calcTime = Math.round((performance.now() - startTime) * 100) / 100;

        setIndicators(computedIndicators);
        setPattern(detectedPattern);
        if (computedDecision) setDecision(computedDecision);
        if (computedRegime) setRegime(computedRegime);

        setWorkerStats((prev) => ({
          ...prev,
          calculationTimeMs: calcTime,
          workerExecutionCount: prev.workerExecutionCount + 1,
          lastCalculatedAt: Date.now(),
        }));
      } catch (e) {
        console.warn('[useIndicatorWorker] Fallback calculation error:', e);
      } finally {
        setIsCalculating(false);
      }
    },
    []
  );

  // Initialize Web Worker
  useEffect(() => {
    if (typeof Worker === 'undefined') {
      setWorkerStats((prev) => ({ ...prev, isWorkerActive: false }));
      return;
    }

    let workerInstance: Worker | null = null;
    try {
      workerInstance = new Worker(
        new URL('../workers/indicatorWorker.ts', import.meta.url),
        { type: 'module' }
      );

      workerInstance.onmessage = (event: MessageEvent<IndicatorWorkerResponse>) => {
        const msg = event.data;
        if (!msg) return;

        if (msg.type === 'SUCCESS') {
          // Drop stale out-of-order calculations
          if (msg.id >= lastCompletedIdRef.current) {
            lastCompletedIdRef.current = msg.id;
            setIndicators(msg.indicators);
            setPattern(msg.pattern);
            if (msg.decision) setDecision(msg.decision);
            if (msg.regime) setRegime(msg.regime);

            setWorkerStats((prev) => ({
              ...prev,
              calculationTimeMs: msg.calculationTimeMs,
              workerExecutionCount: prev.workerExecutionCount + 1,
              lastCalculatedAt: Date.now(),
            }));
          }
        } else if (msg.type === 'ERROR') {
          console.warn('[IndicatorWorker] Background computation notice:', msg.error);
        }

        // Process pending payload if high-frequency tick arrived while busy
        if (pendingPayloadRef.current && workerInstance) {
          const nextPayload = pendingPayloadRef.current;
          pendingPayloadRef.current = null;
          isBusyRef.current = true;
          workerInstance.postMessage(nextPayload);
        } else {
          isBusyRef.current = false;
          setIsCalculating(false);
        }
      };

      workerInstance.onerror = (err) => {
        console.warn('[IndicatorWorker] Web worker runtime notice:', err);
        setWorkerStats((prev) => ({ ...prev, isWorkerActive: false }));
      };

      workerRef.current = workerInstance;
      setWorkerStats((prev) => ({ ...prev, isWorkerActive: true }));
    } catch (err) {
      console.warn('[IndicatorWorker] Failed to create worker:', err);
      setWorkerStats((prev) => ({ ...prev, isWorkerActive: false }));
    }

    return () => {
      if (workerInstance) {
        workerInstance.terminate();
      }
      workerRef.current = null;
    };
  }, []);

  // Dispatch work when inputs change
  useEffect(() => {
    if (!enabled || !candles || candles.length < 5) {
      return;
    }

    const requestId = nextRequestIdRef.current++;
    const payload: IndicatorWorkerPayload = {
      id: requestId,
      candles,
      tickBuffer,
      config: indicatorConfig,
      agents,
      minConfidence,
      consecutiveLosses,
      symbol,
    };

    setIsCalculating(true);

    const worker = workerRef.current;
    if (worker && workerStats.isWorkerActive) {
      if (isBusyRef.current) {
        // Queue latest payload, dropping obsolete intermediate ticks
        pendingPayloadRef.current = payload;
      } else {
        isBusyRef.current = true;
        worker.postMessage(payload);
      }
    } else {
      // Fallback to synchronous calculation on main thread
      runFallbackCalculation(payload);
    }
  }, [
    candles,
    tickBuffer,
    indicatorConfig,
    agents,
    minConfidence,
    consecutiveLosses,
    symbol,
    enabled,
    workerStats.isWorkerActive,
    runFallbackCalculation,
  ]);

  return {
    indicators,
    pattern,
    decision,
    regime,
    workerStats,
    isCalculating,
  };
}
