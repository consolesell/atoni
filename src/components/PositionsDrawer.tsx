import React, { useState } from 'react';
import { TradeRecord } from '../types/trading';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { sound } from '../lib/soundEngine';

interface PositionsDrawerProps {
  openTrades: TradeRecord[];
  closedTrades: TradeRecord[];
  currentPrice: number;
  onEarlyExit: (tradeId: string) => void;
  onOpenCritiqueModal: (trade: TradeRecord) => void;
  decimals?: number;
}

export const PositionsDrawer: React.FC<PositionsDrawerProps> = ({
  openTrades,
  closedTrades,
  currentPrice,
  onEarlyExit,
  onOpenCritiqueModal,
  decimals = 3,
}) => {
  const [activeTab, setActiveTab] = useState<'open' | 'history'>('open');
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);

  // Stats calculation
  const wins = closedTrades.filter((t) => t.result === 'WIN').length;
  const total = closedTrades.length;
  const winRate = total > 0 ? (wins / total) * 100 : 0;
  const netPnL = closedTrades.reduce((sum, t) => sum + (t.profit || 0), 0);

  const toggleExpand = (id: string) => {
    setExpandedTradeId((prev) => (prev === id ? null : id));
    sound.play('click');
  };

  return (
    <div className="flex flex-col gap-3 p-3.5 sm:p-5 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl backdrop-blur-md">
      {/* Header with Segmented Active / Settled Tab */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => {
              setActiveTab('open');
              sound.play('click');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'open'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>ACTIVE</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'open' ? 'bg-slate-900 text-cyan-400' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {openTrades.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('history');
              sound.play('click');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>HISTORY</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'history' ? 'bg-slate-900 text-cyan-400' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {closedTrades.length}
            </span>
          </button>
        </div>

        {/* History Quick Stats */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Win Rate:</span>
            <span className={`font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-slate-300'}`}>
              {winRate.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Net P&L:</span>
            <span
              className={`font-black ${
                netPnL > 0 ? 'text-emerald-400' : netPnL < 0 ? 'text-rose-400' : 'text-slate-300'
              }`}
            >
              {netPnL >= 0 ? `+$${netPnL.toFixed(2)}` : `-$${Math.abs(netPnL).toFixed(2)}`}
            </span>
          </div>
        </div>
      </div>

      {/* Tab 1: Active Open Positions */}
      {activeTab === 'open' && (
        <div className="flex flex-col gap-2">
          {openTrades.length === 0 ? (
            <div className="p-6 text-center text-xs font-mono text-slate-500 italic bg-slate-950/40 rounded-xl border border-slate-800/60">
              No active open positions. Execute a Rise/Fall contract or enable Auto-Bot.
            </div>
          ) : (
            openTrades.map((trade, i) => {
              const tradeId = trade.id || `open_${i}`;
              const isCall = trade.decision.includes('BUY') || trade.decision.includes('CALL');
              const inProfit = isCall
                ? currentPrice > trade.entryPrice
                : currentPrice < trade.entryPrice;
              const estimatedReturn = inProfit ? trade.amount * 0.95 : -trade.amount;
              const isExpanded = expandedTradeId === tradeId;

              return (
                <div
                  key={tradeId}
                  className="bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden transition-all"
                >
                  <div
                    onClick={() => toggleExpand(tradeId)}
                    className="p-3 flex items-center justify-between gap-2.5 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`p-1.5 rounded-lg border ${
                          isCall
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        }`}
                      >
                        {isCall ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs text-slate-100 font-mono">
                            {trade.symbol}
                          </span>
                          <span
                            className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                              isCall
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            {isCall ? '↑ RISE' : '↓ FALL'} (${trade.amount})
                          </span>
                          {trade.trailingStopEnabled && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border bg-amber-500/15 text-amber-300 border-amber-500/35 flex items-center gap-1">
                              <ShieldCheck className="w-2.5 h-2.5 text-amber-400" />
                              <span>TSL: {trade.currentTrailingStopPrice?.toFixed(decimals)}</span>
                              {trade.lockedInProfit && trade.lockedInProfit > 0 ? (
                                <span className="text-emerald-300 font-black">
                                  (+${trade.lockedInProfit.toFixed(2)})
                                </span>
                              ) : null}
                            </span>
                          )}
                          {trade.profitLockTriggered && trade.profitLockSecuredAmount && trade.profitLockSecuredAmount > 0 && (
                            <span className="text-[9px] font-mono font-black px-1.5 py-0.2 rounded border bg-emerald-500/20 text-emerald-300 border-emerald-500/50 flex items-center gap-1 animate-pulse">
                              <span>🔒 LOCKED: +${trade.profitLockSecuredAmount.toFixed(2)}</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                          <span>Entry: {trade.entryPrice.toFixed(decimals)}</span>
                          <span>•</span>
                          <span>Now: {currentPrice.toFixed(decimals)}</span>
                          {trade.trailingStopEnabled && trade.currentTrailingStopPrice && (
                            <>
                              <span>•</span>
                              <span className="text-amber-400/90 font-medium">
                                Offset: {Math.abs(currentPrice - trade.currentTrailingStopPrice).toFixed(decimals)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right font-mono">
                        <div
                          className={`text-xs font-black ${
                            inProfit ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {inProfit
                            ? `+$${estimatedReturn.toFixed(2)}`
                            : `-$${trade.amount.toFixed(2)}`}
                        </div>
                        <div className="text-[9px] text-slate-500 font-semibold">
                          {inProfit ? 'IN PROFIT' : 'OUT OF MONEY'}
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Row */}
                  {isExpanded && (
                    <div className="px-3.5 py-2.5 bg-slate-900/90 border-t border-slate-800/80 flex flex-col gap-2 text-xs font-mono">
                      <div className="flex flex-wrap items-center justify-between gap-3 text-slate-400 text-[11px]">
                        <div className="flex flex-wrap items-center gap-3">
                          <span>Duration: {trade.duration}{trade.durationUnit === 'ticks' ? 't' : trade.durationUnit === 'seconds' ? 's' : 'm'}</span>
                          <span>Mode: {trade.mode}</span>
                          <span>Time: {new Date(trade.timestamp).toLocaleTimeString()}</span>
                        </div>

                        <button
                          onClick={() => onEarlyExit(trade.id)}
                          className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-lg text-xs font-mono transition-colors"
                        >
                          Early Close
                        </button>
                      </div>

                      {/* Trailing Stop Deep Breakdown */}
                      {trade.trailingStopEnabled && (
                        <div className="pt-2 border-t border-slate-800/60 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] bg-slate-950/60 p-2 rounded-lg border border-amber-500/20">
                          <div>
                            <span className="text-slate-500 block">Initial Stop:</span>
                            <span className="text-slate-300 font-bold">{trade.initialStopPrice?.toFixed(decimals) || '--'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Trailing Stop:</span>
                            <span className="text-amber-400 font-bold">{trade.currentTrailingStopPrice?.toFixed(decimals) || '--'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Peak Price:</span>
                            <span className="text-cyan-300 font-bold">
                              {(isCall ? trade.highestFavorablePrice : trade.lowestFavorablePrice)?.toFixed(decimals) || trade.entryPrice.toFixed(decimals)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Locked Profit:</span>
                            <span className={`font-black ${trade.lockedInProfit && trade.lockedInProfit > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                              {trade.lockedInProfit && trade.lockedInProfit > 0 ? `+$${trade.lockedInProfit.toFixed(2)}` : '$0.00'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Settled Trades History */}
      {activeTab === 'history' && (
        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
          {closedTrades.length === 0 ? (
            <div className="p-6 text-center text-xs font-mono text-slate-500 italic bg-slate-950/40 rounded-xl border border-slate-800/60">
              No historical trades settled yet.
            </div>
          ) : (
            closedTrades.map((trade, i) => {
              const tradeId = trade.id || `closed_${i}`;
              const isWin = trade.result === 'WIN';
              const isCall = trade.decision.includes('BUY') || trade.decision.includes('CALL');
              const isExpanded = expandedTradeId === tradeId;

              return (
                <div
                  key={tradeId}
                  className="bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 rounded-xl overflow-hidden transition-all text-xs font-mono"
                >
                  <div
                    onClick={() => toggleExpand(tradeId)}
                    className="p-3 flex items-center justify-between gap-2.5 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`p-1.5 rounded-lg ${
                          isWin ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {isWin ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-200">{trade.symbol}</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded border ${
                              isCall
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            }`}
                          >
                            {isCall ? '↑ RISE' : '↓ FALL'}
                          </span>
                          {trade.trailingStopEnabled && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded border bg-amber-500/10 text-amber-300 border-amber-500/30 flex items-center gap-1">
                              <ShieldCheck className="w-2.5 h-2.5 text-amber-400" />
                              <span>TSL Exit</span>
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500">
                            {new Date(trade.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Entry: {trade.entryPrice?.toFixed(decimals)} → Exit: {trade.exitPrice?.toFixed(decimals) || '--'}
                          {trade.exitReason && (
                            <span className="text-slate-500 ml-1.5 italic">({trade.exitReason})</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div
                          className={`font-black ${
                            trade.profit > 0
                              ? 'text-emerald-400'
                              : trade.profit < 0
                              ? 'text-rose-400'
                              : 'text-slate-300'
                          }`}
                        >
                          {trade.profit >= 0
                            ? `+$${trade.profit.toFixed(2)}`
                            : `-$${Math.abs(trade.profit).toFixed(2)}`}
                        </div>
                        <div className="text-[9px] text-slate-500 font-bold">{trade.result}</div>
                      </div>

                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Details & AI Post-Mortem Critique Trigger */}
                  {isExpanded && (
                    <div className="px-3.5 py-2.5 bg-slate-900/90 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5">
                      <div className="text-[11px] text-slate-400 space-y-0.5">
                        <div>Stake: ${trade.amount} | Duration: {trade.duration}m</div>
                        <div>Contract Mode: {trade.mode}</div>
                      </div>

                      <button
                        onClick={() => onOpenCritiqueModal(trade)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg text-xs font-mono font-semibold transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                        <span>AI Critique</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
