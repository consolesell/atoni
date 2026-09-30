import { Candle, TechnicalIndicators, TradeRecord, TrailingStopConfig } from '../types/trading';

export const DEFAULT_TRAILING_STOP_CONFIG: TrailingStopConfig = {
  enabled: false,
  distanceType: 'ATR',
  distanceValue: 1.5,
  profitLockEnabled: true,
  profitLockThresholdPercent: 50, // 50% target threshold
  profitLockSecuredPercent: 50,   // Secures 50% directly into main balance
};

export interface TrailingStopPreset {
  id: string;
  label: string;
  description: string;
  config: TrailingStopConfig;
}

export const TRAILING_STOP_PRESETS: TrailingStopPreset[] = [
  {
    id: 'tight',
    label: 'Tight Scalp (0.8 ATR)',
    description: 'Fast trailing ratchet for high-frequency or tick momentum with 50% profit lock',
    config: {
      enabled: true,
      distanceType: 'ATR',
      distanceValue: 0.8,
      profitLockEnabled: true,
      profitLockThresholdPercent: 50,
      profitLockSecuredPercent: 50,
    },
  },
  {
    id: 'balanced',
    label: 'Balanced (1.5 ATR)',
    description: 'Optimal profit capture balance with automated 50% profit lock into balance',
    config: {
      enabled: true,
      distanceType: 'ATR',
      distanceValue: 1.5,
      profitLockEnabled: true,
      profitLockThresholdPercent: 50,
      profitLockSecuredPercent: 50,
    },
  },
  {
    id: 'wide',
    label: 'Wide Swing (2.2 ATR)',
    description: 'Accommodates deeper retracements in trending markets with 75% profit lock',
    config: {
      enabled: true,
      distanceType: 'ATR',
      distanceValue: 2.2,
      profitLockEnabled: true,
      profitLockThresholdPercent: 75,
      profitLockSecuredPercent: 50,
    },
  },
  {
    id: 'percent_05',
    label: 'Fixed 0.5% Move',
    description: 'Trails price at a fixed 0.5% distance with automated profit lock',
    config: {
      enabled: true,
      distanceType: 'PERCENT',
      distanceValue: 0.5,
      profitLockEnabled: true,
      profitLockThresholdPercent: 50,
      profitLockSecuredPercent: 50,
    },
  },
];

/**
 * Compute the numerical trailing stop distance in price units.
 */
export function calculateTrailingDistance(
  entryPrice: number,
  candles: Candle[],
  indicators?: TechnicalIndicators | null,
  config: TrailingStopConfig = DEFAULT_TRAILING_STOP_CONFIG
): number {
  if (config.distanceType === 'PERCENT') {
    return Math.max(0.0001, entryPrice * (config.distanceValue / 100));
  }

  if (config.distanceType === 'POINTS') {
    return Math.max(0.0001, config.distanceValue);
  }

  // Distance type: ATR
  let atr = 0;
  if (indicators?.atr && indicators.atr.length > 0) {
    const validAtr = indicators.atr.filter((v) => !isNaN(v) && v > 0);
    if (validAtr.length > 0) {
      atr = validAtr[validAtr.length - 1];
    }
  }

  // Fallback ATR calculation if not in indicators
  if (!atr || atr <= 0) {
    if (candles && candles.length >= 5) {
      const slice = candles.slice(-14);
      let sumTr = 0;
      for (let i = 1; i < slice.length; i++) {
        const high = slice[i].high;
        const low = slice[i].low;
        const prevClose = slice[i - 1].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        sumTr += tr;
      }
      atr = sumTr / (slice.length - 1);
    }
  }

  // Safe fallback if ATR calculation fails
  if (!atr || isNaN(atr) || atr <= 0) {
    atr = entryPrice * 0.0035; // 0.35% default volatility proxy
  }

  const distance = atr * config.distanceValue;
  return Math.max(0.0001, distance);
}

/**
 * Initialize trailing stop fields on trade creation.
 */
export function initializeTrailingStopParams(
  entryPrice: number,
  direction: 'CALL' | 'PUT',
  trailingDistance: number,
  decimals: number = 3,
  config?: TrailingStopConfig
) {
  const isCall = direction === 'CALL';
  const initialStopPrice = isCall
    ? Number((entryPrice - trailingDistance).toFixed(decimals))
    : Number((entryPrice + trailingDistance).toFixed(decimals));

  return {
    trailingDistance,
    initialStopPrice,
    currentTrailingStopPrice: initialStopPrice,
    highestFavorablePrice: entryPrice,
    lowestFavorablePrice: entryPrice,
    lockedInProfit: 0,
    peakProfit: 0,
    profitLockEnabled: config?.profitLockEnabled ?? true,
    profitLockThresholdPercent: config?.profitLockThresholdPercent ?? 50,
    profitLockTriggered: false,
    profitLockSecuredAmount: 0,
  };
}

