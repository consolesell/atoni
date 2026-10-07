import {
  Candle,
  CandlestickPatternResult,
  DecisionResult,
  MarketRegime,
  TechnicalIndicators,
  Tick,
  TradingAgent,
} from './trading';
import { IndicatorSettings } from './settings';

export interface IndicatorWorkerPayload {
  id: number;
  candles: Candle[];
  tickBuffer: Tick[];
  config?: Partial<IndicatorSettings>;
  agents?: TradingAgent[];
  minConfidence?: number;
  consecutiveLosses?: number;
  symbol?: string;
}

export interface IndicatorWorkerSuccessResponse {
  id: number;
  type: 'SUCCESS';
  indicators: TechnicalIndicators;
  pattern: CandlestickPatternResult;
  decision?: DecisionResult;
  regime?: MarketRegime;
  calculationTimeMs: number;
}

export interface IndicatorWorkerErrorResponse {
  id: number;
  type: 'ERROR';
  error: string;
}

export type IndicatorWorkerResponse =
  | IndicatorWorkerSuccessResponse
  | IndicatorWorkerErrorResponse;

export interface IndicatorWorkerStats {
  isWorkerActive: boolean;
  calculationTimeMs: number;
  workerExecutionCount: number;
  lastCalculatedAt: number | null;
}
