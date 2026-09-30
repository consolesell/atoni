import React, { useState, useEffect } from 'react';
import { X, Sparkles, CheckCircle2, XCircle, Trophy, Star, ArrowRight, ShieldAlert } from 'lucide-react';
import { AICritiqueResult, TradeRecord } from '../types/trading';

interface TradeCritiqueModalProps {
  trade: TradeRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

export const TradeCritiqueModal: React.FC<TradeCritiqueModalProps> = ({ trade, isOpen, onClose }) => {
  const [critique, setCritique] = useState<AICritiqueResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && trade) {
      if (trade.aiCritique) {
        setCritique(trade.aiCritique);
      } else {
        fetchCritique(trade);
      }
    } else {
      setCritique(null);
    }
  }, [isOpen, trade]);

  const fetchCritique = async (targetTrade: TradeRecord) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/ai/trade-critique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trade: targetTrade }),
      });
      const data = await res.json();
      if (data.success) {
        setCritique(data);
      }
    } catch (err) {
      console.error('Failed to fetch AI critique:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !trade) return null;

  const isWin = trade.result === 'WIN';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/80 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100 font-sans">
                sbagent Post-Mortem Debrief
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {trade.symbol} • {trade.decision} • {trade.result} (${trade.profit >= 0 ? `+${trade.profit.toFixed(2)}` : trade.profit.toFixed(2)})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex flex-col gap-4 font-sans text-xs scrollbar-thin scrollbar-thumb-slate-800">
          {/* Summary Box */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between gap-4 font-mono">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-xl ${
                  isWin ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                }`}
              >
                {isWin ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
              </div>
              <div>
                <div className="text-sm font-bold text-slate-100">
                  {trade.symbol} ({trade.duration}m Contract)
                </div>
                <div className="text-slate-400 text-[11px]">
                  Entry: {trade.entryPrice?.toFixed(3)} → Exit: {trade.exitPrice?.toFixed(3) || 'Expired'}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div
                className={`text-lg font-black ${
                  trade.profit > 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {trade.profit >= 0 ? `+$${trade.profit.toFixed(2)}` : `-$${Math.abs(trade.profit).toFixed(2)}`}
              </div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">{trade.result}</div>
            </div>
          </div>

          {isLoading && (
            <div className="p-10 flex flex-col items-center justify-center gap-3 text-center text-slate-400 font-mono">
              <Sparkles className="w-8 h-8 text-cyan-400 animate-spin" />
              <span>sbagent is synthesizing post-trade execution metrics...</span>
            </div>
          )}

          {critique && !isLoading && (
            <div className="flex flex-col gap-3.5">
              {/* Execution Rating Badge */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
                <span className="font-mono text-slate-300 font-bold flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  AI Execution Quality Rating:
                </span>
                <span className="font-mono font-black text-sm px-3 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  {critique.execution_rating} / 10
                </span>
              </div>

              {/* Trade Summary */}
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col gap-1.5">
                <span className="text-cyan-400 font-mono font-bold uppercase tracking-wider text-[10px]">
                  Execution Synthesis
                </span>
                <p className="text-slate-300 leading-relaxed">{critique.trade_summary}</p>
              </div>

              {/* Key What Went Right / Wrong */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {critique.what_went_right && (
                  <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl flex flex-col gap-1">
                    <span className="text-emerald-400 font-mono font-bold text-[10px] uppercase">
                      ✓ Positive Drivers
                    </span>
                    <p className="text-slate-300 leading-normal text-[11px]">{critique.what_went_right}</p>
                  </div>
                )}
                {critique.what_went_wrong && (
                  <div className="p-3 bg-rose-950/30 border border-rose-500/30 rounded-xl flex flex-col gap-1">
                    <span className="text-rose-400 font-mono font-bold text-[10px] uppercase">
                      ⚠ Friction / Risk Pitfalls
                    </span>
                    <p className="text-slate-300 leading-normal text-[11px]">{critique.what_went_wrong}</p>
                  </div>
                )}
              </div>

              {/* Strategic Takeaway */}
              <div className="p-4 bg-gradient-to-br from-cyan-950/30 to-slate-950 border border-cyan-500/40 rounded-xl flex flex-col gap-1.5">
                <span className="text-cyan-300 font-mono font-bold uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5" />
                  Key Strategic Takeaway
                </span>
                <p className="text-slate-200 font-medium leading-relaxed">{critique.strategic_takeaway}</p>
                <div className="mt-1 pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                  <strong className="text-slate-300">Next Action:</strong> {critique.next_setup_advice}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-mono transition-colors"
          >
            Close Debrief
          </button>
        </div>
      </div>
    </div>
  );
};
