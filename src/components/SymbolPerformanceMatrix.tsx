import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Award,
  ArrowRightLeft,
  Filter,
  CheckCircle2,
  XCircle,
  BarChart3,
  Percent,
  Flame,
  Zap,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Table as TableIcon,
  LayoutGrid,
  Info,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { TradeRecord, MarketRegime } from '../types/trading';
import { DERIV_SYMBOLS } from '../lib/derivSymbols';
import { sound } from '../lib/soundEngine';
import { useTheme } from '../context/ThemeContext';

export interface SymbolMetric {
  symbol: string;
  displayName: string;
  submarket: string;
  decimals: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netProfit: number;
  grossWins: number;
  grossLosses: number;
  profitFactor: number;
  recentTrades: ('WIN' | 'LOSS')[];
  currentWinStreak: number;
  avgProfitPerTrade: number;
  edgeScore: number;
  recommendation: 'TOP EDGE' | 'STRONG RUN' | 'CHOPPY' | 'UNDERPERFORMING' | 'UNTRADED';
  isCurrent: boolean;
}

interface SymbolPerformanceMatrixProps {
  allowedSymbols?: string[];
  closedTrades: TradeRecord[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  currency?: string;
  regime?: MarketRegime;
  onOpenAutoRotationConfig?: () => void;
}

export const SymbolPerformanceMatrix: React.FC<SymbolPerformanceMatrixProps> = ({
  allowedSymbols,
  closedTrades,
  selectedSymbol,
  onSelectSymbol,
  currency = 'USD',
  regime,
  onOpenAutoRotationConfig,
}) => {
  const { theme, accentColor } = useTheme();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'traded' | 'profitable' | 'high_winrate'>('all');
  const [sortBy, setSortBy] = useState<'winrate' | 'profit' | 'trades' | 'edge' | 'name'>('winrate');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [rotationNotice, setRotationNotice] = useState<string | null>(null);

  // Fallback candidate universe if allowedSymbols is undefined or empty
  const universe = useMemo(() => {
    if (allowedSymbols && allowedSymbols.length > 0) {
      return allowedSymbols;
    }
    return [
      '1HZ10V',
      '1HZ25V',
      '1HZ50V',
      '1HZ75V',
      '1HZ100V',
      'R_10',
      'R_25',
      'R_50',
      'R_75',
      'R_100',
      'stpRNG',
      'BOOM500',
      'CRASH500',
    ];
  }, [allowedSymbols]);

  // Aggregate metrics per symbol
  const symbolMetrics: SymbolMetric[] = useMemo(() => {
    return universe.map((symId) => {
      const symDef = DERIV_SYMBOLS.find((s) => s.symbol === symId) || {
        symbol: symId,
        displayName: symId,
        submarket: 'synthetic_index',
        decimals: 2,
      };

      // Filter trades for this symbol
      const symTrades = closedTrades.filter((t) => t.symbol === symId);
      const totalTrades = symTrades.length;
      const wins = symTrades.filter((t) => t.result === 'WIN').length;
      const losses = symTrades.filter((t) => t.result === 'LOSS').length;
      const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

      let netProfit = 0;
      let grossWins = 0;
      let grossLosses = 0;

      symTrades.forEach((t) => {
        netProfit += t.profit || 0;
        if (t.profit > 0) grossWins += t.profit;
        else if (t.profit < 0) grossLosses += Math.abs(t.profit);
      });

      const profitFactor =
        grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 9.99 : 0;

      // Recent 5 trade results (from newest to oldest)
      const recentTrades: ('WIN' | 'LOSS')[] = symTrades
        .slice(0, 6)
        .map((t) => (t.result === 'WIN' ? 'WIN' : 'LOSS'));

      // Calculate current streak
      let currentWinStreak = 0;
      for (const t of symTrades) {
        if (t.result === 'WIN') currentWinStreak++;
        else break;
      }

      // Dynamic Edge Score calculation (0 to 100)
      let edgeScore = 50;
      if (totalTrades > 0) {
        edgeScore = Math.min(
          99,
          Math.max(
            15,
            winRate * 0.7 +
              Math.min(totalTrades, 10) * 1.5 +
              (netProfit > 0 ? Math.min(netProfit * 2, 15) : -15)
          )
        );
      }

      // Recommendation tag
      let recommendation: SymbolMetric['recommendation'] = 'UNTRADED';
      if (totalTrades >= 3) {
        if (winRate >= 65 && netProfit > 0) recommendation = 'TOP EDGE';
        else if (winRate >= 50 && netProfit >= 0) recommendation = 'STRONG RUN';
        else if (winRate < 40) recommendation = 'UNDERPERFORMING';
        else recommendation = 'CHOPPY';
      } else if (totalTrades > 0) {
        recommendation = winRate >= 50 ? 'STRONG RUN' : 'CHOPPY';
      }

      return {
        symbol: symId,
        displayName: symDef.displayName,
        submarket: symDef.submarket,
        decimals: symDef.decimals || 2,
        totalTrades,
        wins,
        losses,
        winRate,
        netProfit,
        grossWins,
        grossLosses,
        profitFactor,
        recentTrades,
        currentWinStreak,
        avgProfitPerTrade: totalTrades > 0 ? netProfit / totalTrades : 0,
        edgeScore: Math.round(edgeScore),
        recommendation,
        isCurrent: symId === selectedSymbol,
      };
    });
  }, [universe, closedTrades, selectedSymbol]);

  // Overall Market Summary stats
  const summaryStats = useMemo(() => {
    const tradedSymbols = symbolMetrics.filter((m) => m.totalTrades > 0);
    const totalTradedCount = tradedSymbols.length;

    // Top performer by win rate (min 2 trades)
    const sortedByWinRate = [...tradedSymbols].sort(
      (a, b) => b.winRate - a.winRate || b.totalTrades - a.totalTrades
    );
    const topWinRateSymbol = sortedByWinRate[0] || null;

    // Top profit contributor
    const sortedByProfit = [...tradedSymbols].sort((a, b) => b.netProfit - a.netProfit);
    const topProfitSymbol = sortedByProfit[0] || null;

    // Best recommended candidate to rotate to (highest edge score among non-current symbols)
    const candidates = [...symbolMetrics]
      .filter((m) => !m.isCurrent)
      .sort((a, b) => b.edgeScore - a.edgeScore || b.winRate - a.winRate);
    const recommendedRotation = candidates[0] || null;

    const currentMetric = symbolMetrics.find((m) => m.isCurrent) || null;

    return {
      totalTradedCount,
      topWinRateSymbol,
      topProfitSymbol,
      recommendedRotation,
      currentMetric,
    };
  }, [symbolMetrics]);

  // Filter and sort the symbols
  const filteredMetrics = useMemo(() => {
    let list = [...symbolMetrics];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m) =>
          m.symbol.toLowerCase().includes(q) ||
          m.displayName.toLowerCase().includes(q) ||
          m.submarket.toLowerCase().includes(q)
      );
    }

