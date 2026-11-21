import { AIPredictionResult, PredictionContext } from '../types/trading';
import { AutonomyManager, autonomyManager as defaultAutonomyManager } from './autonomyManager';
import {
  ConfigurationManager,
  configurationManager as defaultConfigManager,
} from './configurationManager';

export const DEFAULT_PREDICTION_TTL_MS = 60_000;

export interface PredictionContextExpectation {
  symbol: string;
  granularity?: number;
  strategyVersion?: string;
  autonomyGeneration?: number;
  configRevision?: number;
  now?: number;
}

export interface PredictionValidationResult {
  valid: boolean;
  reason?: string;
}

export class IntelligenceManager {
  private autonomy: AutonomyManager;
  private configManager: ConfigurationManager;
  private latestPrediction: AIPredictionResult | null = null;
  private latestRequestId: string | null = null;
  private listeners: Set<(prediction: AIPredictionResult | null) => void> = new Set();

  constructor(deps?: {
    autonomy?: AutonomyManager;
    configManager?: ConfigurationManager;
  }) {
    this.autonomy = deps?.autonomy ?? defaultAutonomyManager;
    this.configManager = deps?.configManager ?? defaultConfigManager;
  }

  public beginPredictionRequest(params: {
    symbol: string;
    granularity: number;
    strategyVersion?: string;
    snapshotTimestamp?: number;
    ttlMs?: number;
    provider?: string;
    model?: string;
  }): {
    context: PredictionContext;
    abortController: AbortController;
  } {
    const now = Date.now();
    const requestId = `pred_${now}_${Math.random().toString(36).slice(2, 7)}`;
    this.latestRequestId = requestId;
    const { controller, generation } = this.autonomy.registerAbortController('ai_predict');
    const cfg = this.configManager.getSnapshot();

    const context: PredictionContext = {
      requestId,
      symbol: params.symbol,
      granularity: params.granularity,
      snapshotTimestamp: params.snapshotTimestamp ?? now,
      requestTimestamp: now,
      responseTimestamp: 0,
      strategyVersion: params.strategyVersion || cfg.activeStrategyVersion,
      expiresAt: now + (params.ttlMs ?? DEFAULT_PREDICTION_TTL_MS),
      provider: params.provider || 'gemini',
      model: params.model,
      autonomyGeneration: generation,
      configRevision: cfg.revision,
    };

    return { context, abortController: controller };
  }

  public completePrediction(
    requestContext: PredictionContext,
    payload: Omit<AIPredictionResult, 'context'>,
    currentExpectation: PredictionContextExpectation
  ): { accepted: boolean; prediction: AIPredictionResult | null; reason?: string } {
    this.autonomy.releaseAbortController('ai_predict');

    const now = currentExpectation.now ?? Date.now();
    if (this.latestRequestId && requestContext.requestId !== this.latestRequestId) {
      return {
        accepted: false,
        prediction: null,
        reason: 'Superseded by a newer prediction request.',
      };
    }

    const completedContext: PredictionContext = {
      ...requestContext,
      responseTimestamp: now,
    };

    const validation = this.validatePredictionContext(completedContext, currentExpectation);
    if (!validation.valid) {
      return {
        accepted: false,
        prediction: null,
        reason: validation.reason,
      };
    }

    const enriched: AIPredictionResult = {
      ...payload,
      context: completedContext,
    };
    this.latestPrediction = enriched;
    this.notify();
    return { accepted: true, prediction: enriched };
  }

  public invalidateCurrentPrediction(reason: string): void {
    this.latestRequestId = null;
    if (this.latestPrediction !== null) {
      this.latestPrediction = null;
      this.notify();
    }
    void reason;
  }

  public getLatestPrediction(expectation?: PredictionContextExpectation): AIPredictionResult | null {
    if (!this.latestPrediction) return null;
    if (expectation && this.latestPrediction.context) {
      const check = this.validatePredictionContext(this.latestPrediction.context, expectation);
      if (!check.valid) return null;
    }
    return this.latestPrediction;
  }

  public validatePredictionContext(
    context: PredictionContext,
    expected: PredictionContextExpectation
  ): PredictionValidationResult {
    const now = expected.now ?? Date.now();

    if (!context.requestId || !context.symbol) {
      return { valid: false, reason: 'Prediction context missing required requestId or symbol.' };
    }
    if (context.symbol !== expected.symbol) {
      return {
        valid: false,
        reason: `Stale prediction symbol mismatch (${context.symbol} != active ${expected.symbol}).`,
      };
    }
    if (
      typeof expected.granularity === 'number' &&
      context.granularity !== expected.granularity
    ) {
      return {
        valid: false,
        reason: `Stale prediction timeframe mismatch (${context.granularity}s != active ${expected.granularity}s).`,
      };
    }
    if (expected.strategyVersion && context.strategyVersion !== expected.strategyVersion) {
      return {
        valid: false,
        reason: `Prediction generated under retired strategy (${context.strategyVersion} != ${expected.strategyVersion}).`,
      };
    }
    if (
      typeof expected.autonomyGeneration === 'number' &&
      typeof context.autonomyGeneration === 'number' &&
      context.autonomyGeneration !== expected.autonomyGeneration
    ) {
      return {
        valid: false,
        reason: `Prediction invalidated after stop/restart (gen ${context.autonomyGeneration} != ${expected.autonomyGeneration}).`,
      };
    }
    if (
      typeof expected.configRevision === 'number' &&
      typeof context.configRevision === 'number' &&
      context.configRevision !== expected.configRevision
    ) {
      return {
        valid: false,
        reason: `Prediction invalidated by configuration update (rev ${context.configRevision} != ${expected.configRevision}).`,
      };
    }
    if (!Number.isFinite(context.expiresAt) || now > context.expiresAt) {
      return {
        valid: false,
        reason: 'AI prediction expired; fresh market scan required.',
      };
    }

    return { valid: true };
  }

  public subscribe(listener: (prediction: AIPredictionResult | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.latestPrediction);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.latestPrediction);
    }
  }
}

export const intelligenceManager = new IntelligenceManager();
