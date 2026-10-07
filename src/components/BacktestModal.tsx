import React, { useState } from 'react';
import {
  X,
  Play,
  RotateCcw,
  Download,
  TrendingUp,
  Shield,
  Layers,
  Award,
  Zap,
  BarChart3,
  CheckCircle2,
  Sliders,
} from 'lucide-react';
import { runHistoricalBacktest, BacktestResult } from '../lib/backtesterEngine';
import { downloadTradesCSV } from '../features/journal/journalUtils';
import { sound } from '../lib/soundEngine';
import { useAgentStore } from '../features/agents/agentStore';

interface BacktestModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSymbol?: string;
}

export const BacktestModal: React.FC<BacktestModalProps> = ({
  isOpen,
  onClose,
  defaultSymbol = '1HZ100V',
}) => {
  const { agents, evolveAgentWeights } = useAgentStore();
  const [selectedSymbol, setSelectedSymbol] = useState(defaultSymbol);
  const [sampleSize, setSampleSize] = useState(250);
  const [sizingMode, setSizingMode] = useState<'KELLY_HALF' | 'KELLY_QUARTER' | 'FIXED'>('KELLY_HALF');
  const [initialBalance, setInitialBalance] = useState(100);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(() =>
    runHistoricalBacktest({ symbol: defaultSymbol, initialBalance: 100, sizingMode: 'KELLY_HALF' })
  );
  const [appliedFeedback, setAppliedFeedback] = useState(false);

  if (!isOpen) return null;

  const handleRunBacktest = () => {
    setIsRunning(true);
    sound.play('trade');
    setTimeout(() => {
      const res = runHistoricalBacktest({
        symbol: selectedSymbol,
        initialBalance,
        sizingMode,
      });
      setResult(res);
      setIsRunning(false);
      setAppliedFeedback(false);
      sound.play('win');
    }, 400);
  };

  const handleApplyOptimalWeights = () => {
    if (!result) return;
    const evolved = result.agentPerformance.map((ap) => {
      const weightBonus = ap.winRate >= 55 ? 1.25 : ap.winRate <= 45 ? 0.8 : 1.0;
      return {
        name: ap.agentName,
        weights: {
          ma: Number((1.0 * weightBonus).toFixed(2)),
          momentum: Number((1.1 * weightBonus).toFixed(2)),
          rsi: Number((0.9 * weightBonus).toFixed(2)),
          bb: Number((1.2 * weightBonus).toFixed(2)),
        },
      };
    });
    evolveAgentWeights(evolved);
    setAppliedFeedback(true);
    sound.play('win');
    setTimeout(() => setAppliedFeedback(false), 3000);
  };

  // Render SVG Equity Curve
  const renderEquityCurve = () => {
    if (!result || result.equityCurve.length < 2) return null;
    const curve = result.equityCurve;
    const minVal = Math.min(...curve.map((p) => p.balance)) * 0.98;
    const maxVal = Math.max(...curve.map((p) => p.balance)) * 1.02;
    const range = maxVal - minVal || 1;

    const width = 640;
    const height = 180;
    const padding = 20;

    const points = curve
      .map((p, idx) => {
        const x = padding + (idx / (curve.length - 1)) * (width - padding * 2);
        const y = height - padding - ((p.balance - minVal) / range) * (height - padding * 2);
        return `${x},${y}`;
      })
      .join(' ');

    const isProfitable = result.netProfit >= 0;
    const strokeColor = isProfitable ? '#10b981' : '#f43f5e';
    const fillColor = isProfitable ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)';

    return (
      <div className="relative w-full bg-slate-950/80 rounded-xl p-3 border border-slate-800">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-mono">
          <span>Initial: ${result.initialBalance.toFixed(2)}</span>
          <span className={isProfitable ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
            Final: ${result.finalBalance.toFixed(2)} ({result.returnPercent > 0 ? '+' : ''}
            {result.returnPercent}%)
          </span>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-44 overflow-visible">
          {/* Baseline starting balance */}
          <line
            x1={padding}
            y1={height - padding - ((result.initialBalance - minVal) / range) * (height - padding * 2)}
            x2={width - padding}
            y2={height - padding - ((result.initialBalance - minVal) / range) * (height - padding * 2)}
            stroke="#475569"
            strokeDasharray="4,4"
            strokeWidth="1"
          />
          {/* Fill Area */}
          <polygon
            points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`}
            fill={fillColor}
          />
          {/* Curve Line */}
          <polyline fill="none" stroke={strokeColor} strokeWidth="2.5" points={points} />
        </svg>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl p-5 text-slate-100 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold">Historical Tick Replay & Backtester</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Full Stack
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Replays Deriv synthetic tick data through Multi-Agent Committee, Sniper Confluence & Half-Kelly Sizing
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Backtest Configuration Controls */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs">
          <div>
            <label className="block text-[11px] text-slate-400 font-semibold mb-1">Target Symbol</label>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-slate-200 font-mono text-xs"
            >
              <option value="1HZ100V">Volatility 100 (1s)</option>
              <option value="1HZ75V">Volatility 75 (1s)</option>
              <option value="1HZ50V">Volatility 50 (1s)</option>
              <option value="1HZ25V">Volatility 25 (1s)</option>
              <option value="1HZ10V">Volatility 10 (1s)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 font-semibold mb-1">Replay Bars</label>
            <select
              value={sampleSize}
              onChange={(e) => setSampleSize(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-slate-200 font-mono text-xs"
            >
              <option value={150}>150 Bars (~2.5h)</option>
              <option value={250}>250 Bars (~4.2h)</option>
              <option value={500}>500 Bars (~8.3h)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 font-semibold mb-1">Position Sizing</label>
            <select
              value={sizingMode}
              onChange={(e) => setSizingMode(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-slate-200 font-mono text-xs"
            >
              <option value="KELLY_HALF">Half-Kelly Criterion</option>
              <option value="KELLY_QUARTER">Quarter-Kelly (Conservative)</option>
              <option value="FIXED">Fixed $2.00 Stake</option>
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={handleRunBacktest}
              disabled={isRunning}
              className="w-full py-2 px-3 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-slate-950 font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 text-xs shadow-lg shadow-cyan-950/40"
            >
              {isRunning ? (
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>{isRunning ? 'Replaying...' : 'Run Simulation'}</span>
            </button>
          </div>
        </div>

        {/* Key Backtest Performance Metrics */}
        {result && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Win Rate</span>
              <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
                {result.winRate}%
              </div>
              <span className="text-[10px] text-slate-400">
                {result.wins}W / {result.losses}L ({result.totalTrades} trades)
              </span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Net P&L</span>
              <div
                className={`text-lg font-bold font-mono mt-0.5 ${
                  result.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {result.netProfit >= 0 ? '+' : ''}${result.netProfit.toFixed(2)}
              </div>
              <span className="text-[10px] text-slate-400">Return: {result.returnPercent}%</span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Profit Factor</span>
              <div className="text-lg font-bold font-mono text-cyan-400 mt-0.5">
                {result.profitFactor}
              </div>
              <span className="text-[10px] text-slate-400">Target &gt; 1.50</span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Max Drawdown</span>
              <div className="text-lg font-bold font-mono text-amber-400 mt-0.5">
                {result.maxDrawdownPercent}%
              </div>
              <span className="text-[10px] text-slate-400">Circuit Limit: 5.0%</span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 col-span-2 sm:col-span-1">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Sharpe Ratio</span>
              <div className="text-lg font-bold font-mono text-purple-400 mt-0.5">
                {result.sharpeRatio}
              </div>
              <span className="text-[10px] text-slate-400">Risk-Adjusted</span>
            </div>
          </div>
        )}

        {/* Equity Curve Display */}
        {renderEquityCurve()}

        {/* Agent Contribution Leaderboard */}
        {result && (
          <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Award className="w-4 h-4 text-amber-400" />
                <span>Multi-Agent Empirical Committee Attribution</span>
              </div>
              <button
                onClick={handleApplyOptimalWeights}
                className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{appliedFeedback ? '✓ Applied to Live Stack' : 'Apply Optimal Weights'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              {result.agentPerformance.map((ag) => (
                <div
                  key={ag.agentName}
                  className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between font-mono"
                >
                  <div>
                    <div className="font-bold text-slate-200 text-[11px] capitalize">
                      {ag.agentName.replace('_', ' ')}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {ag.wins}W / {ag.losses}L • {ag.votes} Votes
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${ag.winRate >= 50 ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {ag.winRate}%
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {ag.profitGenerated >= 0 ? '+' : ''}${ag.profitGenerated.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
          <button
            onClick={() => {
              if (result && result.trades.length > 0) {
                downloadTradesCSV(result.trades, `backtest_${selectedSymbol}`);
                sound.play('win');
              }
            }}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Simulation Trades (CSV)</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
