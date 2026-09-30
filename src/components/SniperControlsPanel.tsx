import React, { useState, useEffect } from 'react';
import {
  Crosshair,
  Zap,
  Target,
  Clock,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Flame,
  Radio,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Volume2,
  Square,
} from 'lucide-react';
import { EnhancedTradeDuration, SniperConfluenceResult, TradeDurationUnit } from '../types/sniper';
import { PRESET_DURATIONS } from '../lib/sniperEngine';
import { sound } from '../lib/soundEngine';
import { voice } from '../lib/voiceEngine';
import { VoiceWaveform } from './VoiceWaveformIndicator';

interface SniperControlsPanelProps {
  sniperSetup: SniperConfluenceResult;
  currentPrice: number;
  duration: number;
  durationUnit: TradeDurationUnit;
  onDurationChange: (value: number, unit: TradeDurationUnit) => void;
  stake: number;
  currency?: string;
  onExecuteSniper: (direction: 'CALL' | 'PUT', stake: number, duration: number, unit: TradeDurationUnit) => void;
  isExecuting: boolean;
  isSniperTriggerArmed: boolean;
  onToggleSniperTrigger: () => void;
}

export const SniperControlsPanel: React.FC<SniperControlsPanelProps> = ({
  sniperSetup,
  currentPrice,
  duration,
  durationUnit,
  onDurationChange,
  stake,
  currency = 'USD',
  onExecuteSniper,
  isExecuting,
  isSniperTriggerArmed,
  onToggleSniperTrigger,
}) => {
  const [showFactors, setShowFactors] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<TradeDurationUnit>(durationUnit);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(voice.getIsSpeaking());

  useEffect(() => {
    const unsub = voice.subscribeSpeaking((speaking) => {
      setIsSpeaking(speaking);
    });
    return () => unsub();
  }, []);

  const filteredPresets = PRESET_DURATIONS.filter((d) => d.unit === selectedUnit);
  const isCall = sniperSetup.direction === 'CALL';
  const isPut = sniperSetup.direction === 'PUT';

  const handleSniperAudioBrief = () => {
    sound.play('click');
    if (isSpeaking) {
      voice.stop();
    } else {
      voice.speakSniperCall({
        symbol: 'Selected Asset',
        direction: sniperSetup.direction,
        score: sniperSetup.score,
        optimalEntry: sniperSetup.optimalEntryPrice,
        takeProfit: sniperSetup.takeProfitPrice,
        stopLoss: sniperSetup.stopLossPrice,
        durationLabel: `${sniperSetup.recommendedDuration.value} ${sniperSetup.recommendedDuration.unit}`,
      });
    }
  };

  const handleUnitTab = (unit: TradeDurationUnit) => {
    setSelectedUnit(unit);
    const firstInUnit = PRESET_DURATIONS.find((d) => d.unit === unit);
    if (firstInUnit) {
      onDurationChange(firstInUnit.value, firstInUnit.unit);
    }
    sound.play('click');
  };

  const handleApplyAdaptiveDuration = () => {
    const rec = sniperSetup.recommendedDuration;
    setSelectedUnit(rec.unit);
    onDurationChange(rec.value, rec.unit);
    sound.play('toggle');
  };

  const handleFireSniper = () => {
    if (sniperSetup.direction === 'NEUTRAL') return;
    sound.play('trade');
    onExecuteSniper(sniperSetup.direction, stake, duration, durationUnit);
  };

  // Color classes according to score
  const scoreBadgeBg =
    sniperSetup.score >= 80
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
      : sniperSetup.score >= 65
      ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
      : 'bg-amber-500/20 text-amber-400 border-amber-500/40';

  return (
    <div className="flex flex-col gap-3.5 p-4 sm:p-5 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/95 border border-cyan-500/30 rounded-2xl shadow-2xl backdrop-blur-md relative overflow-hidden">
      {/* Background ambient radar glow when primed */}
      {sniperSetup.isPrimed && (
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
      )}

      {/* Header: Title & Confluence Readiness Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 shadow-sm">
            <Crosshair className="w-4 h-4 animate-spin" style={{ animationDuration: '14s' }} />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold font-mono tracking-wider text-slate-100 flex items-center gap-1.5">
              <span>SNIPER ENTRY & EXIT ENGINE</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/80 font-bold">
                PRO
              </span>
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">Sub-tick precision & multi-vector confluence</p>
          </div>
        </div>

        {/* Actions: Audio Brief & Readiness Meter */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSniperAudioBrief}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono transition-all ${
              isSpeaking
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 shadow-md shadow-cyan-500/30'
                : 'bg-slate-900 hover:bg-slate-850 text-slate-300 border-slate-700'
            }`}
            title={isSpeaking ? 'Stop Sniper Briefing' : 'Listen to Tactical Sniper Briefing'}
          >
            {isSpeaking ? (
              <>
                <Square className="w-3 h-3 fill-current text-cyan-300 shrink-0" />
                <VoiceWaveform barCount={4} height="xs" color="cyan" active={true} />
                <span className="text-cyan-300 font-semibold text-[11px] tracking-wider">TALKING</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3 h-3 text-cyan-400" />
                <span className="hidden sm:inline">Hear Call</span>
              </>
            )}
          </button>

          {/* Readiness Meter */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono font-bold ${scoreBadgeBg}`}>
            <Target className="w-3.5 h-3.5" />
            <span>{sniperSetup.score}% {sniperSetup.readinessLevel.replace(/_/g, ' ')}</span>
          </div>
        </div>
      </div>

      {/* Main Confluence Radar Bar */}
      <div className="flex flex-col gap-1.5 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-400 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            Confluence Lock-On:
          </span>
          <span className="text-slate-200 font-bold">
            {sniperSetup.direction === 'CALL' ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> BUY / CALL CONFLUENCE
              </span>
            ) : sniperSetup.direction === 'PUT' ? (
              <span className="text-rose-400 flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5" /> SELL / PUT CONFLUENCE
              </span>
            ) : (
              <span className="text-slate-400">NEUTRAL MONITORING</span>
            )}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-800/80 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              sniperSetup.score >= 75
                ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 shadow-md shadow-emerald-500/50'
                : sniperSetup.score >= 60
                ? 'bg-gradient-to-r from-cyan-500 to-sky-400'
                : 'bg-gradient-to-r from-slate-600 to-amber-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(5, sniperSetup.score))}%` }}
          />
        </div>

        <p className="text-[11px] font-mono text-slate-300 mt-0.5 leading-relaxed">
          {sniperSetup.summaryReason}
        </p>
      </div>

      {/* Target Metrics: Optimal Entry, Take-Profit, Stop-Loss & R:R */}
      <div className="grid grid-cols-3 gap-2 text-xs font-mono">
        {/* Optimal Entry */}
        <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-400">OPTIMAL ENTRY</span>
          <span className="text-sm font-bold text-cyan-300 font-mono">
            ${sniperSetup.optimalEntryPrice.toFixed(2)}
          </span>
          <span className="text-[10px] text-slate-400 truncate">
            Δ {sniperSetup.distanceToOptimal >= 0.01 ? `${sniperSetup.distanceToOptimal.toFixed(2)} pts` : 'At Spot'}
          </span>
        </div>

        {/* Take-Profit Target */}
        <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex flex-col gap-0.5">
          <span className="text-[10px] text-emerald-400 font-bold">TAKE PROFIT (TP)</span>
          <span className="text-sm font-bold text-emerald-300 font-mono">
            ${sniperSetup.takeProfitPrice.toFixed(2)}
          </span>
          <span className="text-[10px] text-emerald-400/80">
            +{(sniperSetup.riskRewardRatio * 1.5).toFixed(1)}x ATR
          </span>
        </div>

        {/* Stop-Loss / Risk-Reward */}
        <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-500/30 flex flex-col gap-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-rose-400 font-bold">STOP (SL)</span>
            <span className="text-[9px] px-1 rounded bg-slate-800 text-amber-300 font-bold">
              {sniperSetup.riskRewardRatio}:1 R:R
            </span>
          </div>
          <span className="text-sm font-bold text-rose-300 font-mono">
            ${sniperSetup.stopLossPrice.toFixed(2)}
          </span>
          <span className="text-[10px] text-rose-400/80">
            Invalidation floor
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* TRADE DURATION ENHANCEMENT: TICKS / SECONDS / MINUTES + ADAPTIVE    */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-2 p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-300 font-bold flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            Trade Duration Engine
          </span>

          {/* Adaptive AI Recommendation Quick Button */}
          <button
            type="button"
            onClick={handleApplyAdaptiveDuration}
            className="flex items-center gap-1 text-[10px] text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 px-2 py-0.5 rounded-full border border-cyan-500/30 transition-all font-bold active:scale-95"
            title={sniperSetup.recommendedDuration.rationale}
          >
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>Opt: {sniperSetup.recommendedDuration.label}</span>
          </button>
        </div>

        {/* Unit Selector Tabs: Ticks | Seconds | Minutes */}
        <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs font-mono">
          <button
            type="button"
            onClick={() => handleUnitTab('ticks')}
            className={`py-1 rounded text-center font-bold transition-all ${
              selectedUnit === 'ticks'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Ticks (Sniper Scalp)
          </button>
          <button
            type="button"
            onClick={() => handleUnitTab('seconds')}
            className={`py-1 rounded text-center font-bold transition-all ${
              selectedUnit === 'seconds'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Seconds (Impulse)
          </button>
          <button
            type="button"
            onClick={() => handleUnitTab('minutes')}
            className={`py-1 rounded text-center font-bold transition-all ${
              selectedUnit === 'minutes'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Minutes (Trend)
          </button>
        </div>

        {/* Duration Value Pills */}
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
          {filteredPresets.map((preset) => {
            const isSelected = duration === preset.value && durationUnit === preset.unit;
            const isAdaptive =
              sniperSetup.recommendedDuration.value === preset.value &&
              sniperSetup.recommendedDuration.unit === preset.unit;

            return (
              <button
                key={`${preset.unit}-${preset.value}`}
                type="button"
                onClick={() => {
                  onDurationChange(preset.value, preset.unit);
                  sound.play('click');
                }}
                className={`py-1.5 px-2 rounded-xl text-xs font-mono font-bold transition-all relative ${
                  isSelected
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                    : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                }`}
                title={preset.rationale}
              >
                <span>{preset.label}</span>
                {isAdaptive && !isSelected && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Confluence Vector Checklist Toggle */}
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setShowFactors(!showFactors)}
          className="flex items-center justify-between text-xs font-mono text-slate-400 hover:text-slate-200 py-1"
        >
          <span className="flex items-center gap-1 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            View 6-Vector Confluence Breakdown ({sniperSetup.factors.filter((f) => f.isMet).length}/6 Met)
          </span>
          {showFactors ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showFactors && (
          <div className="flex flex-col gap-1.5 bg-slate-950/90 p-2.5 rounded-xl border border-slate-800/80 text-[11px] font-mono">
            {sniperSetup.factors.map((factor) => (
              <div key={factor.id} className="flex items-start justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-900/60">
                <div className="flex items-start gap-1.5">
                  {factor.isMet ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className={`font-bold ${factor.isMet ? 'text-slate-200' : 'text-slate-400'}`}>
                      {factor.name}
                    </span>
                    <p className="text-[10px] text-slate-400">{factor.detail}</p>
                  </div>
                </div>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                    factor.isMet ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {factor.verdict}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Execution Actions: Sniper Direct Fire & Arm Auto-Trigger */}
      <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
        {/* Direct Sniper Order Execution */}
        <button
          type="button"
          disabled={isExecuting || sniperSetup.direction === 'NEUTRAL'}
          onClick={handleFireSniper}
          className={`flex-1 w-full py-3 px-4 rounded-xl font-mono font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-xl ${
            sniperSetup.direction === 'CALL'
              ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/25 active:scale-95'
              : sniperSetup.direction === 'PUT'
              ? 'bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 hover:from-rose-400 hover:to-pink-400 text-white shadow-rose-500/25 active:scale-95'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          } ${isExecuting ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Zap className="w-4 h-4" />
          <span>
            FIRE SNIPER {sniperSetup.direction === 'CALL' ? 'CALL' : sniperSetup.direction === 'PUT' ? 'PUT' : 'ORDER'}{' '}
            (${stake} • {duration}{durationUnit === 'ticks' ? 'T' : durationUnit === 'seconds' ? 's' : 'm'})
          </span>
        </button>

        {/* Arm Auto-Trigger Switch */}
        <button
          type="button"
          onClick={() => {
            onToggleSniperTrigger();
            sound.play('toggle');
          }}
          className={`w-full sm:w-auto py-3 px-3.5 rounded-xl font-mono text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
            isSniperTriggerArmed
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-md shadow-cyan-500/20 animate-pulse'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
          }`}
          title={sniperSetup.triggerCondition}
        >
          <Radio className={`w-3.5 h-3.5 ${isSniperTriggerArmed ? 'text-cyan-400 animate-ping' : 'text-slate-400'}`} />
          <span>{isSniperTriggerArmed ? 'TRIGGER ARMED' : 'ARM AUTO-TRIGGER'}</span>
        </button>
      </div>
    </div>
  );
};