/**
 * Evaluates an active trade against the latest market price, ratcheting the trailing stop
 * as price moves favorably, locking in gains, securing automated profit lock directly into balance,
 * and detecting trailing stop breaches.
 */
export function evaluateTrailingStop(
  trade: TradeRecord,
  currentPrice: number,
  decimals: number = 3
): {
  updatedTrade: TradeRecord;
  isTriggered: boolean;
  triggerReason?: string;
  settlementProfit: number;
  profitLockTriggeredNow?: boolean;
  profitLockSecuredAmount?: number;
} {
  if (!trade.trailingStopEnabled || !trade.currentTrailingStopPrice || !trade.trailingStopDistance) {
    return {
      updatedTrade: trade,
      isTriggered: false,
      settlementProfit: 0,
    };
  }

  const isCall = trade.decision.includes('BUY') || trade.decision.includes('CALL');
  let currentTrailingStopPrice = trade.currentTrailingStopPrice;
  let highestFavorablePrice = trade.highestFavorablePrice ?? trade.entryPrice;
  let lowestFavorablePrice = trade.lowestFavorablePrice ?? trade.entryPrice;
  let lockedInProfit = trade.lockedInProfit ?? 0;
  let peakProfit = trade.peakProfit ?? 0;
  let profitLockTriggered = trade.profitLockTriggered ?? false;
  let profitLockSecuredAmount = trade.profitLockSecuredAmount ?? 0;
  let profitLockTriggeredNow = false;
  let newSecuredPortion = 0;

  const trailingDistance = trade.trailingStopDistance;
  let isTriggered = false;
  let triggerReason: string | undefined;

  // Calculate current open theoretical profit
  const standardMaxProfit = trade.amount * 0.95;
  let currentOpenProfit = 0;
  if (isCall) {
    if (currentPrice > trade.entryPrice) {
      const priceGainFraction = (currentPrice - trade.entryPrice) / (trade.entryPrice || 1);
      // Scale move with volatility leverage proxy
      currentOpenProfit = Math.min(standardMaxProfit, Math.max(0, priceGainFraction * trade.amount * 4));
    }
  } else {
    if (currentPrice < trade.entryPrice) {
      const priceGainFraction = (trade.entryPrice - currentPrice) / (trade.entryPrice || 1);
      currentOpenProfit = Math.min(standardMaxProfit, Math.max(0, priceGainFraction * trade.amount * 4));
    }
  }

  // Profit Lock Automation Check:
  // Allows setting a target profit threshold percentage (e.g. 50%).
  // Once reached, that exact portion of open profit is automatically secured directly into the main balance,
  // locking in gains while the remaining position continues to run behind the trailing stop.
  const profitLockEnabled = trade.profitLockEnabled ?? true;
  const thresholdPct = trade.profitLockThresholdPercent ?? 50;
  const targetProfitTriggerThreshold = standardMaxProfit * (thresholdPct / 100);

  if (profitLockEnabled && !profitLockTriggered && currentOpenProfit >= targetProfitTriggerThreshold && currentOpenProfit > 0.20) {
    profitLockTriggered = true;
    profitLockTriggeredNow = true;
    // Secure exact portion (e.g. 50% or threshold portion) of open profit directly into main balance
    newSecuredPortion = Number((currentOpenProfit * 0.5).toFixed(2));
    profitLockSecuredAmount = newSecuredPortion;
    lockedInProfit = Math.max(lockedInProfit, newSecuredPortion);
  }

  if (isCall) {
    // 1. Ratchet Up for CALL
    if (currentPrice > highestFavorablePrice) {
      highestFavorablePrice = currentPrice;
      const potentialNewStop = Number((currentPrice - trailingDistance).toFixed(decimals));
      // Only ratchet UP, never down
      if (potentialNewStop > currentTrailingStopPrice) {
        currentTrailingStopPrice = potentialNewStop;
      }

      // Track peak profit reached
      const currentGain = ((currentPrice - trade.entryPrice) / trade.entryPrice) * trade.amount;
      if (currentGain > peakProfit) {
        peakProfit = Number(currentGain.toFixed(2));
      }

      // If stop is above entry, we have locked-in guaranteed profit!
      if (currentTrailingStopPrice > trade.entryPrice) {
        const lockedGain = Math.min(
          trade.amount * 0.95,
          ((currentTrailingStopPrice - trade.entryPrice) / (trade.entryPrice || 1)) * trade.amount * 2.5
        );
        lockedInProfit = Math.max(lockedInProfit, Number(lockedGain.toFixed(2)));
      }
    }

    // 2. Check if trailing stop breached
    if (currentPrice <= currentTrailingStopPrice) {
      isTriggered = true;
      triggerReason =
        currentTrailingStopPrice > trade.entryPrice
          ? `Trailing Stop Locked Profit Hit at ${currentPrice.toFixed(decimals)} (Stop: ${currentTrailingStopPrice.toFixed(decimals)})`
          : `Trailing Stop Loss Triggered at ${currentPrice.toFixed(decimals)}`;
    }
  } else {
    // 1. Ratchet Down for PUT
    if (currentPrice < lowestFavorablePrice) {
      lowestFavorablePrice = currentPrice;
      const potentialNewStop = Number((currentPrice + trailingDistance).toFixed(decimals));
      // Only ratchet DOWN, never up for a PUT
      if (potentialNewStop < currentTrailingStopPrice) {
        currentTrailingStopPrice = potentialNewStop;
      }

      // Track peak profit reached
      const currentGain = ((trade.entryPrice - currentPrice) / trade.entryPrice) * trade.amount;
      if (currentGain > peakProfit) {
        peakProfit = Number(currentGain.toFixed(2));
      }

      // If stop is below entry, we have locked-in guaranteed profit!
      if (currentTrailingStopPrice < trade.entryPrice) {
        const lockedGain = Math.min(
          trade.amount * 0.95,
          ((trade.entryPrice - currentTrailingStopPrice) / (trade.entryPrice || 1)) * trade.amount * 2.5
        );
        lockedInProfit = Math.max(lockedInProfit, Number(lockedGain.toFixed(2)));
      }
    }

    // 2. Check if trailing stop breached
    if (currentPrice >= currentTrailingStopPrice) {
      isTriggered = true;
      triggerReason =
        currentTrailingStopPrice < trade.entryPrice
          ? `Trailing Stop Locked Profit Hit at ${currentPrice.toFixed(decimals)} (Stop: ${currentTrailingStopPrice.toFixed(decimals)})`
          : `Trailing Stop Loss Triggered at ${currentPrice.toFixed(decimals)}`;
    }
  }

  // Calculate settlement profit if triggered
  let settlementProfit = 0;
  if (isTriggered) {
    const won = isCall ? currentPrice > trade.entryPrice : currentPrice < trade.entryPrice;
    if (won) {
      // In profit: award locked profit, minimum 25% of stake, capped at standard 95% payout
      const profitRate = Math.min(0.95, Math.max(0.25, (lockedInProfit > 0 ? lockedInProfit / trade.amount : 0.45)));
      // Deduct portion already secured into balance if any to prevent double-crediting
      const rawProfit = Number((trade.amount * profitRate).toFixed(2));
      settlementProfit = Number(Math.max(0.05, rawProfit - profitLockSecuredAmount).toFixed(2));
    } else {
      // Capital preservation: loss is minimized because the trailing stop invalidation cut the loss early!
      const lossReduction = Math.min(0.7, Math.max(0.35, Math.abs(currentPrice - trade.entryPrice) / (trailingDistance || 1)));
      settlementProfit = Number((-trade.amount * lossReduction).toFixed(2));
    }
  }

  const updatedTrade: TradeRecord = {
    ...trade,
    highestFavorablePrice,
    lowestFavorablePrice,
    currentTrailingStopPrice,
    lockedInProfit,
    peakProfit,
    profitLockEnabled,
    profitLockThresholdPercent: thresholdPct,
    profitLockTriggered,
    profitLockSecuredAmount,
    profitLockTriggerTime: profitLockTriggeredNow ? new Date().toISOString() : trade.profitLockTriggerTime,
  };

  return {
    updatedTrade,
    isTriggered,
    triggerReason,
    settlementProfit,
    profitLockTriggeredNow,
    profitLockSecuredAmount: newSecuredPortion,
  };
}
