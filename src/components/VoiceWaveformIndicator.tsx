import React, { useState, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  Square,
  Radio,
  Sliders,
  Sparkles,
  Headphones,
  X,
  Play,
} from 'lucide-react';
import {
  voice,
  AGENT_PERSONAS,
  AgentVoicePersonaId,
  VoiceEngineState,
} from '../lib/voiceEngine';
import { sound } from '../lib/soundEngine';

export interface VoiceWaveformProps {
  barCount?: number;
  height?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: 'cyan' | 'teal' | 'emerald' | 'amber' | 'multi';
  active?: boolean;
  className?: string;
  speedMultiplier?: number;
}

/**
 * Pure dynamic audio waveform equalizer bars
 */
export const VoiceWaveform: React.FC<VoiceWaveformProps> = ({
  barCount = 8,
  height = 'md',
  color = 'cyan',
  active = true,
  className = '',
  speedMultiplier = 1.0,
}) => {
  const heightClasses = {
    xs: 'h-3',
    sm: 'h-4',
    md: 'h-6',
    lg: 'h-9',
    xl: 'h-12',
  };

  const barWidthClasses = {
    xs: 'w-0.5 min-w-[2px]',
    sm: 'w-0.5 min-w-[2px]',
    md: 'w-1 min-w-[3px]',
    lg: 'w-1 sm:w-1.5 min-w-[4px]',
    xl: 'w-1.5 sm:w-2 min-w-[5px]',
  };

  const getBarColor = (index: number) => {
    if (color === 'teal') return 'bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.6)]';
    if (color === 'emerald') return 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]';
    if (color === 'amber') return 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]';
    if (color === 'multi') {
      const colors = [
        'bg-cyan-400',
        'bg-teal-300',
        'bg-emerald-400',
        'bg-cyan-300',
        'bg-teal-400',
        'bg-emerald-300',
      ];
      return `${colors[index % colors.length]} shadow-[0_0_8px_rgba(6,182,212,0.6)]`;
    }
    return 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.6)]';
  };

  const safeSpeed = Math.max(0.7, Math.min(1.5, speedMultiplier));
  const baseDuration = 0.85 / safeSpeed;

  return (
    <div
      className={`flex items-center justify-center gap-0.5 sm:gap-1 ${heightClasses[height]} ${className}`}
      aria-label="Audio waveform equalizer"
    >
      {Array.from({ length: barCount }).map((_, i) => {
        // Human voice speech formant simulation curve
        const centerDistance = Math.abs(i - (barCount - 1) / 2);
        const naturalVocalPeak = 1 - (centerDistance / (barCount / 1.6)) * 0.35;
        const delay = (i * 0.09) % 0.6;
        const duration = baseDuration * (0.75 + ((i * 3) % 5) * 0.1);

        return (
          <div
            key={i}
            className={`h-full flex items-center justify-center ${barWidthClasses[height]}`}
          >
            <span
              className={`rounded-full transition-all ${getBarColor(i)} ${
                active ? 'animate-waveform-bar' : 'h-[20%] opacity-35'
              }`}
              style={{
                animationDelay: active ? `${delay}s` : '0s',
                animationDuration: active ? `${duration}s` : '0s',
                transformOrigin: 'bottom center',
                maxHeight: `${Math.round(naturalVocalPeak * 100)}%`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

/**
 * Animated talking radar / sound-wave concentric ripple indicator
 */
export const VoiceTalkingRadar: React.FC<{
  isSpeaking: boolean;
  avatar?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ isSpeaking, avatar, size = 'md', className = '' }) => {
  const sizeMap = {
    sm: { container: 'w-7 h-7 text-xs', ring: 'inset-0' },
    md: { container: 'w-9 h-9 text-sm', ring: '-inset-1' },
    lg: { container: 'w-12 h-12 text-base', ring: '-inset-2' },
  };

  const { container, ring } = sizeMap[size];

  return (
    <div className={`relative flex items-center justify-center ${container} ${className}`}>
      {/* Concentric Audio Radar Sound Waves */}
      {isSpeaking && (
        <>
          <span
            className={`absolute ${ring} rounded-xl border border-cyan-400/60 animate-radar-ring pointer-events-none`}
            style={{ animationDelay: '0s' }}
          />
          <span
            className={`absolute ${ring} rounded-xl border border-teal-400/40 animate-radar-ring pointer-events-none`}
            style={{ animationDelay: '0.6s' }}
          />
          <span
            className={`absolute ${ring} rounded-xl border border-cyan-500/20 animate-radar-ring pointer-events-none`}
            style={{ animationDelay: '1.2s' }}
          />
        </>
      )}

      {/* Core Avatar / Icon Box */}
      <div
        className={`relative z-10 w-full h-full rounded-xl flex items-center justify-center border transition-all ${
          isSpeaking
            ? 'bg-gradient-to-br from-cyan-950 via-slate-900 to-teal-950 border-cyan-400 shadow-md shadow-cyan-500/30 animate-talking-pulse'
            : 'bg-slate-900 border-slate-800 text-slate-400'
        }`}
      >
        {avatar ? (
          <span className="select-none">{avatar}</span>
        ) : (
          <Headphones className={`w-4 h-4 ${isSpeaking ? 'text-cyan-300' : 'text-slate-400'}`} />
        )}
      </div>
    </div>
  );
};

/**
 * Compact Voice Talking Waveform Pill for toolbars, headers and buttons
 */
export const VoiceWaveformPill: React.FC<{
  isSpeaking: boolean;
  onStop?: () => void;
  label?: string;
  size?: 'sm' | 'md';
}> = ({ isSpeaking, onStop, label = 'TALKING', size = 'sm' }) => {
  if (!isSpeaking) return null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/50 shadow-sm shadow-cyan-500/20 backdrop-blur-md text-cyan-300 font-mono ${
        size === 'sm' ? 'text-[10px]' : 'text-xs'
      }`}
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
      </span>

      <VoiceWaveform barCount={5} height="xs" active={true} color="cyan" />

      <span className="font-bold tracking-wider">{label}</span>

      {onStop && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStop();
            sound.play('toggle');
          }}
          className="ml-0.5 p-0.5 rounded hover:bg-cyan-900/60 text-cyan-300 hover:text-white"
          title="Stop Speech"
        >
          <Square className="w-2.5 h-2.5 fill-current" />
        </button>
      )}
    </div>
  );
};

/**
 * Global Top Floating Voice Broadcast HUD Banner
 * Automatically mounts when voice is speaking across the entire app
 */
export const VoiceBroadcastBanner: React.FC<{
  onOpenSettings?: () => void;
}> = ({ onOpenSettings }) => {
  const [voiceState, setVoiceState] = useState<VoiceEngineState>(() => voice.getState());

  useEffect(() => {
    const unsub = voice.subscribeState((st) => setVoiceState({ ...st }));
    return () => unsub();
  }, []);

  if (!voiceState.isSpeaking) return null;

  const currentPersona = AGENT_PERSONAS[voiceState.personaId] || AGENT_PERSONAS.executive;

  const handleStop = () => {
    voice.stop();
    sound.play('toggle');
  };

  const handleToggleMute = () => {
    voice.setEnabled(!voiceState.isEnabled);
    sound.play('toggle');
  };

  return (
    <div className="fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-50 w-[96vw] max-w-2xl transition-all duration-300 animate-slide-up select-none pointer-events-none">
      <div className="pointer-events-auto bg-slate-950/95 border border-cyan-500/50 rounded-2xl shadow-2xl shadow-cyan-950/70 backdrop-blur-xl p-2.5 sm:p-3.5 flex flex-col gap-2 ring-1 ring-cyan-500/30">
        <div className="flex items-center justify-between gap-3">
          {/* Left: Persona Avatar & Talking Radar */}
          <div className="flex items-center gap-2.5 min-w-0">
            <VoiceTalkingRadar isSpeaking={true} avatar={currentPersona.avatar} size="md" />

            <div className="min-w-0 flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs sm:text-sm text-slate-100 font-mono truncate">
                  {currentPersona.name}
                </span>
                <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[9px] font-mono font-bold tracking-wider animate-pulse flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                  VOICE ACTIVE
                </span>
                <span className="hidden sm:inline text-[10px] font-mono text-cyan-400 bg-cyan-950/80 px-1.5 py-0.2 rounded border border-cyan-900">
                  {voiceState.rateMultiplier.toFixed(2)}x speed
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider truncate">
                {currentPersona.role}
              </span>
            </div>
          </div>

          {/* Center: Dynamic Waveform Bars */}
          <div className="hidden sm:flex items-center px-3 py-1 bg-slate-900/90 rounded-xl border border-cyan-500/30">
            <VoiceWaveform
              barCount={14}
              height="sm"
              color="multi"
              active={true}
              speedMultiplier={voiceState.rateMultiplier}
            />
          </div>

          {/* Right: Quick Action Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleStop}
              className="px-2.5 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
              title="Stop Speech"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Stop</span>
            </button>

            <button
              onClick={handleToggleMute}
              className="p-1.5 bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-800 rounded-xl transition-colors"
              title={voiceState.isEnabled ? 'Mute voice engine' : 'Unmute voice engine'}
            >
              {voiceState.isEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>

            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="p-1.5 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-cyan-300 border border-slate-800 rounded-xl transition-colors"
                title="Open Voice Settings"
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Live Spoken Transcript Ticker */}
        {voiceState.currentText && (
          <div className="px-2.5 py-1.5 bg-slate-900/80 rounded-xl border border-slate-800 flex items-center gap-2">
            <div className="sm:hidden">
              <VoiceWaveform barCount={6} height="xs" color="cyan" active={true} />
            </div>
            <Radio className="w-3 h-3 text-cyan-400 shrink-0 hidden sm:block animate-pulse" />
            <p className="text-[11px] font-sans text-slate-200 line-clamp-1 italic tracking-normal flex-1">
              "{voiceState.currentText}"
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
