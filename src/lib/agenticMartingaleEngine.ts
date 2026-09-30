import { AgenticMartingaleState } from '../types/trading';

export const INITIAL_AGENTIC_MARTINGALE_STATE: AgenticMartingaleState = {
  enabled: true,
  baseStake: 1.0, // Standardized $1.00 USD anchor
  currentStake: 1.0,
  multiplier: 1.85,
  maxSteps: 3, // Safe cap: 3 steps max to strictly protect $10 balance
  currentStep: 0,
  cumulativeLoss: 0,
  consecutiveLosses: 0,
  recoveryMode: 'EQUILIBRIUM',
  recoveredDrawdownAmount: 0,
  activeTacticalDeepening: false,
  minRecoveryConfluence: 72,
};

/**
 * ---------------------------------------------------------------------------
 * ADVANCED AGENTIC MARTINGALE REASONING ENGINE
 * ---------------------------------------------------------------------------
 * Loss Recovery Awareness & Tactical Adaptation Cycle:
 * - On Loss: Increases tactical analysis, re-evaluates market conditions, and applies
 *   controlled martingale scaling backed by sniper entry rules to recover losses safely.
 * - On Recovery: Once the drawdown is recovered, the agent immediately resets to
 *   base settings ($1) and applies defensive protocols to protect profits and avoid consecutive losses.
 */
