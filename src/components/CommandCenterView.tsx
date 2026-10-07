import React, { useState } from 'react';
import {
  LayoutDashboard,
  Cpu,
  BarChart3,
  TrendingUp,
  Activity,
  Layers,
  Shield,
  Download,
  Play,
  RotateCcw,
  Zap,
  Crosshair,
  Sliders,
  DollarSign,
  Award,
} from 'lucide-react';
import {
  MarketRegime,
  TechnicalIndicators,
  TradingAgent,
  DecisionResult,
  TradeRecord,
  CoreRiskMetrics,
} from '../types/trading';
import { SniperConfluenceResult } from '../types/sniper';
import { IndicatorWorkerStats } from '../types/worker';
import { DailyCumulativePnLChart } from './DailyCumulativePnLChart';
import { SymbolPerformanceMatrix } from './SymbolPerformanceMatrix';
import { SpatialProcessingMetricsView } from './SpatialProcessingMetricsView';
import { downloadTradesCSV } from '../features/journal/journalUtils';
import { sound } from '../lib/soundEngine';

interface CommandCenterViewProps {
  symbol: string;
  currentPrice: number;
  regime: MarketRegime;
  indicators: TechnicalIndicators | null;
  agents: TradingAgent[];
  decision: DecisionResult | null;
  sniperSetup: SniperConfluenceResult | null;
  closedTrades: TradeRecord[];
  balance: number;
  currency: string;
  riskMetrics: CoreRiskMetrics;
  botEnabled: boolean;
  workerStats?: IndicatorWorkerStats;
  onToggleBot: () => void;
  onSelectSymbol: (symbol: string) => void;
  onOpenBacktest: () => void;
  onOpenQuickSettings: () => void;
}

