import {
  AIPredictionResult,
  Candle,
  EarlyExitDecision,
  EarlyExitEvaluation,
  EarlyExitPolicyConfig,
  TechnicalIndicators,
  TradeRecord,
} from '../types/trading';
import { DEFAULT_EARLY_EXIT_POLICY } from './configurationManager';
import { evaluateTrailingStop } from './trailingStopEngine';

export interface EarlySellingEvaluationInput {
  trade: TradeRecord;
  policy?: EarlyExitPolicyConfig;
  currentSpot?: number;
  candles?: Candle[];
  indicators?: Partial<TechnicalIndicators> | null;
  aiPrediction?: AIPredictionResult | null;
  decimals?: number;
  now?: number;
}

export interface EarlySellingEvaluationOutput {
  evaluation: EarlyExitEvaluation;
  updatedTrade: TradeRecord;
  profitLockTriggeredNow?: boolean;
  profitLockSecuredAmount?: number;
}

export class EarlySellingEngine {
  public resolvePolicy(
    basePolicy: EarlyExitPolicyConfig | undefined,
    strategyVersion?: string
  ): EarlyExitPolicyConfig {
    const root: EarlyExitPolicyConfig = {
      ...DEFAULT_EARLY_EXIT_POLICY,
      ...(basePolicy || {}),
    };
    if (strategyVersion && root.strategyOverrides && root.strategyOverrides[strategyVersion]) {
      return {
        ...root,
        ...root.strategyOverrides[strategyVersion],
      };
    }
    return root;
  }

