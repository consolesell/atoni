import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  Zap,
  Sparkles,
  ShieldCheck,
  Percent,
  Calculator,
  Crosshair,
  Sliders,
} from 'lucide-react';
import { AIPredictionResult, DecisionResult, PositionSizingMode, CoreRiskMetrics, TrailingStopConfig } from '../types/trading';
import { TradeDurationUnit, SniperConfluenceResult } from '../types/sniper';
import { PRESET_DURATIONS } from '../lib/sniperEngine';
import { TRAILING_STOP_PRESETS, DEFAULT_TRAILING_STOP_CONFIG } from '../lib/trailingStopEngine';
import { sound } from '../lib/soundEngine';
import { SniperControlsPanel } from './SniperControlsPanel';

interface TradeControlsProps {
  stake: number;
  onStakeChange: (stake: number) => void;
  duration: number;
  durationUnit?: TradeDurationUnit;
  onDurationChange: (duration: number, unit?: TradeDurationUnit) => void;
  direction: 'CALL' | 'PUT';
  onDirectionChange: (dir: 'CALL' | 'PUT') => void;
  onExecuteTrade: (customTSL?: TrailingStopConfig) => void;
  isExecuting: boolean;
  aiPrediction: AIPredictionResult | null;
  algorithmicDecision: DecisionResult | null;
  currency?: string;
  isLiveMode?: boolean;
  sizingMode?: PositionSizingMode;
  onSizingModeChange?: (mode: PositionSizingMode) => void;
  riskMetrics?: CoreRiskMetrics | null;
  recommendedKellyStake?: number;
  sniperSetup?: SniperConfluenceResult | null;
  currentPrice?: number;
  onExecuteSniperTrade?: (direction: 'CALL' | 'PUT', stake: number, duration: number, unit: TradeDurationUnit, trailingStop?: TrailingStopConfig) => void;
  isSniperTriggerArmed?: boolean;
  onToggleSniperTrigger?: () => void;
  trailingStopConfig?: TrailingStopConfig;
  onTrailingStopConfigChange?: (config: TrailingStopConfig) => void;
  onOpenQuickSettings?: () => void;
}