export function processMartingaleTradeOutcome(
  currentState: AgenticMartingaleState,
  won: boolean,
  tradeAmount: number,
  profitOrLoss: number,
  balance: number = 10.0
): {
  nextState: AgenticMartingaleState;
  actionMessage: string;
  tacticalDirective: string;
} {
  if (!currentState.enabled) {
    return {
      nextState: {
        ...currentState,
        currentStake: currentState.baseStake,
      },
      actionMessage: 'Martingale engine disabled. Retaining base stake.',
      tacticalDirective: 'Standard execution active.',
    };
  }

  // -------------------------------------------------------------------------
  // 1. TACTICAL ADAPTATION ON LOSS
  // -------------------------------------------------------------------------
  if (!won) {
    const lossAmount = Math.abs(profitOrLoss) || tradeAmount;
    const newCumulativeLoss = Number((currentState.cumulativeLoss + lossAmount).toFixed(2));
    const newConsecutiveLosses = currentState.consecutiveLosses + 1;
    const nextStep = currentState.currentStep + 1;

    // Safety Cap check: If step exceeds maxSteps (3) or stake would exceed 45% of balance, protect capital!
    if (nextStep > currentState.maxSteps || currentState.baseStake * Math.pow(currentState.multiplier, nextStep) > balance * 0.45) {
      const resetState: AgenticMartingaleState = {
        ...currentState,
        currentStake: currentState.baseStake, // Reset back to $1.00
        currentStep: 0,
        consecutiveLosses: newConsecutiveLosses,
        cumulativeLoss: newCumulativeLoss,
        recoveryMode: 'DEFENSIVE',
        activeTacticalDeepening: true,
        minRecoveryConfluence: 85, // Maximum sniper selectivity
      };

      return {
        nextState: resetState,
        actionMessage: `⚠️ Safety Circuit Breaker: Max Martingale steps reached (${currentState.maxSteps}). Stake reset to $${currentState.baseStake.toFixed(2)} to protect balance anchor.`,
        tacticalDirective: `Entering DEFENSIVE mode. Requiring ≥85% sniper confluence before next entry.`,
      };
    }

    // Controlled Martingale Scaling backed by tactical sniper entry
    // Calculate targeted stake to recover cumulative loss + 15% margin under 95% payout
    const targetProfitNeeded = newCumulativeLoss;
    const calculatedRecoveryStake = Number((targetProfitNeeded / 0.95).toFixed(2));
    const geometricStake = Number((currentState.baseStake * Math.pow(currentState.multiplier, nextStep)).toFixed(2));
    const chosenStake = Math.min(Math.max(calculatedRecoveryStake, geometricStake), Math.min(4.50, balance * 0.45));
    const finalNextStake = Math.max(currentState.baseStake, Number(chosenStake.toFixed(2)));

    // Increased tactical analysis & higher confluence gate on loss
    const nextConfluenceThreshold = Math.min(88, 75 + nextStep * 4);

    const nextState: AgenticMartingaleState = {
      ...currentState,
      currentStep: nextStep,
      currentStake: finalNextStake,
      cumulativeLoss: newCumulativeLoss,
      consecutiveLosses: newConsecutiveLosses,
      recoveryMode: 'AGGRESSIVE_RECOVERY',
      activeTacticalDeepening: true,
      minRecoveryConfluence: nextConfluenceThreshold,
      lastLossRecoveryTimestamp: new Date().toISOString(),
    };

    return {
      nextState,
      actionMessage: `📉 [LOSS RECOVERY AWARENESS] Loss -$${lossAmount.toFixed(2)} tracked (Drawdown: $${newCumulativeLoss.toFixed(2)}). Scaling stake to $${finalNextStake.toFixed(2)} (Step ${nextStep}/${currentState.maxSteps}).`,
      tacticalDirective: `Increasing tactical analysis: Entry barred unless Sniper Confluence reaches ≥${nextConfluenceThreshold}%.`,
    };
  }

  // -------------------------------------------------------------------------
  // 2. TACTICAL ADAPTATION ON WIN / RECOVERY
  // -------------------------------------------------------------------------
  const winProfit = profitOrLoss > 0 ? profitOrLoss : tradeAmount * 0.95;
  const remainingLoss = Math.max(0, Number((currentState.cumulativeLoss - winProfit).toFixed(2)));
  const isDrawdownRecovered = remainingLoss <= 0.05 || currentState.currentStep === 0;

  if (isDrawdownRecovered) {
    const totalRecoveredThisCycle = currentState.cumulativeLoss;

    // RESET TO BASE SETTINGS ($1.00 USD) AND APPLY DEFENSIVE PROTOCOL
    const resetState: AgenticMartingaleState = {
      ...currentState,
      currentStake: currentState.baseStake, // Resets immediately to $1.00
      currentStep: 0,
      cumulativeLoss: 0,
      consecutiveLosses: 0,
      recoveryMode: 'DEFENSIVE', // Defensive protocol applied to protect profits
      recoveredDrawdownAmount: Number((currentState.recoveredDrawdownAmount + totalRecoveredThisCycle).toFixed(2)),
      activeTacticalDeepening: false,
      minRecoveryConfluence: 72,
    };

    return {
      nextState: resetState,
      actionMessage: `🎯 [DRAWDOWN RECOVERED] Profit +$${winProfit.toFixed(2)} fully recovered cycle ($${totalRecoveredThisCycle.toFixed(2)} secured). Resetting stake to $${currentState.baseStake.toFixed(2)}.`,
      tacticalDirective: `Defensive protocol active: Base $1 stake restored. Guarding profits against consecutive drawdowns.`,
    };
  } else {
    // Partial recovery: Step down controlled stake
    const steppedDownStep = Math.max(0, currentState.currentStep - 1);
    const steppedDownStake = steppedDownStep === 0
      ? currentState.baseStake
      : Number((currentState.baseStake * Math.pow(currentState.multiplier, steppedDownStep)).toFixed(2));

    const nextState: AgenticMartingaleState = {
      ...currentState,
      currentStep: steppedDownStep,
      currentStake: steppedDownStake,
      cumulativeLoss: remainingLoss,
      consecutiveLosses: 0,
      recoveryMode: 'AGGRESSIVE_RECOVERY',
      activeTacticalDeepening: true,
      minRecoveryConfluence: 76,
    };

    return {
      nextState,
      actionMessage: `📈 [PARTIAL RECOVERY] +$${winProfit.toFixed(2)} won. Remaining drawdown: $${remainingLoss.toFixed(2)}. Stepping down to $${steppedDownStake.toFixed(2)}.`,
      tacticalDirective: `Tactical step-down active: Confluence threshold set at ≥76%.`,
    };
  }
}
