import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Plus, Bot, Clock, Mic } from 'lucide-react';
import { sound } from '../lib/soundEngine';
import { voiceInput } from '../lib/voiceInputEngine';

interface MobileExecutionBarProps {
  stake: number;
  onStakeChange: (s: number) => void;
  duration: number;
  onDurationChange: (d: number) => void;
  onExecute: (direction: 'CALL' | 'PUT') => void;
  isExecuting: boolean;
  botActive?: boolean;
  isAutonomousRunning?: boolean;
  currency?: string;
  isLiveMode: boolean;
}

export const MobileExecutionBar: React.FC<MobileExecutionBarProps> = ({
  stake,
  onStakeChange,
  duration,
  onDurationChange,
  onExecute,
  isExecuting,
  botActive = false,
  isAutonomousRunning = false,
  currency = 'USD',
  isLiveMode,
}) => {
  const [isVoiceListening, setIsVoiceListening] = useState(voiceInput.getIsListening());
  const durations = [5, 10, 15, 30];

  useEffect(() => {
    const unsub = voiceInput.subscribe((listening) => setIsVoiceListening(listening));
    return () => unsub();
  }, []);

  const handleCycleDuration = () => {
    const nextIndex = (durations.indexOf(duration) + 1) % durations.length;
    onDurationChange(durations[nextIndex]);
    sound.play('click');
  };

  const handleToggleVoice = () => {
    sound.play('click');
    voiceInput.toggle();
  };

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-slate-950/95 border-t border-slate-800/90 backdrop-blur-xl px-3 py-2 pb-safe shadow-2xl">
      <div className="max-w-md mx-auto flex items-center justify-between gap-2.5">
        {/* Left: Stake Stepper & Duration */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Quick Voice Command Mic */}
          <button
            type="button"
            onClick={handleToggleVoice}
            className={`h-9 w-9 rounded-xl border flex items-center justify-center font-mono text-xs font-bold active:scale-95 transition-all ${
              isVoiceListening
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/60 shadow-md shadow-rose-500/30 animate-pulse'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
            title="Hands-free Voice Trading Mic"
          >
            <Mic className={`w-3.5 h-3.5 ${isVoiceListening ? 'text-rose-400 animate-bounce' : 'text-cyan-400'}`} />
          </button>

          {/* Stake Stepper */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5 font-mono">
            <button
              onClick={() => {
                onStakeChange(Math.max(1, stake - 1));
                sound.play('click');
              }}
              disabled={isExecuting}
              className="w-8 h-9 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 flex items-center justify-center active:scale-95 transition-all disabled:opacity-40"
              aria-label="Decrease Stake"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <div className="px-2 text-xs font-bold text-white text-center min-w-[42px]">
              ${stake}
            </div>
            <button
              onClick={() => {
                onStakeChange(stake + 1);
                sound.play('click');
              }}
              disabled={isExecuting}
              className="w-8 h-9 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 flex items-center justify-center active:scale-95 transition-all disabled:opacity-40"
              aria-label="Increase Stake"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Duration Cycle Button */}
          <button
            onClick={handleCycleDuration}
            className="h-9 px-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white flex items-center gap-1 font-mono text-xs font-bold active:scale-95 transition-all"
            title="Cycle Duration"
          >
            <Clock className="w-3 h-3 text-cyan-400" />
            <span>{duration}m</span>
          </button>
        </div>

        {/* Right: Large Execution Buttons (Min Touch Target >= 44px) */}
        <div className="flex-1 grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              onExecute('CALL');
              sound.play('trade');
            }}
            disabled={isExecuting}
            className="min-h-[46px] px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-mono font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/40 active:scale-95 transition-all disabled:opacity-50"
          >
            <TrendingUp className="w-4 h-4" />
            <span className="tracking-wide">CALL ↑</span>
          </button>

          <button
            onClick={() => {
              onExecute('PUT');
              sound.play('trade');
            }}
            disabled={isExecuting}
            className="min-h-[46px] px-3 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-mono font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-rose-950/40 active:scale-95 transition-all disabled:opacity-50"
          >
            <TrendingDown className="w-4 h-4" />
            <span className="tracking-wide">PUT ↓</span>
          </button>
        </div>
      </div>

      {/* Subtle Auto-Trading / Autonomous Active Indicator */}
      {(botActive || isAutonomousRunning) && (
        <div className="flex items-center justify-center gap-1.5 pt-1 text-[10px] font-mono text-cyan-300">
          <Bot className="w-3 h-3 animate-pulse text-cyan-400" />
          <span>
            {isAutonomousRunning ? 'Autonomous Subagent Running' : 'Auto-Trading Bot Active'}
          </span>
        </div>
      )}
    </div>
  );
};
