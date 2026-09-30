import React, { useState } from 'react';
import {
  TechnicalIndicators,
  MarketRegime,
  TradingAgent,
} from '../types/trading';
import {
  Activity,
  Gauge,
  Compass,
  Layers,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Clock,
  Eye,
  Zap,
  FileText,
} from 'lucide-react';

interface TechnicalAnalyticsViewProps {
  indicators: TechnicalIndicators | null;
  regime: MarketRegime;
  symbol: string;
  candlesCount: number;
  onOpenGoogleDocsModal?: () => void;
}

export const TechnicalAnalyticsView: React.FC<TechnicalAnalyticsViewProps> = ({
  indicators,
  regime,
  symbol,
  candlesCount,
  onOpenGoogleDocsModal,
}) => {
  const [playbookData, setPlaybookData] = useState<any | null>(null);
  const [isLoadingPlaybook, setIsLoadingPlaybook] = useState(false);

  const fetchAIPlaybook = async () => {
    if (!indicators) return;
    setIsLoadingPlaybook(true);
    try {
      const res = await fetch('/api/ai/analyze-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          indicators,
          timeframe: '15m',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPlaybookData(data);
      }
    } catch (err) {
      console.error('Error fetching AI Playbook:', err);
    } finally {
      setIsLoadingPlaybook(false);
    }
  };

  const rsi = indicators?.rsiNow ?? 50;
  const rsiStatus = rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : 'Neutral Zone';

  return (
    <div className="flex flex-col gap-6">
      {/* Top Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Market Mood & Sentiment */}
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col gap-3 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-cyan-400" />
              MARKET SENTIMENT MOOD
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
              {indicators?.mood?.mood || 'NEUTRAL'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-xl font-black text-slate-100">
                {indicators?.mood ? `${(indicators.mood.ratio * 100).toFixed(1)}%` : '50.0%'}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">Upward Volume Ratio</div>
            </div>
            <div className="text-right font-mono text-xs text-slate-400">
              Strength: <strong className="text-cyan-300">{indicators?.mood ? (indicators.mood.strength * 100).toFixed(0) : '50'}%</strong>
            </div>
          </div>

          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500 rounded-full"
              style={{ width: `${(indicators?.mood?.ratio ?? 0.5) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Multi-Timeframe Alignment */}
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col gap-3 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-cyan-400" />
              MULTI-TIMEFRAME ALIGNMENT
            </span>
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                indicators?.mtfAnalysis?.direction === 'BULLISH'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : indicators?.mtfAnalysis?.direction === 'BEARISH'
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              {indicators?.mtfAnalysis?.direction || 'NEUTRAL'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-xl font-black text-slate-100">
                {indicators?.mtfAnalysis ? `${(indicators.mtfAnalysis.consistency * 100).toFixed(0)}%` : '50%'}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">Consensus Consistency</div>
            </div>
            <div className="text-right font-mono text-xs text-slate-400">
              Strength: <strong className="text-cyan-300">{indicators?.mtfAnalysis ? (indicators.mtfAnalysis.strength * 100).toFixed(0) : '50'}%</strong>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-center">
            <div className="bg-slate-950 p-1 rounded">
              <span className="text-slate-500 block">Short (5)</span>
              <span className={indicators?.mtfAnalysis?.shortTrend && indicators.mtfAnalysis.shortTrend > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {indicators?.mtfAnalysis?.shortTrend && indicators.mtfAnalysis.shortTrend > 0 ? 'Bull' : 'Bear'}
              </span>
            </div>
            <div className="bg-slate-950 p-1 rounded">
              <span className="text-slate-500 block">Med (10)</span>
              <span className={indicators?.mtfAnalysis?.medTrend && indicators.mtfAnalysis.medTrend > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {indicators?.mtfAnalysis?.medTrend && indicators.mtfAnalysis.medTrend > 0 ? 'Bull' : 'Bear'}
              </span>
            </div>
            <div className="bg-slate-950 p-1 rounded">
              <span className="text-slate-500 block">Long (20)</span>
              <span className={indicators?.mtfAnalysis?.longTrend && indicators.mtfAnalysis.longTrend > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {indicators?.mtfAnalysis?.longTrend && indicators.mtfAnalysis.longTrend > 0 ? 'Bull' : 'Bear'}
              </span>
            </div>
          </div>
        </div>

        {/* Candlestick Pattern Detection */}
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col gap-3 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-cyan-400" />
              PATTERN DETECTOR
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              Confidence: {indicators?.pattern ? (indicators.pattern.strength * 100).toFixed(0) : 0}%
            </span>
          </div>

          <div>
            <div className="font-mono text-base font-black text-slate-100 flex items-center gap-1.5">
              <span>🕯️ {indicators?.pattern?.pattern !== 'NONE' ? indicators?.pattern?.pattern : 'Standard Formation'}</span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
              Signal bias: <strong className="text-cyan-300">{indicators?.pattern?.signal || 'NEUTRAL'}</strong>
            </div>
          </div>

          <div className="p-2 bg-slate-950/70 border border-slate-800/80 rounded-lg text-[11px] font-mono text-slate-300">
            {indicators?.pattern?.pattern === 'HAMMER' && 'Bullish rejection at support with long lower wick.'}
            {indicators?.pattern?.pattern === 'SHOOTING_STAR' && 'Bearish rejection at resistance with long upper wick.'}
            {indicators?.pattern?.pattern === 'BULLISH_ENGULFING' && 'Strong buyers overtook previous bearish candle body.'}
            {indicators?.pattern?.pattern === 'BEARISH_ENGULFING' && 'Strong sellers overwhelmed previous bullish candle body.'}
            {indicators?.pattern?.pattern === 'DOJI' && 'Equilibrium indecision candle forming.'}
            {(!indicators?.pattern?.pattern || indicators?.pattern?.pattern === 'NONE') && 'No dominant reversal formation on current bar.'}
          </div>
        </div>
      </div>

      {/* Grid of Key Technical Metrics */}
      <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-xl shadow-xl backdrop-blur-md flex flex-col gap-4">
        <h3 className="text-xs font-bold font-mono tracking-wider text-slate-200 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-cyan-400" />
          MATHEMATICAL TECHNICAL METRICS MATRIX
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono">
          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col gap-1">
            <span className="text-slate-500">RSI (14)</span>
            <span className="text-base font-black text-slate-100">{indicators?.rsiNow ? indicators.rsiNow.toFixed(1) : '--'}</span>
            <span className={`text-[10px] ${rsi > 70 ? 'text-rose-400' : rsi < 30 ? 'text-emerald-400' : 'text-slate-400'}`}>
              {rsiStatus}
            </span>
          </div>

          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col gap-1">
            <span className="text-slate-500">MA14 vs MA50</span>
            <span className="text-base font-black text-slate-100">
              {indicators?.ma14Now && indicators?.ma50Now ? (indicators.ma14Now > indicators.ma50Now ? 'BULL CROSS' : 'BEAR CROSS') : '--'}
            </span>
            <span className="text-[10px] text-slate-400">
              MA14: {indicators?.ma14Now?.toFixed(2) || '--'}
            </span>
          </div>

          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col gap-1">
            <span className="text-slate-500">Bollinger Upper</span>
            <span className="text-base font-black text-sky-400">{indicators?.bbNow?.upper?.toFixed(2) || '--'}</span>
            <span className="text-[10px] text-slate-400">Middle: {indicators?.bbNow?.middle?.toFixed(2) || '--'}</span>
          </div>

          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col gap-1">
            <span className="text-slate-500">Bollinger Lower</span>
            <span className="text-base font-black text-sky-400">{indicators?.bbNow?.lower?.toFixed(2) || '--'}</span>
            <span className="text-[10px] text-slate-400">Spread: {indicators?.bbNow?.upper && indicators?.bbNow?.lower ? (indicators.bbNow.upper - indicators.bbNow.lower).toFixed(2) : '--'}</span>
          </div>

          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col gap-1">
            <span className="text-slate-500">ATR (14) Range</span>
            <span className="text-base font-black text-amber-400">{indicators?.atrNow?.toFixed(3) || '--'}</span>
            <span className="text-[10px] text-slate-400">Average True Range</span>
          </div>

          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col gap-1">
            <span className="text-slate-500">VWAP Deviation</span>
            <span className="text-base font-black text-slate-100">{indicators?.vwapAnalysis ? `${(indicators.vwapAnalysis.deviation * 100).toFixed(3)}%` : '--'}</span>
            <span className="text-[10px] text-cyan-400">{indicators?.vwapAnalysis?.signal || 'NEUTRAL'}</span>
          </div>
        </div>
      </div>

      {/* AI Chart Playbook Section */}
      <div className="p-5 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-cyan-500/30 rounded-xl shadow-2xl flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-white font-sans">
                GEMINI 3.7 MULTI-TIMEFRAME STRATEGY PLAYBOOK
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Comprehensive AI technical blueprint with entry criteria and scenario planning
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenGoogleDocsModal && (
              <button
                id="export-analytics-to-google-docs-btn"
                onClick={onOpenGoogleDocsModal}
                className="flex items-center gap-2 px-3.5 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 font-bold text-xs font-mono rounded-xl transition-all shadow-sm"
                title="Export this technical analysis to a Google Document"
              >
                <FileText className="w-3.5 h-3.5 text-blue-400" />
                <span>EXPORT TO GOOGLE DOCS</span>
              </button>
            )}

            <button
              onClick={fetchAIPlaybook}
              disabled={isLoadingPlaybook}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs font-mono rounded-xl transition-all shadow-md shadow-cyan-500/20"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isLoadingPlaybook ? 'animate-spin' : ''}`} />
              <span>{isLoadingPlaybook ? 'GENERATING PLAYBOOK...' : 'GENERATE AI PLAYBOOK'}</span>
            </button>
          </div>
        </div>

        {playbookData && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans mt-2">
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col gap-2">
              <div className="text-cyan-400 font-mono font-bold uppercase tracking-wider text-[11px]">
                Trend & Volatility Assessment
              </div>
              <p className="text-slate-300 leading-relaxed">{playbookData.trend_summary}</p>
              <div className="mt-2 text-slate-400 font-mono text-[11px]">
                Volatility: <strong className="text-slate-200">{playbookData.volatility_assessment}</strong>
              </div>
            </div>

            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col gap-2">
              <div className="text-emerald-400 font-mono font-bold uppercase tracking-wider text-[11px]">
                Bullish Rise Scenario
              </div>
              <p className="text-slate-300 leading-relaxed">{playbookData.bullish_scenario}</p>
            </div>

            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col gap-2">
              <div className="text-rose-400 font-mono font-bold uppercase tracking-wider text-[11px]">
                Bearish Fall Scenario
              </div>
              <p className="text-slate-300 leading-relaxed">{playbookData.bearish_scenario}</p>
            </div>

            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col gap-2">
              <div className="text-amber-400 font-mono font-bold uppercase tracking-wider text-[11px]">
                Actionable Playbook & Optimal Entry
              </div>
              <p className="text-slate-200 font-medium leading-relaxed">{playbookData.recommended_playbook}</p>
              {playbookData.optimal_entry_zone && (
                <div className="mt-1 text-[11px] font-mono text-cyan-300">
                  Optimal Entry Zone: {playbookData.optimal_entry_zone}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
