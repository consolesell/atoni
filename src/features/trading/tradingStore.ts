import { create } from 'zustand';
import { TradeRecord, TrailingStopConfig } from '../../types/trading';
import { TradeDurationUnit } from '../../types/sniper';

interface TradingState {
  // Account & Execution
  balance: number;
  currency: string;
  loginid: string;
  isAuthorized: boolean;
  isLiveMode: boolean;
  isExecuting: boolean;

  // Active Order Parameters
  selectedSymbol: string;
  granularity: number;
  stake: number;
  duration: number;
  durationUnit: TradeDurationUnit;
  direction: 'CALL' | 'PUT';

  // Positions
  openTrades: TradeRecord[];
  closedTrades: TradeRecord[];

  // Trailing Stop Config
  trailingStopConfig: TrailingStopConfig;

  // Actions
  setBalance: (balance: number) => void;
  setCurrency: (currency: string) => void;
  setLoginid: (loginid: string) => void;
  setIsAuthorized: (isAuthorized: boolean) => void;
  setIsLiveMode: (isLiveMode: boolean) => void;
  setIsExecuting: (isExecuting: boolean) => void;
  setSelectedSymbol: (symbol: string) => void;
  setGranularity: (granularity: number) => void;
  setStake: (stake: number) => void;
  setDuration: (duration: number, unit?: TradeDurationUnit) => void;
  setDirection: (direction: 'CALL' | 'PUT') => void;
  setTrailingStopConfig: (config: TrailingStopConfig) => void;

  // Trade management
  addOpenTrade: (trade: TradeRecord) => void;
  updateOpenTrade: (id: string, updates: Partial<TradeRecord>) => void;
  closeTrade: (id: string, result: 'WIN' | 'LOSS' | 'SOLD', profit: number, exitPrice: number, exitReason?: string) => void;
  setClosedTrades: (trades: TradeRecord[]) => void;
  clearHistory: () => void;
}

export const useTradingStore = create<TradingState>((set) => ({
  balance: 10.0,
  currency: 'USD',
  loginid: 'VRTC_VIRTUAL_10',
  isAuthorized: false,
  isLiveMode: false,
  isExecuting: false,

  selectedSymbol: '1HZ100V',
  granularity: 60,
  stake: 0.5,
  duration: 15,
  durationUnit: 'minutes',
  direction: 'CALL',

  openTrades: [],
  closedTrades: [],

  trailingStopConfig: {
    enabled: true,
    distanceType: 'ATR',
    distanceValue: 1.5,
    profitLockEnabled: true,
    profitLockThresholdPercent: 50,
  },

  setBalance: (balance) => set({ balance }),
  setCurrency: (currency) => set({ currency }),
  setLoginid: (loginid) => set({ loginid }),
  setIsAuthorized: (isAuthorized) => set({ isAuthorized }),
  setIsLiveMode: (isLiveMode) => set({ isLiveMode }),
  setIsExecuting: (isExecuting) => set({ isExecuting }),
  setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),
  setGranularity: (granularity) => set({ granularity }),
  setStake: (stake) => set({ stake }),
  setDuration: (duration, unit) =>
    set((state) => ({ duration, durationUnit: unit || state.durationUnit })),
  setDirection: (direction) => set({ direction }),
  setTrailingStopConfig: (trailingStopConfig) => set({ trailingStopConfig }),

  addOpenTrade: (trade) =>
    set((state) => ({ openTrades: [trade, ...state.openTrades] })),

  updateOpenTrade: (id, updates) =>
    set((state) => ({
      openTrades: state.openTrades.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  closeTrade: (id, result, profit, exitPrice, exitReason) =>
    set((state) => {
      const trade = state.openTrades.find((t) => t.id === id);
      if (!trade) return state;

      const finalized: TradeRecord = {
        ...trade,
        result,
        profit,
        exitPrice,
        exitReason: exitReason || trade.exitReason,
      };

      const updatedBalance = Number((state.balance + trade.amount + profit).toFixed(2));
      return {
        balance: updatedBalance,
        openTrades: state.openTrades.filter((t) => t.id !== id),
        closedTrades: [finalized, ...state.closedTrades],
      };
    }),

  setClosedTrades: (closedTrades) => set({ closedTrades }),
  clearHistory: () => set({ closedTrades: [] }),
}));