export const TradeControls: React.FC<TradeControlsProps> = ({
  stake,
  onStakeChange,
  duration,
  durationUnit = 'minutes',
  onDurationChange,
  direction,
  onDirectionChange,
  onExecuteTrade,
  isExecuting,
  aiPrediction,
  algorithmicDecision,
  currency = 'USD',
  isLiveMode = false,
  sizingMode = 'KELLY_HALF',
  onSizingModeChange,
  riskMetrics,
  recommendedKellyStake,
  sniperSetup,
  currentPrice = 1000,
  onExecuteSniperTrade,
  isSniperTriggerArmed = false,
  onToggleSniperTrigger,
  trailingStopConfig = DEFAULT_TRAILING_STOP_CONFIG,
  onTrailingStopConfigChange,
  onOpenQuickSettings,
}) => {
  const [activeDeckTab, setActiveDeckTab] = useState<'standard' | 'sniper'>(
    sniperSetup?.isPrimed ? 'sniper' : 'standard'
  );
  const [selectedDurationUnit, setSelectedDurationUnit] = useState<TradeDurationUnit>(durationUnit);
  const [stakeInput, setStakeInput] = useState<string>(String(stake));

  React.useEffect(() => {
    if (durationUnit && durationUnit !== selectedDurationUnit) {
      setSelectedDurationUnit(durationUnit);
    }
  }, [durationUnit]);

  React.useEffect(() => {
    setStakeInput(String(stake));
  }, [stake]);

  const quickStakes = [1, 5, 10, 25, 50, 100];
  const filteredPresets = PRESET_DURATIONS.filter((d) => d.unit === selectedDurationUnit);

  // Payout multiplier (95% standard payout for Rise/Fall on Deriv)
  const payoutRate = 0.95;
  const potentialProfit = stake * payoutRate;
  const totalPayout = stake + potentialProfit;

  const handleDirectionSelect = (dir: 'CALL' | 'PUT') => {
    onDirectionChange(dir);
    sound.play('click');
  };

  const handleExecute = () => {
    sound.play('trade');
    onExecuteTrade(trailingStopConfig);
  };

  const handleModeSelect = (mode: PositionSizingMode) => {
    onSizingModeChange?.(mode);
    sound.play('kelly_calc');
  };

  const handleUnitTabChange = (unit: TradeDurationUnit) => {
    setSelectedDurationUnit(unit);
    const firstInUnit = PRESET_DURATIONS.find((d) => d.unit === unit);
    if (firstInUnit) {
      onDurationChange(firstInUnit.value, firstInUnit.unit);
    }
    sound.play('click');
  };

  const aiRecommendedDuration =
    sniperSetup?.recommendedDuration?.label ||
    (aiPrediction?.suggested_duration ? `${aiPrediction.suggested_duration}m` : `${algorithmicDecision?.duration || 15}m`);

  return (
    <div className="flex flex-col gap-3.5">
      {/* Top Deck Mode Switcher: Sniper HUD vs Standard Controls & Quick Settings */}
      <div className="flex items-center justify-between bg-slate-900/90 p-1.5 rounded-xl border border-slate-800 gap-1.5">
        <div className="grid grid-cols-2 gap-1 flex-1 text-xs font-mono">
          <button
            type="button"
            onClick={() => {
              setActiveDeckTab('sniper');
              sound.play('click');
            }}
            className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeDeckTab === 'sniper'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 font-black shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Crosshair className="w-4 h-4" />
            <span>SNIPER MODE</span>
            {sniperSetup?.isPrimed && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveDeckTab('standard');
              sound.play('click');
            }}
            className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeDeckTab === 'standard'
                ? 'bg-slate-800 text-slate-100 font-black shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>STANDARD DECK</span>
          </button>
        </div>

        {onOpenQuickSettings && (
          <button
            type="button"
            onClick={() => {
              onOpenQuickSettings();
              sound.play('click');
            }}
            className="px-2.5 py-2 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 hover:border-cyan-300 transition-all flex items-center gap-1 font-mono text-xs font-bold shrink-0 shadow-sm shadow-cyan-950/40 active:scale-95"
            title="Quick Settings (Stake, Duration, AI Gate & Sync)"
            aria-label="Quick Settings"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        )}
      </div>

      {/* RENDER VIEW: SNIPER MODE */}
      {activeDeckTab === 'sniper' && (
        sniperSetup ? (
          <SniperControlsPanel
            sniperSetup={sniperSetup}
            currentPrice={currentPrice}
            duration={duration}
            durationUnit={durationUnit}
            onDurationChange={onDurationChange}
            stake={stake}
            currency={currency}
            onExecuteSniper={(dir, s, d, u) => {
              if (onExecuteSniperTrade) {
                onExecuteSniperTrade(dir, s, d, u, trailingStopConfig);
              } else {
                onDirectionChange(dir);
                onStakeChange(s);
                onDurationChange(d, u);
                onExecuteTrade(trailingStopConfig);
              }
            }}
            isExecuting={isExecuting}
            isSniperTriggerArmed={isSniperTriggerArmed}
            onToggleSniperTrigger={onToggleSniperTrigger || (() => {})}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-8 bg-slate-900/90 border border-slate-800 rounded-xl text-center space-y-3 shadow-xl">
            <div className="p-3 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Crosshair className="w-6 h-6 animate-spin" />
            </div>
            <div className="font-bold text-sm text-slate-200">Calibrating Confluence Vectors</div>
            <p className="text-xs text-slate-400 max-w-xs">
              Synthesizing multi-timeframe order flow, volatility channels, and indicator consensus for optimal sniper execution.
            </p>
          </div>
        )
      )}

      {/* RENDER VIEW: STANDARD DECK */}
      {activeDeckTab === 'standard' && (
        <div className="flex flex-col gap-4 p-5 bg-slate-900/90 border border-slate-800 rounded-xl shadow-xl backdrop-blur-md">
          {/* Title & Mode */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold font-sans tracking-wide text-slate-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              CONTRACT EXECUTION DECK
            </h2>
            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
                  isLiveMode
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                }`}
              >
                {isLiveMode ? 'REAL MONEY' : 'SIMULATOR'}
              </span>
            </div>
          </div>

          {/* Rise / Fall Direction Switcher */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleDirectionSelect('CALL')}
              className={`relative flex flex-col items-center justify-center p-3.5 rounded-xl border font-mono transition-all ${
                direction === 'CALL'
                  ? 'bg-gradient-to-br from-emerald-500/20 to-teal-900/30 border-emerald-500/80 text-white shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center gap-1.5 font-black text-sm sm:text-base text-emerald-400">
                <TrendingUp className="w-4 h-4" />
                <span>RISE (CALL)</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5">Higher than spot</span>
              {direction === 'CALL' && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400"></span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleDirectionSelect('PUT')}
              className={`relative flex flex-col items-center justify-center p-3.5 rounded-xl border font-mono transition-all ${
                direction === 'PUT'
                  ? 'bg-gradient-to-br from-rose-500/20 to-pink-900/30 border-rose-500/80 text-white shadow-lg shadow-rose-500/20'
                  : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center gap-1.5 font-black text-sm sm:text-base text-rose-400">
                <TrendingDown className="w-4 h-4" />
                <span>FALL (PUT)</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5">Lower than spot</span>
              {direction === 'PUT' && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-400"></span>
              )}
            </button>
          </div>

          {/* Position Sizing Selector: Dynamic Kelly vs Fixed */}
          <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300 font-bold flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-cyan-400" />
                Position Sizing Engine
              </span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                Anti-Asymmetric Risk
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-xs font-mono">
              <button
                type="button"
                onClick={() => handleModeSelect('KELLY_HALF')}
                className={`py-1.5 px-2 rounded-lg text-center transition-all ${
                  sizingMode === 'KELLY_HALF'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                Half-Kelly (Rec.)
              </button>
              <button
                type="button"
                onClick={() => handleModeSelect('KELLY_QUARTER')}
                className={`py-1.5 px-2 rounded-lg text-center transition-all ${
                  sizingMode === 'KELLY_QUARTER'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                Quarter-Kelly
              </button>
              <button
                type="button"
                onClick={() => handleModeSelect('FIXED')}
                className={`py-1.5 px-2 rounded-lg text-center transition-all ${
                  sizingMode === 'FIXED'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                Manual Fixed
              </button>
            </div>

            {sizingMode !== 'FIXED' && recommendedKellyStake !== undefined && (
              <div className="flex items-center justify-between text-[11px] font-mono bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
                <span className="text-slate-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Dynamic Stake Bound:
                </span>
                <span className="text-emerald-300 font-bold">
                  ${recommendedKellyStake.toFixed(2)} {currency}
                </span>
              </div>
            )}
          </div>

          {/* Stake Selector */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <label htmlFor="stake-amount-input" className="text-slate-400 flex items-center gap-1 cursor-pointer">
                <DollarSign className="w-3.5 h-3.5 text-cyan-400" />
                Active Stake ({currency})
              </label>
              <span className="text-slate-300 font-bold font-mono">${stake.toFixed(2)}</span>
            </div>

            <div className="relative flex items-center">
              <input
                id="stake-amount-input"
                type="number"
                min="0.5"
                max="10000"
                step="0.5"
                value={stakeInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setStakeInput(val);
                  const num = parseFloat(val);
                  if (!isNaN(num) && num > 0) {
                    onStakeChange(Math.min(10000, num));
                  }
                }}
                onBlur={() => {
                  const num = parseFloat(stakeInput);
                  if (isNaN(num) || num < 0.5) {
                    setStakeInput('1.00');
                    onStakeChange(1.0);
                  } else {
                    const clamped = Math.max(0.5, Math.min(10000, Number(num.toFixed(2))));
                    setStakeInput(String(clamped));
                    onStakeChange(clamped);
                  }
                }}
                className="w-full bg-slate-950 border border-slate-700 hover:border-cyan-500/60 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-white font-mono font-bold text-base rounded-xl pl-4 pr-24 py-2.5 outline-none transition-all"
              />
              <div className="absolute right-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(0.5, Number((stake - 0.5).toFixed(2)));
                    setStakeInput(String(next));
                    onStakeChange(next);
                    sound.play('click');
                  }}
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded font-mono text-xs border border-slate-800 active:scale-95"
                >
                  -0.5
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(10000, Number((stake + 0.5).toFixed(2)));
                    setStakeInput(String(next));
                    onStakeChange(next);
                    sound.play('click');
                  }}
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-cyan-300 rounded font-mono text-xs border border-slate-800 active:scale-95"
                >
                  +0.5
                </button>
              </div>
            </div>

            {/* Quick Stake Buttons */}
            <div className="grid grid-cols-6 gap-1.5">
              {quickStakes.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => onStakeChange(val)}
                  className={`py-1 rounded-lg text-xs font-mono font-medium transition-all ${
                    stake === val
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  ${val}
                </button>
              ))}
            </div>
          </div>

          {/* Enhanced Duration Selector: Units & Values */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                Contract Expiry Duration
              </span>
              {aiRecommendedDuration && (
                <span className="text-[10px] text-cyan-400 flex items-center gap-1 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60 font-semibold">
                  <Sparkles className="w-3 h-3" /> Adaptive: {aiRecommendedDuration}
                </span>
              )}
            </div>

            {/* Duration Unit Selector Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
              <button
                type="button"
                onClick={() => handleUnitTabChange('ticks')}
                className={`py-1 rounded text-center font-bold transition-all ${
                  selectedDurationUnit === 'ticks'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Ticks (Scalp)
              </button>
              <button
                type="button"
                onClick={() => handleUnitTabChange('seconds')}
                className={`py-1 rounded text-center font-bold transition-all ${
                  selectedDurationUnit === 'seconds'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Seconds
              </button>
              <button
                type="button"
                onClick={() => handleUnitTabChange('minutes')}
                className={`py-1 rounded text-center font-bold transition-all ${
                  selectedDurationUnit === 'minutes'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Minutes
              </button>
            </div>

            {/* Value Pills */}
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
              {filteredPresets.map((preset) => {
                const isSelected = duration === preset.value && durationUnit === preset.unit;

                return (
                  <button
                    key={`${preset.unit}-${preset.value}`}
                    type="button"
                    onClick={() => {
                      onDurationChange(preset.value, preset.unit);
                      sound.play('click');
                    }}
                    className={`py-2 rounded-xl text-xs font-mono font-bold transition-all relative ${
                      isSelected
                        ? 'bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-500/30'
                        : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Trailing Stop-Loss (Dynamic Profit Lock Mode) */}
          <div
            className={`p-3 rounded-xl border transition-all ${
              trailingStopConfig.enabled
                ? 'bg-amber-950/20 border-amber-500/40 shadow-sm shadow-amber-500/10'
                : 'bg-slate-950/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`p-1.5 rounded-lg border ${
                    trailingStopConfig.enabled
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5">
                    <span>Trailing Stop-Loss</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                        trailingStopConfig.enabled
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {trailingStopConfig.enabled ? 'ACTIVE' : 'OFF'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {trailingStopConfig.enabled
                      ? 'Ratchets stop up/down as price trends favorably, locking in gains'
                      : 'Enable to trail profits dynamically on volatile market moves'}
                  </p>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                onClick={() => {
                  const nextState = !trailingStopConfig.enabled;
                  onTrailingStopConfigChange?.({
                    ...trailingStopConfig,
                    enabled: nextState,
                  });
                  sound.play('toggle');
                }}
                className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  trailingStopConfig.enabled ? 'bg-amber-500' : 'bg-slate-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${
                    trailingStopConfig.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Presets when enabled */}
            {trailingStopConfig.enabled && (
              <div className="mt-2.5 pt-2.5 border-t border-amber-500/20 flex flex-col gap-1.5">
                <div className="text-[10px] text-amber-300/90 font-mono font-bold flex items-center justify-between">
                  <span>Trailing Distance Preset:</span>
                  <span className="text-slate-300">
                    {trailingStopConfig.distanceType === 'PERCENT'
                      ? `${trailingStopConfig.distanceValue}% Fixed`
                      : `${trailingStopConfig.distanceValue}x ATR`}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {TRAILING_STOP_PRESETS.map((preset) => {
                    const isSelected =
                      trailingStopConfig.distanceType === preset.config.distanceType &&
                      trailingStopConfig.distanceValue === preset.config.distanceValue;

                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          onTrailingStopConfigChange?.({
                            ...trailingStopConfig,
                            enabled: true,
                            distanceType: preset.config.distanceType,
                            distanceValue: preset.config.distanceValue,
                          });
                          sound.play('click');
                        }}
                        title={preset.description}
                        className={`px-2 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all text-center border ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-sm'
                            : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-amber-500/40 hover:text-white'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* Profit Lock Automation Threshold Controls */}
                <div className="mt-2 pt-2 border-t border-amber-500/20 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-amber-300 font-bold flex items-center gap-1">
                      <span>🔒 Profit Lock Threshold:</span>
                    </span>
                    <span className="text-emerald-400 font-bold">
                      {trailingStopConfig.profitLockThresholdPercent ?? 50}% of Target Payout
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[25, 50, 75, 100].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          onTrailingStopConfigChange?.({
                            ...trailingStopConfig,
                            profitLockEnabled: true,
                            profitLockThresholdPercent: pct,
                          });
                          sound.play('click');
                        }}
                        className={`py-1 rounded text-[10px] font-mono font-bold border transition-all ${
                          (trailingStopConfig.profitLockThresholdPercent ?? 50) === pct
                            ? 'bg-amber-500/25 text-amber-200 border-amber-500/60 font-black'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {pct}% Lock
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Payout & Risk Summary */}
          <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl flex flex-col gap-1.5 text-xs font-mono">
            <div className="flex items-center justify-between text-slate-400">
              <span>Expected Return Rate:</span>
              <span className="text-slate-200 font-bold">+{(payoutRate * 100).toFixed(0)}%</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Estimated Net Profit:</span>
              <span className="text-emerald-400 font-bold">+${potentialProfit.toFixed(2)}</span>
            </div>
            {riskMetrics && (
              <div className="flex items-center justify-between text-slate-400 border-t border-slate-800/60 pt-1">
                <span>Profit Factor / Max DD:</span>
                <span className="text-slate-300 font-bold">
                  {riskMetrics.profitFactor.toFixed(2)} / {riskMetrics.maxDrawdownPercent.toFixed(1)}%
                </span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-800/60 pt-1.5 font-bold text-slate-200">
              <span>Total Payout at Expiry:</span>
              <span className="text-cyan-300 font-mono text-sm">${totalPayout.toFixed(2)}</span>
            </div>
          </div>

          {/* Main Execution CTA Button */}
          <button
            type="button"
            disabled={isExecuting}
            onClick={handleExecute}
            className={`w-full py-3.5 rounded-xl font-mono font-black text-sm sm:text-base tracking-wide flex items-center justify-center gap-2 transition-all shadow-xl ${
              direction === 'CALL'
                ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 shadow-emerald-500/25 active:scale-95'
                : 'bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 hover:from-rose-400 hover:to-pink-500 text-white shadow-rose-500/25 active:scale-95'
            } ${isExecuting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isExecuting ? (
              <span>EXECUTING CONTRACT...</span>
            ) : (
              <>
                {direction === 'CALL' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                <span>
                  OPEN {direction === 'CALL' ? 'RISE' : 'FALL'} POSITION (${stake} • {duration}
                  {durationUnit === 'ticks' ? 'T' : durationUnit === 'seconds' ? 's' : 'm'})
                </span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