export const CommandCenterView: React.FC<CommandCenterViewProps> = ({
  symbol,
  currentPrice,
  regime,
  indicators,
  agents,
  decision,
  sniperSetup,
  closedTrades,
  balance,
  currency,
  riskMetrics,
  botEnabled,
  workerStats,
  onToggleBot,
  onSelectSymbol,
  onOpenBacktest,
  onOpenQuickSettings,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'pnl' | 'symbols' | 'spatial'>('overview');

  const wins = closedTrades.filter((t) => t.result === 'WIN').length;
  const total = closedTrades.length;
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '66.7';
  const netPnL = closedTrades.reduce((acc, t) => acc + t.profit, 0);

  return (
    <div className="space-y-4 animate-in fade-in">
      {/* Top Banner / Hero Stats */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-950 p-4 rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <LayoutDashboard className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-100 font-mono tracking-tight">
                UNIFIED COMMAND CENTER
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                Blackbox Live
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Consolidated real-time operational hub: Blackbox, Spatial Telemetry, Symbol Rotation & Daily PnL
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              onOpenBacktest();
              sound.play('click');
            }}
            className="px-3 py-1.5 bg-purple-600/90 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-purple-950/40"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Replay Backtest</span>
          </button>

          <button
            onClick={() => {
              downloadTradesCSV(closedTrades, symbol);
              sound.play('win');
            }}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => {
              onToggleBot();
              sound.play('toggle');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono flex items-center gap-1.5 transition-all shadow-md ${
              botEnabled
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/50'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
            }`}
          >
            <Play className={`w-3.5 h-3.5 ${botEnabled ? 'fill-white' : ''}`} />
            <span>{botEnabled ? 'Halt Bot' : 'Run Auto-Bot'}</span>
          </button>
        </div>
      </div>

      {/* KPI Tiles Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
          <span className="text-[10px] text-slate-500 uppercase font-semibold font-mono">Spot Asset</span>
          <div className="text-sm font-bold font-mono text-cyan-300 mt-0.5">{symbol}</div>
          <span className="text-[10px] text-slate-400 font-mono">${currentPrice}</span>
        </div>

        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
          <span className="text-[10px] text-slate-500 uppercase font-semibold font-mono">Balance</span>
          <div className="text-sm font-bold font-mono text-slate-100 mt-0.5">
            ${balance.toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-400 font-mono">{currency}</span>
        </div>

        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
          <span className="text-[10px] text-slate-500 uppercase font-semibold font-mono">Net Realized PnL</span>
          <div
            className={`text-sm font-bold font-mono mt-0.5 ${
              netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {netPnL >= 0 ? '+' : ''}${netPnL.toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-400 font-mono">{total} closed orders</span>
        </div>

        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
          <span className="text-[10px] text-slate-500 uppercase font-semibold font-mono">Win Rate</span>
          <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">{winRate}%</div>
          <span className="text-[10px] text-slate-400 font-mono">{wins} wins</span>
        </div>

        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
          <span className="text-[10px] text-slate-500 uppercase font-semibold font-mono">Max Drawdown</span>
          <div className="text-sm font-bold font-mono text-amber-400 mt-0.5">
            {riskMetrics.maxDrawdownPercent.toFixed(1)}%
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Limit 5.0%</span>
        </div>

        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
          <span className="text-[10px] text-slate-500 uppercase font-semibold font-mono">Sniper Confluence</span>
          <div className="text-sm font-bold font-mono text-purple-400 mt-0.5">
            {sniperSetup ? `${sniperSetup.score}%` : 'N/A'}
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {sniperSetup?.isPrimed ? '🎯 LOCKED' : 'Scanning'}
          </span>
        </div>
      </div>

      {/* Sub-Tab Navigation */}
      <div className="flex items-center gap-1 p-1 bg-slate-900/80 rounded-xl border border-slate-800 text-xs font-semibold font-mono">
        <button
          onClick={() => setActiveSubTab('overview')}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeSubTab === 'overview'
              ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Blackbox Arbiter</span>
        </button>

        <button
          onClick={() => setActiveSubTab('pnl')}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeSubTab === 'pnl'
              ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Cumulative PnL Chart</span>
        </button>

        <button
          onClick={() => setActiveSubTab('symbols')}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeSubTab === 'symbols'
              ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Symbol Matrix</span>
        </button>

        <button
          onClick={() => setActiveSubTab('spatial')}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeSubTab === 'spatial'
              ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Spatial Telemetry</span>
        </button>
      </div>

      {/* Sub-Tab Contents */}
      {activeSubTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Decision & Consensus Panel */}
          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-cyan-400" />
                Multi-Agent Directive Synthesis
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  decision?.action.includes('BUY')
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : decision?.action.includes('SELL')
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {decision?.action || 'HOLD'}
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {decision?.reason || 'Monitoring equilibrium. Awaiting >= 3/4 consensus agreement.'}
            </p>

            {/* Voting Distribution */}
            {decision?.consensus && (
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Committee Consensus:</span>
                  <span className={decision.consensus.hasConsensus ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                    {decision.consensus.agreementRatio >= 0.75 ? '3/4 Consensus Secured' : 'Consensus Withheld'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 bg-emerald-950/40 border border-emerald-500/30 rounded-lg text-emerald-300">
                    <span className="text-[10px] block text-emerald-400">BUY</span>
                    <span className="font-bold">{decision.consensus.buyVotes}</span>
                  </div>
                  <div className="p-2 bg-rose-950/40 border border-rose-500/30 rounded-lg text-rose-300">
                    <span className="text-[10px] block text-rose-400">SELL</span>
                    <span className="font-bold">{decision.consensus.sellVotes}</span>
                  </div>
                  <div className="p-2 bg-slate-800/60 border border-slate-700 rounded-lg text-slate-400">
                    <span className="text-[10px] block">HOLD</span>
                    <span className="font-bold">{decision.consensus.holdVotes}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sniper HUD Card */}
          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Crosshair className="w-4 h-4 text-purple-400" />
                Sniper Micro-Confluence Reticle
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  sniperSetup?.isPrimed
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 animate-pulse'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                Score: {sniperSetup?.score ?? 0}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block">Optimal Entry</span>
                <span className="font-bold text-slate-200">
                  ${sniperSetup ? sniperSetup.optimalEntryPrice.toFixed(3) : currentPrice}
                </span>
              </div>
              <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block">Risk/Reward</span>
                <span className="font-bold text-emerald-400">
                  {sniperSetup ? `${sniperSetup.riskRewardRatio}:1` : '2.4:1'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              {sniperSetup?.summaryReason || 'Scanning pullback to fast EMA14 with tailwind regime match.'}
            </p>
          </div>
        </div>
      )}

      {activeSubTab === 'pnl' && (
        <DailyCumulativePnLChart
          closedTrades={closedTrades}
          currency={currency}
          currentBalance={balance}
        />
      )}

      {activeSubTab === 'symbols' && (
        <SymbolPerformanceMatrix
          closedTrades={closedTrades}
          selectedSymbol={symbol}
          onSelectSymbol={onSelectSymbol}
        />
      )}

      {activeSubTab === 'spatial' && (
        <SpatialProcessingMetricsView
          symbol={symbol}
          currentPrice={currentPrice}
          regime={regime}
          indicators={indicators}
          workerStats={workerStats}
          onSelectSymbol={onSelectSymbol}
        />
      )}
    </div>
  );
};
