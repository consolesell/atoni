import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  BarChart3,
  Activity,
  Layers,
  Sparkles,
  RefreshCw,
  Award,
  AlertTriangle,
} from 'lucide-react';
import { TradeRecord } from '../types/trading';

interface DailyCumulativePnLChartProps {
  closedTrades: TradeRecord[];
  currency?: string;
  currentBalance?: number;
}

interface DailyAggregation {
  dateStr: string;
  dateObj: Date;
  tradesCount: number;
  wins: number;
  losses: number;
  dailyPnL: number;
  cumulativePnL: number;
  winRate: number;
  trades: TradeRecord[];
}

export const DailyCumulativePnLChart: React.FC<DailyCumulativePnLChartProps> = ({
  closedTrades,
  currency = 'USD',
  currentBalance = 10000,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Timeframe and display filters
  const [timeframe, setTimeframe] = useState<'7d' | '14d' | '30d' | 'all'>('30d');
  const [viewMode, setViewMode] = useState<'combo' | 'cumulative' | 'daily'>('combo');
  const [hoveredPoint, setHoveredPoint] = useState<DailyAggregation | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [showSimulatedHistory, setShowSimulatedHistory] = useState(false);

  // Generate synthetic sample history if the user has no closed trades yet or chooses demo audit
  const sampleTrades = useMemo(() => {
    const list: TradeRecord[] = [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    // Generate 18 days of sample quant algorithmic trades
    let runningBalance = currentBalance - 850;
    for (let i = 18; i >= 0; i--) {
      const dayTime = now - i * dayMs;
      const tradesToday = Math.floor(Math.random() * 5) + 2;
      for (let j = 0; j < tradesToday; j++) {
        const won = Math.random() > 0.38; // 62% win rate
        const stake = Math.floor(Math.random() * 40) + 15;
        const profit = won ? Number((stake * 0.95).toFixed(2)) : -stake;
        runningBalance += profit;
        list.push({
          id: `sample_${i}_${j}`,
          timestamp: new Date(dayTime + j * 3600000).toISOString(),
          mode: 'SIMULATION',
          symbol: 'R_25',
          amount: stake,
          decision: won ? 'BUY' : 'SELL',
          result: won ? 'WIN' : 'LOSS',
          profit,
          confidence: Math.floor(Math.random() * 25) + 70,
          agent: 'Hybrid Consensus',
          regime: 'Mean Reverting',
          duration: 60,
          entryPrice: 1845.2,
        });
      }
    }
    return list;
  }, [currentBalance]);

  // Use either actual closed trades (if available) or sample trades if toggled/empty
  const activeTrades = useMemo(() => {
    if (closedTrades && closedTrades.length > 0 && !showSimulatedHistory) {
      return closedTrades;
    }
    return sampleTrades;
  }, [closedTrades, sampleTrades, showSimulatedHistory]);

  const isUsingSimulated = closedTrades.length === 0 || showSimulatedHistory;

  // Aggregate trades by calendar date
  const dailyData: DailyAggregation[] = useMemo(() => {
    if (!activeTrades || activeTrades.length === 0) return [];

    // Map: date string -> trades
    const groups: { [key: string]: TradeRecord[] } = {};

    activeTrades.forEach((trade) => {
      const d = new Date(trade.timestamp);
      if (isNaN(d.getTime())) return;
      // Local date format YYYY-MM-DD
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(trade);
    });

    const sortedDates = Object.keys(groups).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    // Apply timeframe cutoff
    let filteredDates = sortedDates;
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    if (timeframe === '7d') {
      const cutoff = now - 7 * dayMs;
      filteredDates = sortedDates.filter((d) => new Date(d).getTime() >= cutoff);
    } else if (timeframe === '14d') {
      const cutoff = now - 14 * dayMs;
      filteredDates = sortedDates.filter((d) => new Date(d).getTime() >= cutoff);
    } else if (timeframe === '30d') {
      const cutoff = now - 30 * dayMs;
      filteredDates = sortedDates.filter((d) => new Date(d).getTime() >= cutoff);
    }

    let runningCumulative = 0;
    const result: DailyAggregation[] = [];

    filteredDates.forEach((dateStr) => {
      const dayTrades = groups[dateStr];
      const wins = dayTrades.filter((t) => t.result === 'WIN' || (t.profit !== undefined && t.profit > 0)).length;
      const losses = dayTrades.filter((t) => t.result === 'LOSS' || (t.profit !== undefined && t.profit < 0)).length;
      const dailyPnL = dayTrades.reduce((acc, t) => acc + (typeof t.profit === 'number' ? t.profit : 0), 0);
      runningCumulative += dailyPnL;

      result.push({
        dateStr,
        dateObj: new Date(dateStr + 'T00:00:00'),
        tradesCount: dayTrades.length,
        wins,
        losses,
        dailyPnL: Number(dailyPnL.toFixed(2)),
        cumulativePnL: Number(runningCumulative.toFixed(2)),
        winRate: dayTrades.length > 0 ? (wins / dayTrades.length) * 100 : 0,
        trades: dayTrades,
      });
    });

    return result;
  }, [activeTrades, timeframe]);

  // Overall Statistics
  const stats = useMemo(() => {
    if (dailyData.length === 0) {
      return {
        totalCumulativePnL: 0,
        totalTrades: 0,
        winRate: 0,
        bestDay: { date: 'N/A', pnl: 0 },
        worstDay: { date: 'N/A', pnl: 0 },
        profitFactor: 0,
        profitableDays: 0,
      };
    }

    const totalCumulativePnL = dailyData[dailyData.length - 1]?.cumulativePnL || 0;
    const totalTrades = dailyData.reduce((acc, d) => acc + d.tradesCount, 0);
    const totalWins = dailyData.reduce((acc, d) => acc + d.wins, 0);
    const totalLosses = dailyData.reduce((acc, d) => acc + d.losses, 0);
    const profitableDays = dailyData.filter((d) => d.dailyPnL > 0).length;

    let bestDay = { date: dailyData[0].dateStr, pnl: dailyData[0].dailyPnL };
    let worstDay = { date: dailyData[0].dateStr, pnl: dailyData[0].dailyPnL };
    let grossWins = 0;
    let grossLosses = 0;

    dailyData.forEach((d) => {
      if (d.dailyPnL > bestDay.pnl) bestDay = { date: d.dateStr, pnl: d.dailyPnL };
      if (d.dailyPnL < worstDay.pnl) worstDay = { date: d.dateStr, pnl: d.dailyPnL };
      if (d.dailyPnL > 0) grossWins += d.dailyPnL;
      else grossLosses += Math.abs(d.dailyPnL);
    });

    const profitFactor = grossLosses > 0 ? Number((grossWins / grossLosses).toFixed(2)) : grossWins > 0 ? 99.9 : 0;
    const winRate = totalTrades > 0 ? Number(((totalWins / totalTrades) * 100).toFixed(1)) : 0;

    return {
      totalCumulativePnL,
      totalTrades,
      winRate,
      bestDay,
      worstDay,
      profitFactor,
      profitableDays,
    };
  }, [dailyData]);

  // D3 Chart Drawing via SVG
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || dailyData.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth || 700;
    const height = 310;
    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%').attr('height', height);

    // Defs for gradients & clip-paths
    const defs = svg.append('defs');

    // Positive cumulative gradient (emerald)
    const emeraldGrad = defs
      .append('linearGradient')
      .attr('id', 'cumulative-emerald-grad')
      .attr('x1', '0')
      .attr('y1', '0')
      .attr('x2', '0')
      .attr('y2', '1');
    emeraldGrad.append('stop').attr('offset', '0%').attr('stop-color', '#10b981').attr('stop-opacity', 0.45);
    emeraldGrad.append('stop').attr('offset', '100%').attr('stop-color', '#10b981').attr('stop-opacity', 0.0);

    // Negative cumulative gradient (rose)
    const roseGrad = defs
      .append('linearGradient')
      .attr('id', 'cumulative-rose-grad')
      .attr('x1', '0')
      .attr('y1', '1')
      .attr('x2', '0')
      .attr('y2', '0');
    roseGrad.append('stop').attr('offset', '0%').attr('stop-color', '#f43f5e').attr('stop-opacity', 0.4);
    roseGrad.append('stop').attr('offset', '100%').attr('stop-color', '#f43f5e').attr('stop-opacity', 0.0);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // X scale: Band or Point
    const xScale = d3
      .scaleBand<string>()
      .domain(dailyData.map((d) => d.dateStr))
      .range([0, innerWidth])
      .padding(0.35);

    // Y Scale: Linear P&L
    const minDaily = d3.min(dailyData, (d) => Math.min(d.dailyPnL, d.cumulativePnL)) || 0;
    const maxDaily = d3.max(dailyData, (d) => Math.max(d.dailyPnL, d.cumulativePnL)) || 0;

    const yMin = Math.min(0, minDaily) * 1.25;
    const yMax = Math.max(0, maxDaily) * 1.25 || 100;

    const yScale = d3.scaleLinear().domain([yMin, yMax]).range([innerHeight, 0]).nice();

    // Horizontal Grid Lines
    const yTicks = yScale.ticks(6);
    g.append('g')
      .attr('class', 'grid')
      .selectAll('line')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', '#1e293b')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3');

    // Zero Baseline
    const zeroY = yScale(0);
    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', zeroY)
      .attr('y2', zeroY)
      .attr('stroke', '#64748b')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5,4');

    g.append('text')
      .attr('x', innerWidth - 6)
      .attr('y', zeroY - 6)
      .attr('text-anchor', 'end')
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px')
      .attr('font-family', 'ui-monospace, monospace')
      .text('$0.00 Base');

    // 1. Render Daily PnL Bars (if 'combo' or 'daily' view)
    if (viewMode === 'combo' || viewMode === 'daily') {
      g.selectAll('.pnl-bar')
        .data(dailyData)
        .enter()
        .append('rect')
        .attr('class', 'pnl-bar')
        .attr('x', (d) => xScale(d.dateStr) || 0)
        .attr('width', xScale.bandwidth())
        .attr('y', (d) => (d.dailyPnL >= 0 ? yScale(d.dailyPnL) : zeroY))
        .attr('height', (d) => Math.max(2, Math.abs(yScale(d.dailyPnL) - zeroY)))
        .attr('rx', 3)
        .attr('fill', (d) => (d.dailyPnL >= 0 ? '#10b981' : '#f43f5e'))
        .attr('opacity', viewMode === 'combo' ? 0.6 : 0.9)
        .attr('stroke', (d) => (d.dailyPnL >= 0 ? '#059669' : '#e11d48'))
        .attr('stroke-width', 1);
    }

    // 2. Render Cumulative Area and Curve (if 'combo' or 'cumulative' view)
    if (viewMode === 'combo' || viewMode === 'cumulative') {
      const getX = (d: DailyAggregation) => (xScale(d.dateStr) || 0) + xScale.bandwidth() / 2;

      // Area generator
      const areaGen = d3
        .area<DailyAggregation>()
        .curve(d3.curveMonotoneX)
        .x(getX)
        .y0(zeroY)
        .y1((d) => yScale(d.cumulativePnL));

      g.append('path')
        .datum(dailyData)
        .attr('class', 'cumulative-area')
        .attr('d', areaGen)
        .attr('fill', 'url(#cumulative-emerald-grad)');

      // Line generator
      const lineGen = d3
        .line<DailyAggregation>()
        .curve(d3.curveMonotoneX)
        .x(getX)
        .y((d) => yScale(d.cumulativePnL));

      g.append('path')
        .datum(dailyData)
        .attr('class', 'cumulative-line')
        .attr('d', lineGen)
        .attr('fill', 'none')
        .attr('stroke', '#38bdf8')
        .attr('stroke-width', 2.5)
        .attr('filter', 'drop-shadow(0 0 6px rgba(56,189,248,0.4))');

      // Points on cumulative curve
      g.selectAll('.cumul-dot')
        .data(dailyData)
        .enter()
        .append('circle')
        .attr('class', 'cumul-dot')
        .attr('cx', getX)
        .attr('cy', (d) => yScale(d.cumulativePnL))
        .attr('r', 3.5)
        .attr('fill', '#0284c7')
        .attr('stroke', '#e0f2fe')
        .attr('stroke-width', 1.5);
    }

    // X Axis
    const xAxis = d3
      .axisBottom(xScale)
      .tickValues(
        xScale.domain().filter((_, i) => {
          const step = Math.ceil(dailyData.length / 8);
          return i % step === 0 || i === dailyData.length - 1;
        })
      )
      .tickFormat((d) => {
        const parts = d.split('-');
        if (parts.length === 3) return `${parts[1]}/${parts[2]}`;
        return d;
      });

    g.append('g')
      .attr('transform', `translate(0, ${innerHeight})`)
      .call(xAxis)
      .attr('color', '#64748b')
      .selectAll('text')
      .attr('font-family', 'ui-monospace, monospace')
      .attr('font-size', '10px')
      .attr('dy', '1em');

    // Y Axis
    const yAxis = d3
      .axisLeft(yScale)
      .ticks(6)
      .tickFormat((d) => {
        const val = Number(d);
        return `${val >= 0 ? '+' : ''}$${Math.abs(val).toFixed(0)}`;
      });

    g.append('g')
      .call(yAxis)
      .attr('color', '#64748b')
      .selectAll('text')
      .attr('font-family', 'ui-monospace, monospace')
      .attr('font-size', '10px');

    // Interactive Hover Overlay
    const bisectDate = (mouseX: number) => {
      let closest: DailyAggregation = dailyData[0];
      let minDiff = Infinity;
      dailyData.forEach((d) => {
        const pointX = (xScale(d.dateStr) || 0) + xScale.bandwidth() / 2;
        const diff = Math.abs(pointX - mouseX);
        if (diff < minDiff) {
          minDiff = diff;
          closest = d;
        }
      });
      return closest;
    };

    const overlay = g
      .append('rect')
      .attr('class', 'overlay')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .attr('cursor', 'crosshair');

    // Crosshair line
    const hoverLine = g
      .append('line')
      .attr('class', 'hover-line')
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', '#38bdf8')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2,2')
      .style('opacity', 0);

    // Hover circle
    const hoverCircle = g
      .append('circle')
      .attr('class', 'hover-circle')
      .attr('r', 5.5)
      .attr('fill', '#38bdf8')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2)
      .style('opacity', 0);

    overlay
      .on('mousemove', function (event) {
        const [mX, mY] = d3.pointer(event, this);
        const item = bisectDate(mX);
        if (!item) return;

        const posX = (xScale(item.dateStr) || 0) + xScale.bandwidth() / 2;
        const posY = yScale(item.cumulativePnL);

        hoverLine.attr('x1', posX).attr('x2', posX).style('opacity', 1);
        hoverCircle.attr('cx', posX).attr('cy', posY).style('opacity', 1);

        setHoveredPoint(item);
        setHoverPos({ x: posX + margin.left, y: posY + margin.top });
      })
      .on('mouseleave', () => {
        hoverLine.style('opacity', 0);
        hoverCircle.style('opacity', 0);
        setHoveredPoint(null);
        setHoverPos(null);
      });
  }, [dailyData, viewMode]);

  return (
    <div
      id="daily-cumulative-pnl-d3"
      className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4 font-sans relative overflow-hidden"
    >
      {/* Background Ambience */}
      <div className="absolute top-0 right-0 w-96 h-48 bg-gradient-to-bl from-cyan-500/5 via-blue-500/5 to-transparent pointer-events-none blur-2xl" />

      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 text-cyan-400 border border-cyan-500/30">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-slate-100 font-sans tracking-tight">
                Daily Cumulative P&L History
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-500/30">
                D3.JS POWERED
              </span>
              {isUsingSimulated && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-950/80 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> Sample Audit Ledger
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Aggregate day-by-day trading ledger & cumulative trajectory from closed positions
            </p>
          </div>
        </div>

        {/* View Mode & Timeframe Filters */}
        <div className="flex items-center gap-2">
          {/* Toggle sample/actual */}
          {closedTrades.length > 0 && (
            <button
              onClick={() => setShowSimulatedHistory((prev) => !prev)}
              className={`px-2.5 py-1 text-[11px] font-mono rounded-lg border transition-all ${
                showSimulatedHistory
                  ? 'bg-purple-900/40 text-purple-200 border-purple-700/60'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {showSimulatedHistory ? 'Viewing Sample Backtest' : 'View Real Ledger'}
            </button>
          )}

          {/* View Modes */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
            <button
              onClick={() => setViewMode('combo')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                viewMode === 'combo' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-white'
              }`}
              title="Combined Daily Bars + Cumulative Curve"
            >
              Combo
            </button>
            <button
              onClick={() => setViewMode('cumulative')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                viewMode === 'cumulative' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-white'
              }`}
              title="Cumulative Equity Curve Only"
            >
              Curve
            </button>
            <button
              onClick={() => setViewMode('daily')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                viewMode === 'daily' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-white'
              }`}
              title="Daily PnL Bars Only"
            >
              Bars
            </button>
          </div>

          {/* Timeframe selector */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
            {(['7d', '14d', '30d', 'all'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 rounded-lg uppercase transition-all ${
                  timeframe === tf ? 'bg-blue-600/30 text-blue-300 font-bold border border-blue-500/40' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
        {/* Total Cumulative PnL */}
        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col gap-1">
          <span className="text-[10px] text-slate-400 font-bold uppercase">Net Cumulative P&L</span>
          <div className="flex items-center gap-1.5">
            {stats.totalCumulativePnL >= 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-400" />
            )}
            <span
              className={`text-base font-black ${
                stats.totalCumulativePnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {stats.totalCumulativePnL >= 0 ? '+' : ''}${stats.totalCumulativePnL.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Win Rate */}
        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col gap-1">
          <span className="text-[10px] text-slate-400 font-bold uppercase">Win Rate</span>
          <div className="flex items-center gap-1.5">
            <Award className="w-4 h-4 text-cyan-400" />
            <span className="text-base font-black text-cyan-300">{stats.winRate}%</span>
          </div>
        </div>

        {/* Profit Factor */}
        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col gap-1">
          <span className="text-[10px] text-slate-400 font-bold uppercase">Profit Factor</span>
          <span className="text-base font-black text-slate-200">
            {stats.profitFactor > 0 ? stats.profitFactor : '1.00'}
          </span>
        </div>

        {/* Best Day */}
        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col gap-1">
          <span className="text-[10px] text-slate-400 font-bold uppercase">Best Day</span>
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold text-emerald-400 font-mono">
              +${stats.bestDay.pnl.toFixed(2)}
            </span>
            <span className="text-[10px] text-slate-500 truncate">{stats.bestDay.date}</span>
          </div>
        </div>

        {/* Worst Day */}
        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col gap-1">
          <span className="text-[10px] text-slate-400 font-bold uppercase">Worst Day</span>
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold text-rose-400 font-mono">
              ${stats.worstDay.pnl.toFixed(2)}
            </span>
            <span className="text-[10px] text-slate-500 truncate">{stats.worstDay.date}</span>
          </div>
        </div>

        {/* Closed Positions */}
        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col gap-1">
          <span className="text-[10px] text-slate-400 font-bold uppercase">Trades Logged</span>
          <div className="flex items-center justify-between">
            <span className="text-base font-black text-slate-200">{stats.totalTrades}</span>
            <span className="text-[10px] text-slate-400">
              {stats.profitableDays}/{dailyData.length} Green Days
            </span>
          </div>
        </div>
      </div>

      {/* D3 Canvas Container */}
      <div ref={containerRef} className="relative w-full bg-slate-950/60 rounded-xl border border-slate-800/80 p-2 overflow-hidden">
        <svg ref={svgRef} className="w-full select-none" />

        {/* Interactive Hover HUD Tooltip */}
        {hoveredPoint && hoverPos && (
          <div
            className="absolute z-20 pointer-events-none p-3 bg-slate-900/95 border border-cyan-500/50 rounded-xl shadow-2xl backdrop-blur-md text-xs font-mono flex flex-col gap-1.5 transition-all duration-75"
            style={{
              left: Math.min(hoverPos.x + 12, (containerRef.current?.clientWidth || 500) - 180),
              top: Math.max(10, Math.min(hoverPos.y - 40, 200)),
            }}
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-1">
              <span className="font-bold text-slate-200">{hoveredPoint.dateStr}</span>
              <span className="text-[10px] text-slate-400">{hoveredPoint.tradesCount} trades</span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-400">Daily P&L:</span>
              <span
                className={`font-black ${
                  hoveredPoint.dailyPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {hoveredPoint.dailyPnL >= 0 ? '+' : ''}${hoveredPoint.dailyPnL.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-400">Cumulative:</span>
              <span
                className={`font-black ${
                  hoveredPoint.cumulativePnL >= 0 ? 'text-cyan-300' : 'text-rose-300'
                }`}
              >
                {hoveredPoint.cumulativePnL >= 0 ? '+' : ''}${hoveredPoint.cumulativePnL.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 text-[10px] text-slate-400 pt-0.5">
              <span>Day Breakdown:</span>
              <span className="font-bold text-slate-200">
                {hoveredPoint.wins}W - {hoveredPoint.losses}L ({hoveredPoint.winRate.toFixed(0)}%)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer Legend */}
      <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 font-mono pt-1">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500 opacity-70"></span>
            <span>Profitable Day Bar</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-rose-500 opacity-70"></span>
            <span>Drawdown Day Bar</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-cyan-400"></span>
            <span>Cumulative Running P&L</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">
          Updated on closed trade resolution • Hover for daily breakdown
        </div>
      </div>
    </div>
  );
};
