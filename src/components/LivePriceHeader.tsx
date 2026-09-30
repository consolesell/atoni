import React, { useEffect, useState } from 'react';
import { DERIV_SYMBOLS } from '../lib/derivSymbols';
import { MarketRegime } from '../types/trading';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Compass,
  Zap,
  ChevronDown,
  BarChart3,
} from 'lucide-react';

interface LivePriceHeaderProps {
  selectedSymbol: string;
  onSymbolChange: (sym: string) => void;
  currentPrice: number;
  prevPrice: number;
  regime: MarketRegime;
  volatility: number;
  decimals?: number;
  onOpenMarketMatrix?: () => void;
}

export const LivePriceHeader: React.FC<LivePriceHeaderProps> = ({
  selectedSymbol,
  onSymbolChange,
  currentPrice,
  prevPrice,
  regime,
  volatility,
  decimals = 3,
  onOpenMarketMatrix,
}) => {
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (currentPrice > prevPrice) {
      setPriceFlash('up');
    } else if (currentPrice < prevPrice) {
      setPriceFlash('down');
    }
    const timer = setTimeout(() => setPriceFlash(null), 500);
    return () => clearTimeout(timer);
  }, [currentPrice, prevPrice]);

  const activeSymbolObj =
    DERIV_SYMBOLS.find((s) => s.symbol === selectedSymbol) || DERIV_SYMBOLS[0];

  const priceDiff = currentPrice - prevPrice;
  const isUp = priceDiff >= 0;

  // Regime badge styling
  const getRegimeBadge = () => {
    switch (regime?.type) {
      case 'STRONG_UPTREND':
        return {
          label: 'STRONG UPTREND',
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
          icon: <TrendingUp className="w-3 h-3 text-emerald-400" />,
        };
      case 'UPTREND':
        return {
          label: 'UPTREND',
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
          icon: <TrendingUp className="w-3 h-3 text-emerald-400" />,
        };
      case 'STRONG_DOWNTREND':
        return {
          label: 'STRONG DOWNTREND',
          bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
          icon: <TrendingDown className="w-3 h-3 text-rose-400" />,
        };
      case 'DOWNTREND':
        return {
          label: 'DOWNTREND',
          bg: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
          icon: <TrendingDown className="w-3 h-3 text-rose-400" />,
        };
      case 'HIGH_VOLATILITY':
        return {
          label: 'HIGH VOLATILITY',
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
          icon: <Zap className="w-3 h-3 text-amber-400" />,
        };
      case 'CONSOLIDATION':
        return {
          label: 'CONSOLIDATION',
          bg: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
          icon: <Activity className="w-3 h-3 text-indigo-400" />,
        };
      default:
        return {
          label: 'EQUILIBRIUM',
          bg: 'bg-slate-800/80 border-slate-700 text-slate-300',
          icon: <Compass className="w-3 h-3 text-slate-400" />,
        };
    }
  };

  const badge = getRegimeBadge();

  return (
    <div className="w-full flex items-center justify-between gap-3 p-3 sm:p-4 bg-slate-900/80 border border-slate-800 rounded-2xl shadow-lg backdrop-blur-md">
      {/* Left: Symbol Selector Dropdown */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="relative">
          <select
            value={selectedSymbol}
            onChange={(e) => onSymbolChange(e.target.value)}
            aria-label="Select Trading Asset Symbol"
            className="appearance-none bg-slate-950 border border-slate-700 hover:border-cyan-500/60 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-white font-bold text-xs sm:text-sm rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 pr-8 sm:pr-9 outline-none cursor-pointer transition-all shadow-inner"
          >
            {DERIV_SYMBOLS.map((sym) => (
              <option key={sym.symbol} value={sym.symbol} className="bg-slate-950 text-slate-200">
                {sym.displayName} ({sym.symbol})
              </option>
            ))}
          </select>
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <ChevronDown className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="hidden sm:block">
          <div className="text-xs font-semibold text-slate-200 truncate">{activeSymbolObj.displayName}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
            {activeSymbolObj.submarket.replace('_', ' ')}
          </div>
        </div>

        {onOpenMarketMatrix && (
          <button
            onClick={onOpenMarketMatrix}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-800/60 hover:border-cyan-500/60 transition-all shadow-sm"
            title="Open Individual Win/Loss Market Performance Matrix"
            aria-label="Market Win/Loss Matrix"
          >
            <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Win/Loss Matrix</span>
          </button>
        )}
      </div>

      {/* Right: Spot Price Live Ticker Display & Regime */}
      <div className="flex items-center gap-3 sm:gap-6 shrink-0">
        <div className="text-right">
          <div className="text-[9px] sm:text-[10px] uppercase font-mono tracking-wider text-slate-400 flex items-center justify-end gap-1">
            <span>SPOT</span>
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                priceFlash === 'up'
                  ? 'bg-emerald-400 animate-ping'
                  : priceFlash === 'down'
                  ? 'bg-rose-400 animate-ping'
                  : 'bg-cyan-400'
              }`}
            />
          </div>
          <div
            className={`font-mono text-lg sm:text-2xl font-black tracking-tight transition-all duration-200 ${
              priceFlash === 'up'
                ? 'text-emerald-400'
                : priceFlash === 'down'
                ? 'text-rose-400'
                : 'text-slate-100'
            }`}
          >
            {currentPrice ? currentPrice.toFixed(decimals) : '--'}
          </div>
        </div>

        {/* Market Regime Badge */}
        <div className="hidden md:flex flex-col items-start gap-1">
          <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
            Regime
          </div>
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${badge.bg}`}
          >
            {badge.icon}
            {badge.label}
          </div>
        </div>

        {/* Volatility Meter */}
        <div className="hidden lg:flex flex-col items-start gap-1">
          <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
            Volatility
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-slate-200">
              {(volatility * 100).toFixed(3)}%
            </span>
            <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 rounded-full"
                style={{ width: `${Math.min(100, Math.max(10, volatility * 8000))}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
