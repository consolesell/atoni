import React, { useState, useEffect } from 'react';
import {
  Minimize2,
  Maximize2,
  TrendingUp,
  TrendingDown,
  Activity,
  ShieldCheck,
  Zap,
  Mic,
  MicOff,
  Sliders,
  Sparkles,
  BarChart3,
  Cpu,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
} from 'lucide-react';
import {
  Candle,
  TechnicalIndicators,
  TradeRecord,
  MarketRegime,
  CoreRiskMetrics,
  AIPredictionResult,
} from '../types/trading';
import { InteractiveChart } from './InteractiveChart';
import { AICopilotChat } from './AICopilotChat';
import { voiceInput } from '../lib/voiceInputEngine';
import { sound } from '../lib/soundEngine';

interface FullscreenWorkspaceProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  candles: Candle[];
  indicators: TechnicalIndicators | null;
  currentPrice: number;
  openTrades: TradeRecord[];
  closedTrades: TradeRecord[];
  granularity: number;
  onGranularityChange: (g: number) => void;
  onRefresh: () => void;
  regime: MarketRegime;
  botEnabled: boolean;
  totalPnL: number;
  winRate: number;
  coreRiskMetrics: CoreRiskMetrics | null;
  aiPrediction?: AIPredictionResult | null;
  stake: number;
  onStakeChange: (s: number) => void;
  onExecuteTrade?: (direction: 'CALL' | 'PUT') => void;
  isExecuting?: boolean;
  currency?: string;
  balance?: number;
}

