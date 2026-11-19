import { TradeRecord } from '../types/trading';

export interface RealtimePnLResult {
  profit: number;
  profitPercentage: number;
  bidPrice: number;
  resaleValue: number;
  inProfit: boolean;
  isITM: boolean;
  priceDelta: number;
  isRealDerivStream: boolean;
  currentSpot: number;
  isValidToSell: boolean;
}

export interface AggregatePnLResult {
  totalProfit: number;
  totalProfitPercentage: number;
  totalPercentage: number;
  totalInvested: number;
  totalCurrentValue: number;
  totalResaleValue: number;
  inProfitCount: number;
  outOfMoneyCount: number;
  hasOpenPositions: boolean;
  hasLiveDerivStream: boolean;
}

/**
 * Computes real-time P/L strictly from Deriv's live proposal_open_contract stream.
 * Never fabricates synthetic Black-Scholes P/L or artificial bid prices.
 */
export function calculateDerivRealtimePnL(
  trade: TradeRecord,
  currentPrice: number,
  _volatility = 0.002
): RealtimePnLResult {
  const isCall = trade.decision.includes('BUY') || trade.decision.includes('CALL');
  const entry = trade.entryPrice || currentPrice;
  const stake = trade.amount || 0;
  const currentSpot = typeof trade.currentSpot === 'number' ? trade.currentSpot : currentPrice;
  const priceDelta = isCall ? currentSpot - entry : entry - currentSpot;

  if (trade.isDerivRealTime && typeof trade.profit === 'number') {
    const profit = Number(trade.profit.toFixed(2));
    const profitPercentage =
      typeof trade.profitPercentage === 'number'
        ? Number(trade.profitPercentage.toFixed(2))
        : stake > 0
          ? Number(((profit / stake) * 100).toFixed(2))
          : 0;
    const bidPrice =
      typeof trade.bidPrice === 'number'
        ? Number(trade.bidPrice.toFixed(2))
        : Math.max(0, Number((stake + profit).toFixed(2)));
    const inProfit = profit > 0;
    const isValidToSell = Boolean(trade.isValidToSell);

    return {
      profit,
      profitPercentage,
      bidPrice,
      resaleValue: bidPrice,
      inProfit,
      isITM: inProfit,
      priceDelta,
      isRealDerivStream: true,
      currentSpot,
      isValidToSell,
    };
  }

  // Awaiting initial proposal_open_contract tick from Deriv
  return {
    profit: 0,
    profitPercentage: 0,
    bidPrice: 0,
    resaleValue: 0,
    inProfit: false,
    isITM: priceDelta > 0,
    priceDelta,
    isRealDerivStream: false,
    currentSpot,
    isValidToSell: false,
  };
}

/**
 * Aggregates real-time P/L across all currently open Deriv contracts.
 */
export function aggregateOpenTradesPnL(
  openTrades: TradeRecord[],
  currentPrice: number,
  volatility = 0.002
): AggregatePnLResult {
  if (!openTrades || openTrades.length === 0) {
    return {
      totalProfit: 0,
      totalProfitPercentage: 0,
      totalPercentage: 0,
      totalInvested: 0,
      totalCurrentValue: 0,
      totalResaleValue: 0,
      inProfitCount: 0,
      outOfMoneyCount: 0,
      hasOpenPositions: false,
      hasLiveDerivStream: false,
    };
  }

  let totalProfit = 0;
  let totalInvested = 0;
  let totalResaleValue = 0;
  let inProfitCount = 0;
  let outOfMoneyCount = 0;
  let hasLiveDerivStream = false;

  openTrades.forEach((trade) => {
    const pnl = calculateDerivRealtimePnL(trade, currentPrice, volatility);
    totalProfit += pnl.profit;
    totalInvested += trade.amount || 0;
    totalResaleValue += pnl.isRealDerivStream ? pnl.bidPrice : trade.amount || 0;
    if (pnl.inProfit) inProfitCount++;
    else if (pnl.isRealDerivStream && pnl.profit < 0) outOfMoneyCount++;
    if (pnl.isRealDerivStream) hasLiveDerivStream = true;
  });

  const totalCurrentValue = Math.max(0, totalResaleValue);
  const totalProfitPercentage =
    totalInvested > 0 ? Number(((totalProfit / totalInvested) * 100).toFixed(2)) : 0;

  return {
    totalProfit: Number(totalProfit.toFixed(2)),
    totalProfitPercentage,
    totalPercentage: totalProfitPercentage,
    totalInvested: Number(totalInvested.toFixed(2)),
    totalCurrentValue: Number(totalCurrentValue.toFixed(2)),
    totalResaleValue: Number(totalResaleValue.toFixed(2)),
    inProfitCount,
    outOfMoneyCount,
    hasOpenPositions: true,
    hasLiveDerivStream,
  };
}

/**
 * Formats profit / loss into standard currency representation (e.g. "+$4.50" or "-$2.30")
 */
export function formatPnL(profit: number, currency = 'USD'): string {
  const symbol = currency === 'USD' ? '$' : `${currency} `;
  if (profit > 0) {
    return `+${symbol}${profit.toFixed(2)}`;
  } else if (profit < 0) {
    return `-${symbol}${Math.abs(profit).toFixed(2)}`;
  }
  return `${symbol}0.00`;
}

/**
 * Formats percentage with sign (e.g. "+35.4%" or "-20.0%")
 */
export function formatPnLPercentage(pct: number): string {
  if (pct > 0) {
    return `+${pct.toFixed(1)}%`;
  }
  return `${pct.toFixed(1)}%`;
}
