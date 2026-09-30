import React, { useState, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  Mic,
  Square,
  Sparkles,
  ChevronUp,
  ChevronDown,
  Play,
  Settings2,
  Headphones,
  Crosshair,
  ShieldAlert,
  Zap,
  Radio,
  Sliders,
} from 'lucide-react';
import {
  voice,
  AGENT_PERSONAS,
  AgentVoicePersonaId,
  VoiceEngineState,
} from '../lib/voiceEngine';
import { sound } from '../lib/soundEngine';
import { AIPredictionResult, MarketRegime } from '../types/trading';
import { SniperConfluenceResult } from '../types/sniper';
import { VoiceWaveform, VoiceTalkingRadar } from './VoiceWaveformIndicator';

interface AgentVoiceCompanionProps {
  symbol: string;
  currentPrice: number;
  regime: MarketRegime;
  aiPrediction: AIPredictionResult | null;
  sniperSetup?: SniperConfluenceResult | null;
  balance: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  recommendedStake: number;
}

export const AgentVoiceCompanion: React.FC<AgentVoiceCompanionProps> = ({
  symbol,
  currentPrice,
  regime,
  aiPrediction,
  sniperSetup,
  balance,
  winRate,
  profitFactor,
  maxDrawdown,
  recommendedStake,
}) => {
  const [voiceState, setVoiceState] = useState<VoiceEngineState>(voice.getState());
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'quick' | 'personas' | 'settings'>('quick');

  useEffect(() => {
    const unsub = voice.subscribeState((nextState) => {
      setVoiceState(nextState);
    });
    return () => unsub();
  }, []);

  const personaList: AgentVoicePersonaId[] = ['executive', 'sniper', 'quant', 'cyber'];
  const currentPersona = AGENT_PERSONAS[voiceState.personaId] || AGENT_PERSONAS.executive;

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    voice.setEnabled(!voiceState.isEnabled);
    sound.play('click');
  };

  const handleStopSpeech = (e: React.MouseEvent) => {
    e.stopPropagation();
    voice.stop();
    sound.play('click');
  };

  const handleSelectPersona = (id: AgentVoicePersonaId) => {
    voice.setPersona(id, true);
    sound.play('toggle');
  };

  const handleTriggerMarketBriefing = () => {
    sound.play('click');
    voice.speakMarketBriefing({
      symbol,
      regime: regime.type,
      winProb: aiPrediction?.ai_predicted_win_probability ?? 0.65,
      recommendation: aiPrediction?.recommendation ?? 'BUY',
      catalyst: aiPrediction?.primary_catalyst,
      reason: aiPrediction?.reason,
      price: currentPrice,
    });
  };

  const handleTriggerSniperBriefing = () => {
    sound.play('click');
    if (!sniperSetup) {
      voice.speak('No active sniper confluence signal identified. Scanning order books.', {
        personaId: 'sniper',
      });
      return;
    }
    voice.speakSniperCall({
      symbol,
      direction: sniperSetup.direction,
      score: sniperSetup.score,
      optimalEntry: sniperSetup.optimalEntryPrice,
      takeProfit: sniperSetup.takeProfitPrice,
      stopLoss: sniperSetup.stopLossPrice,
      durationLabel: `${sniperSetup.recommendedDuration.value} ${sniperSetup.recommendedDuration.unit}`,
    });
  };

  const handleTriggerRiskAudit = () => {
    sound.play('click');
    voice.speakRiskAudit({
      balance,
      winRate,
      profitFactor,
      maxDrawdown,
      recommendedStake,
    });
  };

  return (
    <div className="fixed bottom-3 sm:bottom-4 right-3 sm:right-4 z-40 max-w-[94vw] sm:max-w-md w-full transition-all duration-300 pointer-events-none">
      <div className="pointer-events-auto bg-slate-950/95 border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/40 backdrop-blur-xl overflow-hidden">
        {/* Top Mini Header / Status Pill */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-r from-slate-900/90 via-slate-900/90 to-cyan-950/40 cursor-pointer select-none hover:bg-slate-900 transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Agent Avatar Icon with dynamic talking radar rings */}
            <VoiceTalkingRadar
              isSpeaking={voiceState.isSpeaking}
              avatar={currentPersona.avatar}
              size="sm"
            />

            {/* Persona & Speech Status */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold font-mono tracking-wide text-cyan-300 truncate">
                  {currentPersona.name}
                </span>
                <span className="hidden sm:inline-block px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 text-[9px] font-mono font-semibold">
                  VOICE AGENT
                </span>
              </div>

              {/* Status or Speaking Transcript Snippet */}
              <div className="text-[10px] text-slate-400 font-mono truncate max-w-[200px] sm:max-w-xs">
                {voiceState.isSpeaking ? (
                  <span className="text-emerald-400 font-semibold animate-pulse flex items-center gap-1">
                    <Radio className="w-2.5 h-2.5 text-emerald-400" />
                    Speaking...
                  </span>
                ) : voiceState.isEnabled ? (
                  <span>Ready • Tap for audio briefings</span>
                ) : (
                  <span className="text-slate-500">Voice Muted</span>
                )}
              </div>
            </div>
          </div>

          {/* Right Controls: Waveform, Stop, Mute, Expand */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Live Reactive Audio Waveform Bars */}
            {voiceState.isSpeaking && (
              <div className="flex items-center px-2 py-1 bg-cyan-950/80 rounded-xl border border-cyan-500/40 shadow-sm">
                <VoiceWaveform
                  barCount={8}
                  height="xs"
                  color="multi"
                  active={true}
                  speedMultiplier={voiceState.rateMultiplier}
                />
              </div>
            )}

            {voiceState.isSpeaking && (
              <button
                onClick={handleStopSpeech}
                className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40 transition-colors"
                title="Stop Speech"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            )}

            <button
              onClick={handleToggleMute}
              className={`p-1.5 rounded-lg border transition-colors ${
                voiceState.isEnabled
                  ? 'bg-slate-800/80 text-cyan-300 border-slate-700 hover:bg-slate-850'
                  : 'bg-rose-950/40 text-rose-400 border-rose-800 hover:bg-rose-900/40'
              }`}
              title={voiceState.isEnabled ? 'Mute Agent Voice' : 'Enable Agent Voice'}
            >
              {voiceState.isEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>

            <button
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
              title={isExpanded ? 'Collapse' : 'Expand Voice Deck'}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Live Active Spoken Transcript Box (When Speaking) */}
        {voiceState.isSpeaking && voiceState.currentText && (
          <div className="px-3.5 py-2 bg-slate-900/90 border-t border-cyan-500/20 text-xs font-sans text-slate-200 flex items-start gap-2">
            <Radio className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0 animate-spin" />
            <p className="line-clamp-2 italic text-slate-300 text-[11px] leading-relaxed">
              "{voiceState.currentText}"
            </p>
          </div>
        )}

        {/* Expanded Agentic Voice Control Center */}
        {isExpanded && (
          <div className="p-3.5 flex flex-col gap-3 border-t border-slate-800/80">
            {/* Navigation Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-[11px] font-mono">
              <button
                onClick={() => setActiveTab('quick')}
                className={`py-1.5 rounded-lg font-semibold transition-all ${
                  activeTab === 'quick'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🎙️ Audio Briefs
              </button>
              <button
                onClick={() => setActiveTab('personas')}
                className={`py-1.5 rounded-lg font-semibold transition-all ${
                  activeTab === 'personas'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                👥 Personas
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`py-1.5 rounded-lg font-semibold transition-all ${
                  activeTab === 'settings'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ⚙️ Voice Pitch
              </button>
            </div>

            {/* TAB 1: Quick Interactive Voice Briefings */}
            {activeTab === 'quick' && (
              <div className="flex flex-col gap-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center justify-between">
                  <span>Interactive Agentic Voice Triggers</span>
                  <span className="text-cyan-400">Live Telemetry</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={handleTriggerMarketBriefing}
                    className="flex flex-col items-start p-2.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-cyan-500/40 text-left transition-all group"
                  >
                    <div className="flex items-center gap-1.5 text-cyan-400 mb-1">
                      <Sparkles className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold font-mono">Market Brief</span>
                    </div>
                    <span className="text-[10px] text-slate-400 line-clamp-1 font-sans">
                      Forecast & catalysts for {symbol}
                    </span>
                  </button>

                  <button
                    onClick={handleTriggerSniperBriefing}
                    className="flex flex-col items-start p-2.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/40 text-left transition-all group"
                  >
                    <div className="flex items-center gap-1.5 text-amber-400 mb-1">
                      <Crosshair className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold font-mono">Sniper Confluence</span>
                    </div>
                    <span className="text-[10px] text-slate-400 line-clamp-1 font-sans">
                      {sniperSetup ? `Score: ${sniperSetup.score}/100` : 'Scan order zones'}
                    </span>
                  </button>

                  <button
                    onClick={handleTriggerRiskAudit}
                    className="flex flex-col items-start p-2.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/40 text-left transition-all group"
                  >
                    <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
                      <ShieldAlert className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold font-mono">Risk Audit</span>
                    </div>
                    <span className="text-[10px] text-slate-400 line-clamp-1 font-sans">
                      Kelly stake & drawdown
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: Agent Persona Selector */}
            {activeTab === 'personas' && (
              <div className="flex flex-col gap-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
                  Select Active Voice Personality
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {personaList.map((pid) => {
                    const p = AGENT_PERSONAS[pid];
                    const isSelected = voiceState.personaId === pid;
                    return (
                      <button
                        key={pid}
                        onClick={() => handleSelectPersona(pid)}
                        className={`flex items-start gap-2 p-2 rounded-xl text-left border transition-all ${
                          isSelected
                            ? 'bg-cyan-950/60 border-cyan-500/50 shadow-md shadow-cyan-950/30'
                            : 'bg-slate-900 border-slate-800 hover:bg-slate-850 text-slate-300'
                        }`}
                      >
                        <span className="text-lg">{p.avatar}</span>
                        <div className="flex flex-col min-w-0">
                          <span
                            className={`text-xs font-bold font-mono truncate ${
                              isSelected ? 'text-cyan-300' : 'text-slate-200'
                            }`}
                          >
                            {p.name}
                          </span>
                          <span className="text-[9px] text-slate-400 line-clamp-1 font-mono">
                            {p.role}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="p-2 bg-slate-900/60 border border-slate-800/80 rounded-xl text-[10px] text-slate-400 leading-relaxed font-sans">
                  💡 <strong className="text-slate-300">{currentPersona.name}:</strong>{' '}
                  {currentPersona.description}
                </div>
              </div>
            )}

            {/* TAB 3: Settings & Pace Calibration */}
            {activeTab === 'settings' && (
              <div className="flex flex-col gap-3 text-xs font-mono">
                {/* Speech Rate Controls */}
                <div>
                  <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-semibold mb-1.5">
                    <span>Speech Cadence / Speed</span>
                    <span className="text-cyan-300 font-bold">{voiceState.rateMultiplier.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="1.5"
                    step="0.05"
                    value={voiceState.rateMultiplier}
                    onChange={(e) => voice.setRateMultiplier(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 mb-1.5"
                  />
                  <div className="grid grid-cols-4 gap-1.5">
                    {[0.85, 1.0, 1.15, 1.3].map((r) => (
                      <button
                        key={r}
                        onClick={() => {
                          voice.setRateMultiplier(r);
                          sound.play('click');
                        }}
                        className={`py-1 rounded-lg text-[10px] font-mono font-semibold transition-all ${
                          Math.abs(voiceState.rateMultiplier - r) < 0.05
                            ? 'bg-cyan-500 text-slate-950'
                            : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        {r === 1.0 ? '1.0x Normal' : `${r}x`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Voice Pitch Controls */}
                <div>
                  <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-semibold mb-1.5">
                    <span>Voice Pitch / Frequency</span>
                    <span className="text-teal-300 font-bold">{voiceState.pitchMultiplier.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.65"
                    max="1.4"
                    step="0.05"
                    value={voiceState.pitchMultiplier}
                    onChange={(e) => voice.setPitchMultiplier(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400 mb-1.5"
                  />
                  <div className="grid grid-cols-4 gap-1.5">
                    {[0.8, 1.0, 1.15, 1.3].map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          voice.setPitchMultiplier(p);
                          sound.play('click');
                        }}
                        className={`py-1 rounded-lg text-[10px] font-mono font-semibold transition-all ${
                          Math.abs(voiceState.pitchMultiplier - p) < 0.05
                            ? 'bg-teal-500 text-slate-950'
                            : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        {p === 1.0 ? '1.0x Natural' : `${p}x`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Test Greeting Audio Button & Reset */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => voice.testCadence()}
                    className="flex-1 py-2 bg-slate-900 hover:bg-slate-850 text-cyan-300 border border-cyan-500/30 rounded-xl flex items-center justify-center gap-2 font-mono text-xs font-bold transition-all shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Test Cadence</span>
                  </button>
                  <button
                    onClick={() => {
                      voice.resetCadence();
                      sound.play('toggle');
                    }}
                    className="px-3 py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-xl font-mono text-xs transition-all"
                    title="Reset to 1.0x default pitch and speed"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
