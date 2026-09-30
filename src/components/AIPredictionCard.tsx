import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  PauseCircle,
  ShieldAlert,
  Target,
  Clock,
  RefreshCw,
  Zap,
  Volume2,
  Square,
  Radio,
} from 'lucide-react';
import { AIPredictionResult } from '../types/trading';
import { voice } from '../lib/voiceEngine';
import { sound } from '../lib/soundEngine';
import { VoiceWaveform } from './VoiceWaveformIndicator';

interface AIPredictionCardProps {
  prediction: AIPredictionResult | null;
  isLoading: boolean;
  onRefresh: () => void;
  symbol: string;
}

export const AIPredictionCard: React.FC<AIPredictionCardProps> = ({
  prediction,
  isLoading,
  onRefresh,
  symbol,
}) => {
  const [isSpeaking, setIsSpeaking] = useState<boolean>(voice.getIsSpeaking());

  useEffect(() => {
    const unsub = voice.subscribeSpeaking((speaking) => {
      setIsSpeaking(speaking);
    });
    return () => unsub();
  }, []);

  const handleToggleVoiceBriefing = () => {
    sound.play('click');
    if (isSpeaking) {
      voice.stop();
    } else {
      voice.speakMarketBriefing({
        symbol,
        regime: prediction?.regime_verdict || 'Equilibrium State',
        winProb: prediction?.ai_predicted_win_probability ?? 0.65,
        recommendation: prediction?.recommendation ?? 'BUY',
        catalyst: prediction?.primary_catalyst,
        reason: prediction?.reason,
      });
    }
  };

  const isBuy = prediction?.recommendation === 'BUY';
  const isSell = prediction?.recommendation === 'SELL';
  const isHold = prediction?.recommendation === 'HOLD' || !prediction;

  const winProb = prediction?.ai_predicted_win_probability ?? 0.5;
  const winProbPercent = Math.round(winProb * 100);

  const getStatusTheme = () => {
    if (isBuy) {
      return {
        border: 'border-emerald-500/40',
        bg: 'from-emerald-950/40 to-slate-900/90',
        badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        text: 'text-emerald-400',
        bar: 'from-emerald-500 to-teal-400',
        icon: <TrendingUp className="w-5 h-5 text-emerald-400" />,
        label: 'RISE (BUY) FORECAST',
      };
    }
    if (isSell) {
      return {
        border: 'border-rose-500/40',
        bg: 'from-rose-950/40 to-slate-900/90',
        badge: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
        text: 'text-rose-400',
        bar: 'from-rose-500 to-pink-500',
        icon: <TrendingDown className="w-5 h-5 text-rose-400" />,
        label: 'FALL (SELL) FORECAST',
      };
    }
    return {
      border: 'border-amber-500/30',
      bg: 'from-amber-950/20 to-slate-900/90',
      badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
      text: 'text-amber-300',
      bar: 'from-amber-500 to-yellow-400',
      icon: <PauseCircle className="w-5 h-5 text-amber-400" />,
      label: 'HOLD / CONSOLIDATION',
    };
  };

  const theme = getStatusTheme();

  return (
    <div
      className={`flex flex-col gap-4 p-5 bg-gradient-to-br ${theme.bg} border ${theme.border} rounded-xl shadow-xl backdrop-blur-md transition-all duration-300`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-sm">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold font-mono tracking-wider text-slate-300">
              SBAGENT AI MARKET INTELLIGENCE
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">
              Live quantitative forecast for {symbol}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleToggleVoiceBriefing}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono transition-all border ${
              isSpeaking
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 shadow-md shadow-cyan-500/30'
                : 'bg-slate-950/60 hover:bg-slate-800 text-slate-300 border-slate-700'
            }`}
            title={isSpeaking ? 'Stop Voice Briefing' : 'Listen to AI Voice Briefing'}
          >
            {isSpeaking ? (
              <>
                <Square className="w-3 h-3 fill-current text-cyan-300 shrink-0" />
                <VoiceWaveform barCount={4} height="xs" color="cyan" active={true} />
                <span className="text-cyan-300 font-semibold tracking-wider text-[11px]">TALKING</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3 h-3 text-cyan-400" />
                <span>Hear Brief</span>
              </>
            )}
          </button>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/60 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-mono transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{isLoading ? 'Scanning...' : 'Re-Scan'}</span>
          </button>
        </div>
      </div>

      {/* Main Signal Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-950/80 border border-slate-800/80 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">{theme.icon}</div>
          <div>
            <div className={`text-base sm:text-lg font-black font-mono tracking-tight ${theme.text}`}>
              {theme.label}
            </div>
            <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
              <span>Duration: <strong className="text-slate-200">{prediction?.suggested_duration || 15}m</strong></span>
              <span>•</span>
              <span>Confidence: <strong className="text-slate-200">{prediction?.confidence_score ?? 60}%</strong></span>
            </div>
          </div>
        </div>

        {/* Win Probability Meter */}
        <div className="flex flex-col items-end gap-1 min-w-[140px]">
          <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400 flex items-center gap-1">
            <Target className="w-3 h-3 text-cyan-400" />
            Win Probability
          </div>
          <div className="flex items-center gap-2 w-full justify-end">
            <span className="font-mono text-base font-black text-slate-100">{winProbPercent}%</span>
            <div className="w-20 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${theme.bar} rounded-full transition-all duration-500`}
                style={{ width: `${winProbPercent}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Catalyst & Regime Verdict */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
        <div className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-lg">
          <div className="text-[10px] uppercase text-slate-400 flex items-center gap-1 mb-0.5">
            <Zap className="w-3 h-3 text-amber-400" /> Primary Catalyst
          </div>
          <div className="text-slate-200 font-semibold truncate">
            {prediction?.primary_catalyst || 'Dynamic Momentum Convergence'}
          </div>
        </div>

        <div className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-lg">
          <div className="text-[10px] uppercase text-slate-400 flex items-center gap-1 mb-0.5">
            <Clock className="w-3 h-3 text-cyan-400" /> Regime Verdict
          </div>
          <div className="text-slate-200 font-semibold truncate">
            {prediction?.regime_verdict || 'Trend Expansion Phase'}
          </div>
        </div>
      </div>

      {/* Tactical Reason */}
      <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl text-xs font-sans">
        <div className="text-[10px] uppercase font-mono tracking-wider text-cyan-400 font-bold mb-1">
          Tactical Analysis & Execution Rationale
        </div>
        <p className="text-slate-300 leading-relaxed">
          {prediction?.reason ||
            'Analyzing multi-timeframe moving averages, Bollinger band position, and candlestick geometry. Stand by for live forecast update.'}
        </p>
      </div>

      {/* Risk Factors List */}
      {prediction?.risk_factors && prediction.risk_factors.length > 0 && (
        <div className="flex flex-col gap-1.5 text-xs">
          <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3 text-rose-400" /> Risk Watchlist
          </div>
          <div className="flex flex-wrap gap-1.5">
            {prediction.risk_factors.map((risk, i) => (
              <span
                key={i}
                className="px-2 py-0.5 bg-slate-950/70 text-slate-300 border border-slate-800 rounded-md text-[11px] font-mono"
              >
                ⚠️ {risk}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