    // Filter mode
    if (filterMode === 'traded') {
      list = list.filter((m) => m.totalTrades > 0);
    } else if (filterMode === 'profitable') {
      list = list.filter((m) => m.netProfit > 0);
    } else if (filterMode === 'high_winrate') {
      list = list.filter((m) => m.winRate >= 60 && m.totalTrades > 0);
    }

    // Sorting
    list.sort((a, b) => {
      // Always pin current active symbol at the top if searching/browsing
      if (a.isCurrent && !b.isCurrent) return -1;
      if (!a.isCurrent && b.isCurrent) return 1;

      switch (sortBy) {
        case 'winrate':
          return b.winRate - a.winRate || b.totalTrades - a.totalTrades;
        case 'profit':
          return b.netProfit - a.netProfit;
        case 'trades':
          return b.totalTrades - a.totalTrades;
        case 'edge':
          return b.edgeScore - a.edgeScore;
        case 'name':
          return a.symbol.localeCompare(b.symbol);
        default:
          return 0;
      }
    });

    return list;
  }, [symbolMetrics, searchQuery, filterMode, sortBy]);

  // Handle manual rotation click
  const handleRotate = (sym: string) => {
    if (sym === selectedSymbol) return;
    onSelectSymbol(sym);
    sound.play('click');
    setRotationNotice(`Rotated active market to ${sym}`);
    setTimeout(() => setRotationNotice(null), 3000);
  };

  return (
    <div
      className="p-4 sm:p-5 rounded-2xl border transition-all space-y-5 font-sans"
      style={{
        backgroundColor: theme.bgCard,
        borderColor: theme.borderColor,
      }}
    >
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: theme.borderColor }}>
        <div>
          <div className="flex items-center gap-2">
            <div
              className="p-1.5 rounded-lg flex items-center justify-center shadow-sm"
              style={{
                backgroundColor: `${accentColor}20`,
                color: accentColor,
              }}
            >
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight" style={{ color: theme.textPrimary }}>
                Market Win/Loss Matrix
              </h2>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                Individual asset telemetry & manual rotation decision engine
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenAutoRotationConfig && (
            <button
              onClick={onOpenAutoRotationConfig}
              className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-colors flex items-center gap-1.5"
              style={{
                borderColor: theme.borderColor,
                backgroundColor: `${accentColor}15`,
                color: accentColor,
              }}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>SBAgent Rotation Rules</span>
            </button>
          )}

          {/* View mode toggle */}
          <div
            className="flex items-center p-1 rounded-xl border"
            style={{
              borderColor: theme.borderColor,
              backgroundColor: theme.bgApp,
            }}
          >
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'grid' ? 'shadow-sm' : 'opacity-60 hover:opacity-100'
              }`}
              style={{
                backgroundColor: viewMode === 'grid' ? `${accentColor}25` : 'transparent',
                color: viewMode === 'grid' ? accentColor : theme.textSecondary,
              }}
              title="Grid Cards"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'table' ? 'shadow-sm' : 'opacity-60 hover:opacity-100'
              }`}
              style={{
                backgroundColor: viewMode === 'table' ? `${accentColor}25` : 'transparent',
                color: viewMode === 'table' ? accentColor : theme.textSecondary,
              }}
              title="Dense Table"
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Rotation Notification Toast */}
      {rotationNotice && (
        <div
          className="px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center justify-between border animate-slide-up shadow-lg"
          style={{
            backgroundColor: `${accentColor}20`,
            borderColor: accentColor,
            color: accentColor,
          }}
        >
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 animate-spin" />
            <span>{rotationNotice}</span>
          </div>
          <button onClick={() => setRotationNotice(null)} className="text-[11px] opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Strategic Intelligence Cards (Executive Bar) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {/* Active Market */}
        <div
          className="p-3 rounded-xl border relative overflow-hidden"
          style={{
            backgroundColor: theme.bgApp,
            borderColor: accentColor,
          }}
        >
          <div className="flex items-center justify-between text-[10px] font-mono mb-1" style={{ color: theme.textSecondary }}>
            <span>ACTIVE SELECTION</span>
            <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: accentColor }} />
          </div>
          <div className="font-mono font-black text-sm sm:text-base truncate" style={{ color: theme.textPrimary }}>
            {selectedSymbol}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t text-[11px] font-mono" style={{ borderColor: theme.borderColor }}>
            <span style={{ color: theme.textMuted }}>Current Win Rate</span>
            <span className="font-bold" style={{ color: accentColor }}>
              {summaryStats.currentMetric ? `${summaryStats.currentMetric.winRate.toFixed(1)}%` : '0.0%'}
            </span>
          </div>
        </div>

        {/* Best Win Rate Asset */}
        <div
          className="p-3 rounded-xl border"
          style={{
            backgroundColor: theme.bgApp,
            borderColor: theme.borderColor,
          }}
        >
          <div className="flex items-center justify-between text-[10px] font-mono mb-1 text-emerald-400">
            <span>BEST WIN RATE</span>
            <Award className="w-3.5 h-3.5" />
          </div>
          <div className="font-mono font-black text-sm sm:text-base truncate" style={{ color: theme.textPrimary }}>
            {summaryStats.topWinRateSymbol ? summaryStats.topWinRateSymbol.symbol : 'None yet'}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t text-[11px] font-mono" style={{ borderColor: theme.borderColor }}>
            <span style={{ color: theme.textMuted }}>Win Rate</span>
            <span className="font-bold text-emerald-400">
              {summaryStats.topWinRateSymbol ? `${summaryStats.topWinRateSymbol.winRate.toFixed(1)}%` : '--'}
            </span>
          </div>
        </div>

        {/* Top Profit Contributor */}
        <div
          className="p-3 rounded-xl border"
          style={{
            backgroundColor: theme.bgApp,
            borderColor: theme.borderColor,
          }}
        >
          <div className="flex items-center justify-between text-[10px] font-mono mb-1 text-cyan-400">
            <span>TOP P&L DRIVER</span>
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
          <div className="font-mono font-black text-sm sm:text-base truncate" style={{ color: theme.textPrimary }}>
            {summaryStats.topProfitSymbol && summaryStats.topProfitSymbol.netProfit > 0
              ? summaryStats.topProfitSymbol.symbol
              : 'None'}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t text-[11px] font-mono" style={{ borderColor: theme.borderColor }}>
            <span style={{ color: theme.textMuted }}>Net P&L</span>
            <span
              className={`font-bold ${
                summaryStats.topProfitSymbol && summaryStats.topProfitSymbol.netProfit > 0
                  ? 'text-emerald-400'
                  : 'text-slate-400'
              }`}
            >
              {summaryStats.topProfitSymbol
                ? `${summaryStats.topProfitSymbol.netProfit >= 0 ? '+' : ''}$${summaryStats.topProfitSymbol.netProfit.toFixed(2)}`
                : '$0.00'}
            </span>
          </div>
        </div>

        {/* Recommended Rotation Target */}
        <div
          className="p-3 rounded-xl border relative"
          style={{
            backgroundColor: theme.bgApp,
            borderColor: theme.borderColor,
          }}
        >
          <div className="flex items-center justify-between text-[10px] font-mono mb-1 text-amber-400">
            <span>ROTATION ADVICE</span>
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono font-black text-sm sm:text-base truncate" style={{ color: theme.textPrimary }}>
              {summaryStats.recommendedRotation ? summaryStats.recommendedRotation.symbol : 'Hold Active'}
            </span>
            {summaryStats.recommendedRotation && (
              <button
                onClick={() => handleRotate(summaryStats.recommendedRotation!.symbol)}
                className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 shrink-0"
              >
                ROTATE
              </button>
            )}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t text-[11px] font-mono" style={{ borderColor: theme.borderColor }}>
            <span style={{ color: theme.textMuted }}>Edge Score</span>
            <span className="font-bold text-amber-400">
              {summaryStats.recommendedRotation ? `${summaryStats.recommendedRotation.edgeScore}/100` : '--'}
            </span>
          </div>
        </div>
      </div>

      {/* Controls Bar: Search, Filters, Sorting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(
            [
              { id: 'all', label: 'All Symbols' },
              { id: 'traded', label: 'Traded Only' },
              { id: 'profitable', label: 'Profitable' },
              { id: 'high_winrate', label: 'Win Rate ≥ 60%' },
            ] as const
          ).map((tab) => {
            const isSelected = filterMode === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setFilterMode(tab.id);
                  sound.play('click');
                }}
                className={`px-2.5 py-1.5 rounded-xl font-medium transition-all shrink-0 border text-[11px] ${
                  isSelected ? 'font-bold shadow-sm' : 'opacity-70 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: isSelected ? `${accentColor}25` : 'transparent',
                  borderColor: isSelected ? accentColor : theme.borderColor,
                  color: isSelected ? accentColor : theme.textSecondary,
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search & Sort Dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Search Box */}
          <div
            className="relative flex items-center px-2.5 py-1.5 rounded-xl border text-xs w-36 sm:w-44"
            style={{
              backgroundColor: theme.bgApp,
              borderColor: theme.borderColor,
            }}
          >
            <Search className="w-3.5 h-3.5 mr-1.5" style={{ color: theme.textMuted }} />
            <input
              type="text"
              placeholder="Search symbol..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none w-full text-xs font-mono"
              style={{ color: theme.textPrimary }}
            />
          </div>

          {/* Sort Select */}
          <div
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs"
            style={{
              backgroundColor: theme.bgApp,
              borderColor: theme.borderColor,
            }}
          >
            <SlidersHorizontal className="w-3 h-3" style={{ color: theme.textMuted }} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent border-none outline-none text-xs font-mono cursor-pointer"
              style={{ color: theme.textPrimary }}
            >
              <option value="winrate">Win Rate (High → Low)</option>
              <option value="profit">Net Profit (High → Low)</option>
              <option value="trades">Trade Count (Most → Least)</option>
              <option value="edge">Edge Score</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* MAIN VIEW: GRID OF CARDS */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredMetrics.map((item) => {
            const isSelected = item.isCurrent;
            const winRateColor =
              item.totalTrades === 0
                ? theme.textMuted
                : item.winRate >= 60
                ? '#10b981'
                : item.winRate >= 50
                ? '#f59e0b'
                : '#f43f5e';

            return (
              <div
                key={item.symbol}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between relative ${
                  isSelected ? 'ring-2' : 'hover:border-opacity-100'
                }`}
                style={{
                  backgroundColor: isSelected ? `${accentColor}08` : theme.bgApp,
                  borderColor: isSelected ? accentColor : theme.borderColor,
                  boxShadow: isSelected ? `0 0 15px ${accentColor}25` : undefined,
                }}
              >
                {/* Active Selection Badge */}
                {isSelected && (
                  <div
                    className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full text-[9px] font-mono font-extrabold uppercase tracking-wider text-slate-950 shadow-md"
                    style={{ backgroundColor: accentColor }}
                  >
                    CURRENT ACTIVE
                  </div>
                )}

                {/* Card Top: Symbol Info & Edge Score */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-sm" style={{ color: theme.textPrimary }}>
                          {item.symbol}
                        </span>
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold"
                          style={{
                            backgroundColor: `${accentColor}15`,
                            color: accentColor,
                          }}
                        >
                          {item.recommendation}
                        </span>
                      </div>
                      <div className="text-[11px] truncate font-sans" style={{ color: theme.textSecondary }}>
                        {item.displayName}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[9px] font-mono uppercase" style={{ color: theme.textMuted }}>
                        EDGE
                      </div>
                      <div className="font-mono font-black text-xs" style={{ color: accentColor }}>
                        {item.edgeScore}%
                      </div>
                    </div>
                  </div>

                  {/* Win Rate & PnL Big Stat */}
                  <div className="grid grid-cols-2 gap-2 my-3 p-2.5 rounded-lg" style={{ backgroundColor: theme.bgCard }}>
                    <div>
                      <span className="text-[10px] uppercase font-mono block" style={{ color: theme.textMuted }}>
                        WIN RATE
                      </span>
                      <div className="font-mono font-black text-lg" style={{ color: winRateColor }}>
                        {item.totalTrades > 0 ? `${item.winRate.toFixed(1)}%` : '0.0%'}
                      </div>
                      <div className="text-[10px] font-mono" style={{ color: theme.textSecondary }}>
                        {item.wins}W - {item.losses}L ({item.totalTrades} total)
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] uppercase font-mono block" style={{ color: theme.textMuted }}>
                        NET P&L
                      </span>
                      <div
                        className={`font-mono font-black text-lg ${
                          item.netProfit > 0
                            ? 'text-emerald-400'
                            : item.netProfit < 0
                            ? 'text-rose-400'
                            : ''
                        }`}
                        style={{ color: item.netProfit === 0 ? theme.textMuted : undefined }}
                      >
                        {item.netProfit > 0 ? '+' : ''}${item.netProfit.toFixed(2)}
                      </div>
                      <div className="text-[10px] font-mono" style={{ color: theme.textSecondary }}>
                        PF: {item.profitFactor.toFixed(2)}x
                      </div>
                    </div>
                  </div>

                  {/* Win/Loss Proportion Segment Bar */}
                  <div className="space-y-1 mb-3">
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                      {item.totalTrades > 0 ? (
                        <>
                          <div
                            className="h-full bg-emerald-500 transition-all"
                            style={{ width: `${item.winRate}%` }}
                          />
                          <div
                            className="h-full bg-rose-500 transition-all"
                            style={{ width: `${100 - item.winRate}%` }}
                          />
                        </>
                      ) : (
                        <div className="h-full w-full bg-slate-800" />
                      )}
                    </div>
                  </div>

                  {/* Recent Sequences (Last 6 outcomes) */}
                  <div className="flex items-center justify-between text-[10px] font-mono py-1 border-t" style={{ borderColor: theme.borderColor }}>
                    <span style={{ color: theme.textMuted }}>Recent Trend:</span>
                    <div className="flex items-center gap-1">
                      {item.recentTrades.length > 0 ? (
                        item.recentTrades.map((res, i) => (
                          <span
                            key={i}
                            className={`w-4 h-4 rounded-full flex items-center justify-center font-bold text-[8px] ${
                              res === 'WIN'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                            }`}
                            title={`Trade outcome: ${res}`}
                          >
                            {res === 'WIN' ? 'W' : 'L'}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px]" style={{ color: theme.textMuted }}>
                          No trades logged
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Action: Rotate Button */}
                <div className="pt-3 mt-2 border-t" style={{ borderColor: theme.borderColor }}>
                  {isSelected ? (
                    <button
                      disabled
                      className="w-full py-2 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1.5 opacity-90 cursor-default"
                      style={{
                        backgroundColor: `${accentColor}25`,
                        color: accentColor,
                        borderColor: accentColor,
                      }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Active Trading Target</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRotate(item.symbol)}
                      className="w-full py-2 rounded-xl text-xs font-mono font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm hover:scale-[1.01]"
                      style={{
                        backgroundColor: accentColor,
                        color: theme.isDark ? '#020617' : '#ffffff',
                      }}
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>Rotate to {item.symbol}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* DENSE TABLE VIEW */
        <div
          className="rounded-xl border overflow-x-auto"
          style={{
            backgroundColor: theme.bgApp,
            borderColor: theme.borderColor,
          }}
        >
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b" style={{ borderColor: theme.borderColor, color: theme.textMuted }}>
                <th className="p-3">Symbol</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Win Rate</th>
                <th className="p-3 text-right">W / L (Total)</th>
                <th className="p-3 text-right">Net P&L</th>
                <th className="p-3 text-right">Profit Factor</th>
                <th className="p-3 text-center">Recent Trend</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: theme.borderColor }}>
              {filteredMetrics.map((item) => {
                const isSelected = item.isCurrent;
                return (
                  <tr
                    key={item.symbol}
                    className="hover:bg-slate-800/20 transition-colors"
                    style={{
                      backgroundColor: isSelected ? `${accentColor}10` : 'transparent',
                    }}
                  >
                    <td className="p-3 font-bold" style={{ color: theme.textPrimary }}>
                      <div>{item.symbol}</div>
                      <div className="text-[10px] font-normal" style={{ color: theme.textMuted }}>
                        {item.displayName}
                      </div>
                    </td>
                    <td className="p-3">
                      {isSelected ? (
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold"
                          style={{
                            backgroundColor: `${accentColor}25`,
                            color: accentColor,
                          }}
                        >
                          ACTIVE
                        </span>
                      ) : (
                        <span className="text-[10px] opacity-70" style={{ color: theme.textSecondary }}>
                          {item.recommendation}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right font-bold">
                      <span
                        style={{
                          color:
                            item.totalTrades === 0
                              ? theme.textMuted
                              : item.winRate >= 60
                              ? '#10b981'
                              : item.winRate >= 50
                              ? '#f59e0b'
                              : '#f43f5e',
                        }}
                      >
                        {item.totalTrades > 0 ? `${item.winRate.toFixed(1)}%` : '0.0%'}
                      </span>
                    </td>
                    <td className="p-3 text-right" style={{ color: theme.textSecondary }}>
                      {item.wins}W / {item.losses}L ({item.totalTrades})
                    </td>
                    <td
                      className={`p-3 text-right font-bold ${
                        item.netProfit > 0
                          ? 'text-emerald-400'
                          : item.netProfit < 0
                          ? 'text-rose-400'
                          : ''
                      }`}
                      style={{ color: item.netProfit === 0 ? theme.textMuted : undefined }}
                    >
                      {item.netProfit > 0 ? '+' : ''}${item.netProfit.toFixed(2)}
                    </td>
                    <td className="p-3 text-right" style={{ color: theme.textSecondary }}>
                      {item.profitFactor.toFixed(2)}x
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {item.recentTrades.slice(0, 5).map((res, i) => (
                          <span
                            key={i}
                            className={`w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold text-[7px] ${
                              res === 'WIN'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-rose-500/20 text-rose-400'
                            }`}
                          >
                            {res === 'WIN' ? 'W' : 'L'}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      {isSelected ? (
                        <span className="text-[11px] font-bold" style={{ color: accentColor }}>
                          Current
                        </span>
                      ) : (
                        <button
                          onClick={() => handleRotate(item.symbol)}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold transition-all"
                          style={{
                            backgroundColor: accentColor,
                            color: theme.isDark ? '#020617' : '#ffffff',
                          }}
                        >
                          Rotate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom Educational Hint */}
      <div
        className="p-3 rounded-xl border flex items-center gap-2.5 text-xs"
        style={{
          backgroundColor: theme.bgApp,
          borderColor: theme.borderColor,
          color: theme.textSecondary,
        }}
      >
        <Info className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
        <p className="text-[11px] leading-relaxed">
          <strong>Manual Rotation Strategy:</strong> When an active market experiences consecutive losses or low volatility contraction, rotate to symbols with high historical win rates (&gt;60%) and positive profit factors. The active SBAgent engine synchronizes tick feeds upon rotation.
        </p>
      </div>
    </div>
  );
};