export const FullscreenWorkspace: React.FC<FullscreenWorkspaceProps> = ({
  isOpen,
  onClose,
  symbol,
  candles,
  indicators,
  currentPrice,
  openTrades,
  closedTrades,
  granularity,
  onGranularityChange,
  onRefresh,
  regime,
  botEnabled,
  totalPnL,
  winRate,
  coreRiskMetrics,
  aiPrediction,
  stake,
  onStakeChange,
  onExecuteTrade,
  isExecuting = false,
  currency = 'USD',
  balance = 10000,
}) => {
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    const unsubVoice = voiceInput.subscribe((listening) => {
      setIsListening(listening);
    });
    return () => unsubVoice();
  }, []);

  // Keyboard shortcut ESC to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const toggleBrowserFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsBrowserFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsBrowserFullscreen(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-slate-100 flex flex-col overflow-hidden select-none animate-fadeIn">
      {/* Top Chrome-Free Workspace Control Bar */}
      <header className="h-14 bg-slate-950 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 gap-3">
        {/* Left: Branding & Asset Selector */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center font-black text-slate-950 text-sm shadow-md shadow-cyan-500/20">
              SB
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm tracking-wider font-mono text-white">
                  SBAGENT WORKSPACE
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold">
                  FULLSCREEN EXPANSION
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
                <span>{symbol}</span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-300 font-bold font-mono">
                  ${currentPrice.toFixed(candles[0] && candles[0].close < 10 ? 4 : 2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: High-Density Terminal Metrics Bar */}
        <div className="hidden lg:flex items-center gap-4 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800/80 text-[11px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">RSI(14):</span>
            <span
              className={`font-bold ${
                (indicators?.rsiNow ?? 50) > 70
                  ? 'text-rose-400'
                  : (indicators?.rsiNow ?? 50) < 30
                  ? 'text-emerald-400'
                  : 'text-cyan-300'
              }`}
            >
              {indicators?.rsiNow?.toFixed(1) || '--'}
            </span>
          </div>

          <div className="h-3 w-[1px] bg-slate-800" />

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">REGIME:</span>
            <span className="font-bold text-amber-300">
              {regime?.type || 'EQUILIBRIUM'}
            </span>
          </div>

          <div className="h-3 w-[1px] bg-slate-800" />

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">KELLY STAKE:</span>
            <span className="font-bold text-cyan-400">
              ${(coreRiskMetrics?.recommendedKellyStake ?? stake).toFixed(2)}
            </span>
          </div>

          <div className="h-3 w-[1px] bg-slate-800" />

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">P&L:</span>
            <span
              className={`font-bold ${
                totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              ${totalPnL.toFixed(2)}
            </span>
          </div>

          <div className="h-3 w-[1px] bg-slate-800" />

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">WIN RATE:</span>
            <span className="font-bold text-slate-200">{winRate.toFixed(1)}%</span>
          </div>

          <div className="h-3 w-[1px] bg-slate-800" />

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">MAX DD:</span>
            <span className="font-bold text-rose-300">
              {coreRiskMetrics?.maxDrawdownPercent?.toFixed(1) ?? '0.0'}%
            </span>
          </div>
        </div>

        {/* Right: Quick Controls & Fullscreen Minimize */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              sound.play('click');
              voiceInput.toggle();
            }}
            title={isListening ? 'Stop Voice Listening' : 'Hands-free Voice Input'}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition-colors ${
              isListening
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/50 animate-pulse'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-cyan-400 hover:border-cyan-500/40'
            }`}
          >
            {isListening ? <MicOff className="w-3.5 h-3.5 text-rose-400" /> : <Mic className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isListening ? 'Listening...' : 'Voice Command'}</span>
          </button>

          <button
            onClick={toggleBrowserFullscreen}
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-lg transition-colors"
            title="Toggle Native Browser Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              sound.play('click');
              onClose();
            }}
            className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors shadow-sm"
            title="Exit Fullscreen Workspace (Esc)"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span className="font-bold">Exit</span>
          </button>
        </div>
      </header>

      {/* Main Workspace: High-Density Split View */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Section: High-Density Interactive Chart & Quick Execution */}
        <div className="flex-1 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800/80 overflow-hidden relative">
          <div className="flex-1 relative overflow-hidden bg-slate-950">
            <InteractiveChart
              candles={candles}
              indicators={indicators}
              currentPrice={currentPrice}
              openTrades={openTrades}
              closedTrades={closedTrades}
              granularity={granularity}
              onGranularityChange={onGranularityChange}
              onRefresh={onRefresh}
              symbol={symbol}
              aiPrediction={aiPrediction}
              onExecuteTrade={onExecuteTrade}
              stake={stake}
              onStakeChange={onStakeChange}
              isExecuting={isExecuting}
              currency={currency}
            />
          </div>

          {/* Quick Execution Strip */}
          {onExecuteTrade && (
            <div className="h-14 bg-slate-950/90 border-t border-slate-800 px-4 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-400">STAKE:</span>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={stake}
                  onChange={(e) => onStakeChange(Math.max(0.5, Number(e.target.value)))}
                  className="w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white text-center"
                />
                <span className="text-xs font-mono text-slate-500">{currency}</span>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  disabled={isExecuting}
                  onClick={() => onExecuteTrade('CALL')}
                  className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-extrabold text-xs font-mono rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-500/20 disabled:opacity-50 transition-all"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>RISE / CALL</span>
                </button>

                <button
                  disabled={isExecuting}
                  onClick={() => onExecuteTrade('PUT')}
                  className="px-5 py-2 bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 text-white font-extrabold text-xs font-mono rounded-xl flex items-center gap-1.5 shadow-md shadow-rose-500/20 disabled:opacity-50 transition-all"
                >
                  <ArrowDownRight className="w-4 h-4" />
                  <span>FALL / PUT</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Section: Integrated SBAgent Copilot Terminal */}
        <div className="w-full lg:w-[460px] xl:w-[500px] flex flex-col bg-slate-950 shrink-0 overflow-hidden">
          <AICopilotChat
            symbol={symbol}
            currentPrice={currentPrice}
            regime={regime}
            indicators={indicators}
            botEnabled={botEnabled}
            pnl={totalPnL}
            winRate={winRate}
            maxDrawdown={coreRiskMetrics?.maxDrawdownPercent ?? 0}
            profitFactor={coreRiskMetrics?.profitFactor ?? 1.85}
            currentStake={coreRiskMetrics?.recommendedKellyStake ?? stake}
            balance={balance}
          />
        </div>
      </div>
    </div>
  );
};
