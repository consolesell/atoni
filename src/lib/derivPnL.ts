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
 * Calculates continuous, realistic Deriv-grade real-time P/L for a running contract.
 * If the contract has a live stream from Deriv API (proposal_open_contract), those exact values are prioritized.
 * Otherwise, calculates a continuous Black-Scholes-anchored fair value based on current spot, entry price,
 * elapsed duration, and market volatility.
 */
export function calculateDerivRealtimePnL(
  trade: TradeRecord,
  currentPrice: number,
  volatility = 0.002
): RealtimePnLResult {
  const isCall = trade.decision.includes('BUY') || trade.decision.includes('CALL');
  const entry = trade.entryPrice || currentPrice;
  const stake = trade.amount || 1;
  const payout = trade.payout || stake * 1.95;

  // 1. If this trade has an active real-time stream from Deriv's proposal_open_contract
  if (trade.isDerivRealTime && typeof trade.profit === 'number') {
    const profit = Number(trade.profit.toFixed(2));
    const profitPercentage = typeof trade.profitPercentage === 'number'
      ? Number(trade.profitPercentage.toFixed(2))
      : (stake > 0 ? Number(((profit / stake) * 100).toFixed(2)) : 0);
    const bidPrice = typeof trade.bidPrice === 'number'
      ? Number(trade.bidPrice.toFixed(2))
      : Math.max(0, Number((stake + profit).toFixed(2)));
    const inProfit = profit > 0;
    const priceDelta = isCall ? currentPrice - entry : entry - currentPrice;
    const currentSpot = typeof trade.currentSpot === 'number' ? trade.currentSpot : currentPrice;
    const isValidToSell = trade.isValidToSell ?? true;

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

  // 2. Continuous Deriv Fair-Value Simulation for active running contracts
  // Converts duration to seconds
  let totalDurationSec = 60;
  if (trade.durationUnit === 'ticks') {
    totalDurationSec = Math.max(2, (trade.duration || 5) * 2);
  } else if (trade.durationUnit === 'seconds') {
    totalDurationSec = Math.max(5, trade.duration || 15);
  } else {
    // minutes
    totalDurationSec = Math.max(15, (trade.duration || 1) * 60);
  }

  const tradeStartMs = new Date(trade.timestamp).getTime();
  const elapsedSec = Math.max(0, (Date.now() - tradeStartMs) / 1000);
  const timeProgress = Math.min(0.999, elapsedSec / totalDurationSec);
  const timeRemainingRatio = Math.max(0.001, 1 - timeProgress);

  // Price distance in direction of contract
  const rawDiff = isCall ? currentPrice - entry : entry - currentPrice;
  const percentDiff = entry > 0 ? rawDiff / entry : 0;

  // Normalized sigma scale
  const effectiveVol = Math.max(0.0002, volatility * Math.sqrt(Math.max(1, totalDurationSec / 60)));
  const zScore = percentDiff / (effectiveVol * Math.sqrt(timeRemainingRatio) + 0.0001);

  // Logistic cumulative distribution approximation of option win probability
  const winProb = 1 / (1 + Math.exp(-Math.max(-8, Math.min(8, 1.7 * zScore))));

  // Deriv bid price has a small spread/vig margin of ~2-3%
  const vig = 0.975;
  let rawBid = payout * winProb * vig;

  // As expiry nears, binary convergence accelerates towards full payout or 0
  if (timeRemainingRatio < 0.15) {
    if (percentDiff > 0) {
      rawBid = Math.max(rawBid, payout * (1 - timeRemainingRatio * 0.5));
    } else {
      rawBid = Math.min(rawBid, payout * timeRemainingRatio * 0.4);
    }
  }

  const bidPrice = Math.max(0, Math.min(payout, Number(rawBid.toFixed(2))));
  const profit = Number((bidPrice - stake).toFixed(2));
  const profitPercentage = stake > 0 ? Number(((profit / stake) * 100).toFixed(2)) : 0;
  const inProfit = profit > 0;
  const isValidToSell = trade.isValidToSell ?? true;

  return {
    profit,
    profitPercentage,
    bidPrice,
    resaleValue: bidPrice,
    inProfit,
    isITM: inProfit,
    priceDelta: rawDiff,
    isRealDerivStream: false,
    currentSpot: currentPrice,
    isValidToSell,
  };
}

/**
 * Aggregates real-time P/L across all currently open contracts.
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
  let inProfitCount = 0;
  let outOfMoneyCount = 0;
  let hasLiveDerivStream = false;

  openTrades.forEach((trade) => {
    const pnl = calculateDerivRealtimePnL(trade, currentPrice, volatility);
    totalProfit += pnl.profit;
    totalInvested += trade.amount || 0;
    if (pnl.inProfit) inProfitCount++;
    else outOfMoneyCount++;
    if (pnl.isRealDerivStream) hasLiveDerivStream = true;
  });

  const totalCurrentValue = Math.max(0, totalInvested + totalProfit);
  const totalProfitPercentage = totalInvested > 0
    ? Number(((totalProfit / totalInvested) * 100).toFixed(2))
    : 0;

  return {
    totalProfit: Number(totalProfit.toFixed(2)),
    totalProfitPercentage,
    totalPercentage: totalProfitPercentage,
    totalInvested: Number(totalInvested.toFixed(2)),
    totalCurrentValue: Number(totalCurrentValue.toFixed(2)),
    totalResaleValue: Number(totalCurrentValue.toFixed(2)),
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
