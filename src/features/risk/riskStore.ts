import { create } from 'zustand';
import { CoreRiskMetrics, PositionSizingMode } from '../../types/trading';
import { DEFAULT_TERMINAL_CONFIG } from '../../config/terminalConfig';

interface RiskState {
  sizingMode: PositionSizingMode;
  maxPortfolioExposurePercent: number;
  sessionStartingBalance: number;
  peakSessionBalance: number;
  currentDrawdownPercent: number;
  dynamicDrawdownLimitPercent: number;
  circuitBreakerTripped: boolean;
  coreRiskMetrics: CoreRiskMetrics;

  setSizingMode: (mode: PositionSizingMode) => void;
  updateRiskBalance: (currentBalance: number) => void;
  setCoreRiskMetrics: (metrics: CoreRiskMetrics) => void;
  resetSessionRisk: (startingBalance: number) => void;
}

export const useRiskStore = create<RiskState>((set) => ({
  sizingMode: 'KELLY_HALF',
  maxPortfolioExposurePercent: DEFAULT_TERMINAL_CONFIG.risk.maxPortfolioExposurePercent,
  sessionStartingBalance: 10.0,
  peakSessionBalance: 10.0,
  currentDrawdownPercent: 0.0,
  dynamicDrawdownLimitPercent: DEFAULT_TERMINAL_CONFIG.risk.maxSessionDrawdownPercent,
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
    kellyFraction: DEFAULT_TERMINAL_CONFIG.risk.defaultKellyFraction,
  },

  setSizingMode: (sizingMode) => set({ sizingMode }),

  updateRiskBalance: (currentBalance) =>
    set((state) => {
      const peak = Math.max(state.peakSessionBalance, currentBalance);
      const drawdown = peak > 0 ? ((peak - currentBalance) / peak) * 100 : 0;

      // Dynamic drawdown tightening: as session equity compounds, tighten limit to lock in profits
      const equityGainPct =
        state.sessionStartingBalance > 0
          ? ((currentBalance - state.sessionStartingBalance) / state.sessionStartingBalance) * 100
          : 0;

      let dynamicLimit = DEFAULT_TERMINAL_CONFIG.risk.maxSessionDrawdownPercent;
      if (equityGainPct >= DEFAULT_TERMINAL_CONFIG.risk.dynamicTighteningGainTier2Pct) {
        dynamicLimit = DEFAULT_TERMINAL_CONFIG.risk.dynamicTighteningDrawdown2Pct;
      } else if (equityGainPct >= DEFAULT_TERMINAL_CONFIG.risk.dynamicTighteningGainTier1Pct) {
        dynamicLimit = DEFAULT_TERMINAL_CONFIG.risk.dynamicTighteningDrawdown1Pct;
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
      dynamicDrawdownLimitPercent: DEFAULT_TERMINAL_CONFIG.risk.maxSessionDrawdownPercent,
      circuitBreakerTripped: false,
    }),
}));
