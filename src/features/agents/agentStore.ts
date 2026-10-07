import { create } from 'zustand';
import { TradingAgent, DecisionResult, BotState } from '../../types/trading';

export const EXPANDED_AGENTS: TradingAgent[] = [
  {
    name: 'trend_follower',
    displayName: 'Trend Follower',
    description: 'Specializes in strong directional momentum, moving average crosses, and persistent trends.',
    weights: { ma: 1.5, momentum: 1.2, rsi: 0.8, bb: 0.9 },
    wins: 0,
    trades: 0,
    winRate: 0.55,
  },
  {
    name: 'mean_reversion',
    displayName: 'Mean Reversion',
    description: 'Targets oversold/overbought extremes, Bollinger Band touches, and RSI divergences.',
    weights: { ma: 0.7, momentum: 0.6, rsi: 1.5, bb: 1.6 },
    wins: 0,
    trades: 0,
    winRate: 0.52,
  },
  {
    name: 'volatility_scalper',
    displayName: 'Volatility Scalper',
    description: 'Exploits high-volatility expansions, quick micro-structure momentum bursts, and breakouts.',
    weights: { ma: 0.8, momentum: 1.4, rsi: 0.9, bb: 1.4 },
    wins: 0,
    trades: 0,
    winRate: 0.54,
  },
  {
    name: 'balanced',
    displayName: 'Balanced Multi-Factor',
    description: 'Weighted consensus combining trend, momentum, volatility bands, and candlestick geometry.',
    weights: { ma: 1.0, momentum: 1.0, rsi: 1.0, bb: 1.0 },
    wins: 0,
    trades: 0,
    winRate: 0.58,
  },
  {
    name: 'tick_momentum',
    displayName: 'Tick Momentum Specialist',
    description: 'High-frequency sub-second velocity impulses, micro-spread breaks, and tick volume surges.',
    weights: { ma: 0.6, momentum: 1.8, rsi: 0.7, bb: 1.1 },
    wins: 0,
    trades: 0,
    winRate: 0.56,
  },
  {
    name: 'risk_sentinel',
    displayName: 'Risk Sentinel Guard',
    description: 'Guards against volatile exhaustion traps, false break traps, and MTF divergence.',
    weights: { ma: 1.1, momentum: 0.5, rsi: 1.6, bb: 1.8 },
    wins: 0,
    trades: 0,
    winRate: 0.61,
  },
];

interface AgentState {
  agents: TradingAgent[];
  activeAgent: string;
  algorithmicDecision: DecisionResult | null;
  botState: BotState;
  isAutonomousRunning: boolean;

  setAgents: (agents: TradingAgent[]) => void;
  updateAgentStats: (agentName: string, won: boolean) => void;
  setAlgorithmicDecision: (decision: DecisionResult | null) => void;
  setBotState: (updater: Partial<BotState> | ((prev: BotState) => BotState)) => void;
  setIsAutonomousRunning: (running: boolean) => void;
  evolveAgentWeights: (evolved: { name: string; weights: TradingAgent['weights'] }[]) => void;
  resetAgentPerformance: () => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: EXPANDED_AGENTS,
  activeAgent: 'balanced',
  algorithmicDecision: null,
  isAutonomousRunning: false,
  botState: {
    enabled: false,
    isPaused: false,
    pauseReason: null,
    symbol: '1HZ100V',
    granularity: 60,
    stake: 0.5,
    minConfidence: 0.38,
    adaptiveConfidenceEnabled: true,
    aiDirectionMatchRequired: true,
    maxDailyLoss: 10,
    maxConsecutiveLosses: 3,
    maxDailyTrades: 50,
    tradesToday: 0,
    dailyProfit: 0,
    consecutiveLosses: 0,
    preset: 'balanced',
    autonomousSymbolChange: true,
    allowedRotationSymbols: ['1HZ100V', '1HZ75V', '1HZ50V', '1HZ25V', '1HZ10V'],
    rotationCooldownSeconds: 90,
  },

  setAgents: (agents) => set({ agents }),

  updateAgentStats: (agentName, won) =>
    set((state) => ({
      agents: state.agents.map((ag) => {
        if (ag.name === agentName || ag.displayName === agentName) {
          const trades = ag.trades + 1;
          const wins = ag.wins + (won ? 1 : 0);
          return {
            ...ag,
            trades,
            wins,
            winRate: Number((wins / trades).toFixed(3)),
          };
        }
        return ag;
      }),
    })),

  setAlgorithmicDecision: (algorithmicDecision) => set({ algorithmicDecision }),

  setBotState: (updater) =>
    set((state) => ({
      botState: typeof updater === 'function' ? updater(state.botState) : { ...state.botState, ...updater },
    })),

  setIsAutonomousRunning: (isAutonomousRunning) => set({ isAutonomousRunning }),

  evolveAgentWeights: (evolved) =>
    set((state) => ({
      agents: state.agents.map((ag) => {
        const match = evolved.find((e) => e.name === ag.name || e.name === ag.displayName);
        return match ? { ...ag, weights: match.weights } : ag;
      }),
    })),

  resetAgentPerformance: () =>
    set({
      agents: EXPANDED_AGENTS.map((a) => ({ ...a, wins: 0, trades: 0 })),
    }),
}));
