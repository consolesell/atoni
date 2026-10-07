import { create } from 'zustand';
import { CoreRiskMetrics, PositionSizingMode } from '../../types/trading';

interface RiskState {
  sizingMode: PositionSizingMode;
  maxPortfolioExposurePercent: number; // e.g. 6% of equity max at risk concurrently
  sessionStartingBalance: number;
  peakSessionBalance: number;
  currentDrawdownPercent: number;
  dynamicDrawdownLimitPercent: number; // starts at 5.0%, tightens as equity compounds
  circuitBreakerTripped: boolean;
  coreRiskMetrics: CoreRiskMetrics;

  setSizingMode: (mode: PositionSizingMode) => void;
  updateRiskBalance: (currentBalance: number) => void;
  setCoreRiskMetrics: (metrics: CoreRiskMetrics) => void;
  resetSessionRisk: (startingBalance: number) => void;
}

export const useRiskStore = create<RiskState>((set) => ({
  sizingMode: 'KELLY_HALF',
  maxPortfolioExposurePercent: 0.06, // 6% max equity in open positions
  sessionStartingBalance: 10.0,
  peakSessionBalance: 10.0,
  currentDrawdownPercent: 0.0,
  dynamicDrawdownLimitPercent: 5.0,
  circuitBreakerTripped: false,
  coreRiskMetrics: {
    profitFactor: 0,
    grossProfits: 0,
    grossLosses: 0,
    maxDrawdown: 0,
    maxDrawdownPercent: 0,
    tradeExpectancy: 0,
    riskRewardRatio: 2.0,
    winRate: 0,
    lossRate: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    averageWin: 0,
    averageLoss: 0,
    consecutiveWins: 0,
    consecutiveLosses: 0,
    peakBalance: 10.0,
    troughBalance: 10.0,
    recommendedKellyStake: 1.0,
    kellyFraction: 0.015,
  },

  setSizingMode: (sizingMode) => set({ sizingMode }),

  updateRiskBalance: (currentBalance) =>
    set((state) => {
      const peak = Math.max(state.peakSessionBalance, currentBalance);
      const drawdown = peak > 0 ? ((peak - currentBalance) / peak) * 100 : 0;

      // Dynamic drawdown tightening: as session equity compounds, tighten limit to lock in profits!
      // If balance grew 20% above starting: limit becomes 3.8%
      // If balance grew 50% above starting: limit becomes 2.8%
      const equityGainPct = state.sessionStartingBalance > 0
        ? ((currentBalance - state.sessionStartingBalance) / state.sessionStartingBalance) * 100
        : 0;

      let dynamicLimit = 5.0;
      if (equityGainPct >= 50) {
        dynamicLimit = 2.8;
      } else if (equityGainPct >= 20) {
        dynamicLimit = 3.8;
      }

      const circuitBreakerTripped = drawdown >= dynamicLimit;

      return {
        peakSessionBalance: peak,
        currentDrawdownPercent: Number(drawdown.toFixed(2)),
        dynamicDrawdownLimitPercent: dynamicLimit,
        circuitBreakerTripped,
      };
    }),

  setCoreRiskMetrics: (coreRiskMetrics) => set({ coreRiskMetrics }),

  resetSessionRisk: (startingBalance) =>
    set({
      sessionStartingBalance: startingBalance,
      peakSessionBalance: startingBalance,
      currentDrawdownPercent: 0,
      dynamicDrawdownLimitPercent: 5.0,
      circuitBreakerTripped: false,
    }),
}));
