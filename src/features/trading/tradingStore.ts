import { create } from 'zustand';
import { TradeRecord, TrailingStopConfig, Candle, Tick } from '../../types/trading';
import { TradeDurationUnit, SniperConfluenceResult } from '../../types/sniper';

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

  // Market Feed State
  currentPrice: number;
  prevPrice: number;
  candles: Candle[];
  tickBuffer: Tick[];
  sniperSetup: SniperConfluenceResult | null;

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

  setCurrentPrice: (price: number) => void;
  setPrevPrice: (price: number) => void;
  setCandles: (candles: Candle[] | ((prev: Candle[]) => Candle[])) => void;
  setTickBuffer: (ticks: Tick[] | ((prev: Tick[]) => Tick[])) => void;
  setSniperSetup: (setup: SniperConfluenceResult | null) => void;

  // Trade management
  setOpenTrades: (trades: TradeRecord[] | ((prev: TradeRecord[]) => TradeRecord[])) => void;
  addOpenTrade: (trade: TradeRecord) => void;
  updateOpenTrade: (id: string, updates: Partial<TradeRecord>) => void;
  updateOpenTradesPnL: (updateFn: (trade: TradeRecord) => Partial<TradeRecord>) => void;
  closeTrade: (
    id: string,
    result: 'WIN' | 'LOSS' | 'SOLD',
    profit: number,
    exitPrice: number,
    exitReason?: string
  ) => void;
  setClosedTrades: (trades: TradeRecord[] | ((prev: TradeRecord[]) => TradeRecord[])) => void;
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

  currentPrice: 1000,
  prevPrice: 1000,
  candles: [],
  tickBuffer: [],
  sniperSetup: null,

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

  setCurrentPrice: (currentPrice) => set({ currentPrice }),
  setPrevPrice: (prevPrice) => set({ prevPrice }),
  setCandles: (candlesOrUpdater) =>
    set((state) => ({
      candles:
        typeof candlesOrUpdater === 'function'
          ? candlesOrUpdater(state.candles)
          : candlesOrUpdater,
    })),
  setTickBuffer: (ticksOrUpdater) =>
    set((state) => ({
      tickBuffer:
        typeof ticksOrUpdater === 'function'
          ? ticksOrUpdater(state.tickBuffer)
          : ticksOrUpdater,
    })),
  setSniperSetup: (sniperSetup) => set({ sniperSetup }),

  setOpenTrades: (tradesOrUpdater) =>
    set((state) => ({
      openTrades:
        typeof tradesOrUpdater === 'function'
          ? tradesOrUpdater(state.openTrades)
          : tradesOrUpdater,
    })),

  addOpenTrade: (trade) =>
    set((state) => ({ openTrades: [trade, ...state.openTrades] })),

  updateOpenTrade: (id, updates) =>
    set((state) => ({
      openTrades: state.openTrades.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  updateOpenTradesPnL: (updateFn) =>
    set((state) => {
      if (state.openTrades.length === 0) return state;
      let changed = false;
      const updated = state.openTrades.map((t) => {
        const changes = updateFn(t);
        const hasChange = Object.keys(changes).some(
          (k) => (changes as any)[k] !== (t as any)[k]
        );
        if (hasChange) {
          changed = true;
          return { ...t, ...changes };
        }
        return t;
      });
      return changed ? { openTrades: updated } : state;
    }),

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

  setClosedTrades: (tradesOrUpdater) =>
    set((state) => ({
      closedTrades:
        typeof tradesOrUpdater === 'function'
          ? tradesOrUpdater(state.closedTrades)
          : tradesOrUpdater,
    })),

  clearHistory: () => set({ closedTrades: [] }),
}));