  public evaluateContract(input: EarlySellingEvaluationInput): EarlySellingEvaluationOutput {
    const now = input.now ?? Date.now();
    const policy = this.resolvePolicy(input.policy, input.trade.strategyVersion);
    let workingTrade = { ...input.trade };

    const contractId = workingTrade.contract_id ?? workingTrade.id;
    const isValidToSell = Boolean(workingTrade.isValidToSell);
    const bidPrice =
      typeof workingTrade.bidPrice === 'number' && Number.isFinite(workingTrade.bidPrice)
        ? workingTrade.bidPrice
        : null;

    // Derive live P/L from Deriv bid/profit strictly (never fabricate)
    const liveProfit =
      bidPrice !== null && workingTrade.amount > 0
        ? Number((bidPrice - workingTrade.amount).toFixed(2))
        : typeof workingTrade.profit === 'number' && Number.isFinite(workingTrade.profit)
        ? Number(workingTrade.profit.toFixed(2))
        : 0;

    const returnPercent =
      workingTrade.amount > 0 ? Number(((liveProfit / workingTrade.amount) * 100).toFixed(2)) : 0;

    const prevPeakProfit = workingTrade.peakProfit ?? 0;
    const updatedPeakProfit = Math.max(prevPeakProfit, liveProfit);
    const peakReturnPercent =
      workingTrade.amount > 0
        ? Number(((updatedPeakProfit / workingTrade.amount) * 100).toFixed(2))
        : 0;
    workingTrade.peakProfit = updatedPeakProfit;

    const remainingSeconds =
      typeof workingTrade.dateExpiry === 'number' && workingTrade.dateExpiry > 0
        ? Math.max(0, Math.round((workingTrade.dateExpiry * 1000 - now) / 1000))
        : null;

    const makeResult = (
      decision: EarlyExitDecision,
      shouldSellNow: boolean,
      reason: string,
      policyTriggered: string | null,
      urgency: EarlyExitEvaluation['urgency']
    ): EarlySellingEvaluationOutput => {
      const finalSell = shouldSellNow && isValidToSell && workingTrade.result === 'PENDING';
      const evaluation: EarlyExitEvaluation = {
        contractId,
        symbol: workingTrade.symbol,
        decision: finalSell ? 'SELL' : !isValidToSell && shouldSellNow ? 'MONITOR' : decision,
        shouldSellNow: finalSell,
        isValidToSell,
        reason:
          !isValidToSell && shouldSellNow
            ? `${reason} (Waiting: Deriv is_valid_to_sell is false)`
            : reason,
        policyTriggered,
        urgency,
        expectedPnL: liveProfit,
        expectedReturnPercent: returnPercent,
        peakReturnPercent,
        remainingSeconds,
        bidPrice,
        evaluatedAt: now,
      };
      workingTrade.earlyExitDecision = evaluation.decision;
      workingTrade.earlyExitReason = evaluation.reason;
      workingTrade.earlyExitPolicyTriggered = evaluation.policyTriggered || undefined;
      workingTrade.earlyExitEvaluatedAt = now;

      return {
        evaluation,
        updatedTrade: workingTrade,
      };
    };

    if (workingTrade.result !== 'PENDING') {
      return makeResult('HOLD', false, `Contract already ${workingTrade.result}.`, null, 'LOW');
    }

    if (remainingSeconds !== null && remainingSeconds <= 0) {
      return makeResult('MONITOR', false, 'Contract reached expiry window; awaiting settlement.', null, 'LOW');
    }

    if (!policy.enabled) {
      return makeResult('HOLD', false, 'Early-selling policy evaluation disabled.', null, 'LOW');
    }

    // Evaluate Trailing Stop state cleanly if enabled on this trade
    let tslTriggered = false;
    let tslReason: string | undefined;
    let profitLockTriggeredNow = false;
    let profitLockSecuredAmount = 0;

    if (
      policy.trailingStopEnabled &&
      workingTrade.trailingStopEnabled &&
      typeof input.currentSpot === 'number' &&
      input.currentSpot > 0
    ) {
      const tslEval = evaluateTrailingStop(workingTrade, input.currentSpot, input.decimals ?? 3);
      workingTrade = {
        ...tslEval.updatedTrade,
        peakProfit: Math.max(tslEval.updatedTrade.peakProfit ?? 0, updatedPeakProfit),
      };
      tslTriggered = tslEval.isTriggered;
      tslReason = tslEval.triggerReason;
      profitLockTriggeredNow = Boolean(tslEval.profitLockTriggeredNow);
      profitLockSecuredAmount = tslEval.profitLockSecuredAmount ?? 0;
    }

    if (!isValidToSell) {
      const res = makeResult(
        'MONITOR',
        false,
        `Monitoring contract ($${liveProfit >= 0 ? '+' : ''}${liveProfit.toFixed(2)}); Deriv is_valid_to_sell is false.`,
        null,
        'LOW'
      );
      res.profitLockTriggeredNow = profitLockTriggeredNow;
      res.profitLockSecuredAmount = profitLockSecuredAmount;
      return res;
    }

    // 1. Trailing Stop Exit (highest priority when ratcheted stop is breached)
    if (tslTriggered) {
      const res = makeResult(
        'SELL',
        true,
        tslReason || 'Trailing stop threshold breached.',
        'TRAILING_STOP',
        'HIGH'
      );
      res.profitLockTriggeredNow = profitLockTriggeredNow;
      res.profitLockSecuredAmount = profitLockSecuredAmount;
      return res;
    }

    // 2. Profit Target Capture
    if (policy.profitTargetEnabled && returnPercent >= policy.profitTargetPercent && liveProfit > 0) {
      return makeResult(
        'SELL',
        true,
        `Profit target achieved (+${returnPercent.toFixed(1)}% >= +${policy.profitTargetPercent}%).`,
        'PROFIT_TARGET',
        'HIGH'
      );
    }

    // 3. Profit Protection (lock in peak gain when profit pulls back past allowable drawdown)
    if (
      policy.profitProtectionEnabled &&
      peakReturnPercent >= policy.profitLockTriggerPercent
    ) {
      const floorReturnPercent =
        peakReturnPercent * (1 - policy.profitProtectionDrawdownPercent / 100);
      if (returnPercent <= floorReturnPercent && returnPercent > 0) {
        return makeResult(
          'SELL',
          true,
          `Profit protection triggered: return dropped from peak +${peakReturnPercent.toFixed(1)}% to +${returnPercent.toFixed(1)}% (floor +${floorReturnPercent.toFixed(1)}%).`,
          'PROFIT_PROTECTION',
          'HIGH'
        );
      }
      if (returnPercent > 0) {
        return makeResult(
          'PROTECT',
          false,
          `Profit protection armed (peak +${peakReturnPercent.toFixed(1)}%, floor +${floorReturnPercent.toFixed(1)}%, live +${returnPercent.toFixed(1)}%).`,
          'PROFIT_PROTECTION_ARMED',
          'MEDIUM'
        );
      }
    }

    // 4. Max Loss / Early Cut Protection
    if (policy.maxLossExitEnabled && returnPercent <= -Math.abs(policy.maxLossPercent)) {
      return makeResult(
        'SELL',
        true,
        `Max loss cut triggered (${returnPercent.toFixed(1)}% <= -${Math.abs(policy.maxLossPercent)}%).`,
        'MAX_LOSS_CUT',
        'CRITICAL'
      );
    }

    // 5. Reversal Risk & Signal Deterioration
    const isCall =
      workingTrade.decision.includes('BUY') || workingTrade.decision.includes('CALL');
    const enoughTimeLeft = remainingSeconds === null || remainingSeconds >= policy.minRemainingSeconds;

    if (enoughTimeLeft && (policy.reversalExitEnabled || policy.signalDeteriorationEnabled)) {
      const aiOppose =
        input.aiPrediction &&
        input.aiPrediction.recommendation !== 'HOLD' &&
        ((isCall && input.aiPrediction.recommendation === 'SELL') ||
          (!isCall && input.aiPrediction.recommendation === 'BUY')) &&
        input.aiPrediction.confidence_score >= policy.reversalConfidenceThreshold;

      const rsi = input.indicators?.rsiNow;
      const ma14 = input.indicators?.ma14Now;
      const ma50 = input.indicators?.ma50Now;
      const maOppose =
        typeof ma14 === 'number' &&
        typeof ma50 === 'number' &&
        ((isCall && ma14 < ma50 * 0.999) || (!isCall && ma14 > ma50 * 1.001));
      const rsiExtremeOppose =
        typeof rsi === 'number' && ((isCall && rsi > 76) || (!isCall && rsi < 24));

      if (policy.reversalExitEnabled && aiOppose && (maOppose || liveProfit < 0)) {
        return makeResult(
          'SELL',
          true,
          `Reversal risk exit: ${input.aiPrediction?.recommendation} signal (${input.aiPrediction?.confidence_score}% conf) opposes open ${isCall ? 'CALL' : 'PUT'} with structural MA shift.`,
          'REVERSAL_RISK',
          'HIGH'
        );
      }

      if (policy.signalDeteriorationEnabled && maOppose && rsiExtremeOppose) {
        if (liveProfit > 0) {
          return makeResult(
            'SELL',
            true,
            `Signal deterioration: locking +$${liveProfit.toFixed(2)} before adverse RSI (${rsi?.toFixed(1)}) & MA reversal.`,
            'SIGNAL_DETERIORATION',
            'MEDIUM'
          );
        }
        return makeResult(
          'PROTECT',
          false,
          `Signal weakening against position (RSI ${rsi?.toFixed(1)}, MA shift). Watching for exit.`,
          'SIGNAL_DETERIORATION_WATCH',
          'MEDIUM'
        );
      }
    }

    // 6. Time-Decay Exit (optional)
    if (
      policy.timeDecayExitEnabled &&
      remainingSeconds !== null &&
      remainingSeconds <= policy.minRemainingSeconds &&
      liveProfit > 0
    ) {
      return makeResult(
        'SELL',
        true,
        `Time-decay protection: securing +$${liveProfit.toFixed(2)} with ${remainingSeconds}s remaining.`,
        'TIME_DECAY',
        'MEDIUM'
      );
    }

    return makeResult(
      'HOLD',
      false,
      `Holding position (${liveProfit >= 0 ? '+' : ''}$${liveProfit.toFixed(2)}, ${returnPercent >= 0 ? '+' : ''}${returnPercent.toFixed(1)}%).`,
      null,
      'LOW'
    );
  }
}

export const earlySellingEngine = new EarlySellingEngine();
