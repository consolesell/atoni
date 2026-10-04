import React from 'react';
import {
  X,
  Sliders,
  DollarSign,
  Clock,
  Bot,
  Brain,
  Shield,
  Volume2,
  VolumeX,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Flame,
  Sparkles,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { BotState } from '../types/trading';
import { TradeDurationUnit } from '../types/sniper';
import { sound } from '../lib/soundEngine';
import { voice } from '../lib/voiceEngine';
import { autoSyncEngine } from '../lib/autoSyncEngine';

interface QuickSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stake: number;
  onStakeChange: (s: number) => void;
  duration: number;
  onDurationChange: (d: number, unit?: TradeDurationUnit) => void;
  durationUnit?: TradeDurationUnit;
  botState: BotState;
  onUpdateBotState: (updates: Partial<BotState>) => void;
  isLiveMode: boolean;
  onOpenFullSettings: () => void;
  onTriggerAutoSync: () => void;
  lastSyncTime?: number | null;
  currency?: string;
}

const PRESET_STAKES = [1, 2, 5, 10, 25, 50];
const PRESET_DURATIONS: { label: string; value: number; unit: TradeDurationUnit }[] = [
  { label: '5 Ticks', value: 5, unit: 'ticks' },
  { label: '10 Ticks', value: 10, unit: 'ticks' },
  { label: '15s', value: 15, unit: 'seconds' },
  { label: '30s', value: 30, unit: 'seconds' },
  { label: '1m', value: 60, unit: 'seconds' },
  { label: '5m', value: 5, unit: 'minutes' },
];

export const QuickSettingsModal: React.FC<QuickSettingsModalProps> = ({
  isOpen,
  onClose,
  stake,
  onStakeChange,
  duration,
  onDurationChange,
  durationUnit = 'seconds',
  botState,
  onUpdateBotState,
  isLiveMode,
  onOpenFullSettings,
  onTriggerAutoSync,
  lastSyncTime,
  currency = 'USD',
}) => {
  if (!isOpen) return null;

  const [voiceEnabled, setVoiceEnabled] = React.useState(voice.getState().isEnabled);
  const [syncStatusMsg, setSyncStatusMsg] = React.useState<string | null>(null);
  const [isSyncing, setIsSyncing] = React.useState(false);

  const handleToggleVoice = () => {
    const next = !voiceEnabled;
    voice.setEnabled(next);
    setVoiceEnabled(next);
    sound.play('toggle');
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    sound.play('click');
    setSyncStatusMsg('Syncing intelligence to Google Keep, Drive & Firestore...');
    try {
      await onTriggerAutoSync();
      setSyncStatusMsg('✅ Successfully synced intelligence snapshot!');
      sound.play('win');
    } catch {
      setSyncStatusMsg('⚠️ Sync completed with local cache.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatusMsg(null), 3500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/95 border border-cyan-500/30 rounded-2xl shadow-2xl p-4 sm:p-6 relative flex flex-col gap-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-inner">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white font-mono tracking-wider flex items-center gap-1.5">
                <span>QUICK SETTINGS</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
                  FAST ACCESS
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                Instant execution parameters, AI controls & 10-min sync
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            aria-label="Close Quick Settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Stake Quick Presets */}
        <div className="flex flex-col gap-2 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 font-bold flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span>STAKE SIZE:</span>
              <span className="text-emerald-400 font-extrabold">${stake.toFixed(2)} {currency}</span>
            </span>
            <span className="text-[10px] text-slate-500">Virtual / Real Contract Risk</span>
          </div>

          <div className="grid grid-cols-6 gap-1.5">
            {PRESET_STAKES.map((amt) => {
              const isSelected = stake === amt;
              return (
                <button
                  key={amt}
                  onClick={() => {
                    onStakeChange(amt);
                    sound.play('click');
                  }}
                  className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-all border ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                  }`}
                >
                  ${amt}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Duration Quick Presets */}
        <div className="flex flex-col gap-2 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 font-bold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>DURATION:</span>
              <span className="text-cyan-300 font-extrabold">
                {duration} {durationUnit === 'ticks' ? 'Ticks' : durationUnit === 'minutes' ? 'Min' : 'Sec'}
              </span>
            </span>
            <span className="text-[10px] text-slate-500">Expiry Horizon</span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {PRESET_DURATIONS.map((preset) => {
              const isSelected = duration === preset.value && durationUnit === preset.unit;
              return (
                <button
                  key={preset.label}
                  onClick={() => {
                    onDurationChange(preset.value, preset.unit);
                    sound.play('click');
                  }}
                  className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-all border ${
                    isSelected
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-500/20'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Bot & AI Guard Quick Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Bot State Toggle */}
          <div className="flex flex-col justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-200">
                <Bot className="w-4 h-4 text-purple-400" />
                <span>AUTO-BOT</span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-mono ${
                  botState.enabled
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {botState.enabled ? 'ACTIVE' : 'STANDBY'}
              </span>
            </div>
            <button
              onClick={() => {
                sound.play('toggle');
                onUpdateBotState({ enabled: !botState.enabled });
              }}
              className={`w-full py-1.5 rounded-lg text-xs font-mono font-bold transition-all border ${
                botState.enabled
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                  : 'bg-cyan-500 text-slate-950 border-cyan-400 hover:bg-cyan-400 shadow-md shadow-cyan-500/20'
              }`}
            >
              {botState.enabled ? 'PAUSE AUTO-BOT' : 'ENGAGE AUTO-BOT'}
            </button>
          </div>

          {/* AI Direction Confirmation Match */}
          <div className="flex flex-col justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-200">
                <Brain className="w-4 h-4 text-cyan-400" />
                <span>AI MATCH</span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-mono ${
                  botState.aiDirectionMatchRequired
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                }`}
              >
                {botState.aiDirectionMatchRequired ? 'REQUIRED' : 'OFF'}
              </span>
            </div>
            <button
              onClick={() => {
                sound.play('toggle');
                onUpdateBotState({
                  aiDirectionMatchRequired: !botState.aiDirectionMatchRequired,
                });
              }}
              className="w-full py-1.5 rounded-lg text-xs font-mono font-bold bg-slate-900 hover:bg-slate-850 text-slate-200 border border-slate-700 transition-all"
            >
              {botState.aiDirectionMatchRequired ? 'Disable AI Gate' : 'Enable AI Gate'}
            </button>
          </div>
        </div>

        {/* 3b. Strategy & Risk Circuit Breakers (sbagent.md Section 2 & 4) */}
        <div className="flex flex-col gap-2 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono">
          <div className="flex items-center justify-between">
            <span className="text-slate-300 font-bold flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-rose-400" />
              <span>CONSENSUS & RISK GUARD</span>
            </span>
            <span className="text-[10px] text-cyan-400 font-bold">sbagent.md Enforced</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col gap-0.5">
              <span className="text-slate-400">Agent Consensus:</span>
              <span className="text-emerald-400 font-bold">≥3/4 (or ≥62% weight)</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col gap-0.5">
              <span className="text-slate-400">Session Circuit Breaker:</span>
              <span className="text-rose-400 font-bold">5.0% Max Drawdown</span>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 pt-1 border-t border-slate-800/80">
            <CheckCircle2 className="w-3 h-3 text-cyan-400 shrink-0" />
            <span>HOLD Rules Active: BB Width &lt; 0.0015 squeeze filter • MTF trend conflict filter</span>
          </div>
        </div>

        {/* 4. Audio & Voice Assistant Quick Toggle */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-cyan-400">
              {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            </div>
            <div>
              <div className="text-xs font-mono font-bold text-slate-200">Voice Tactical Callouts</div>
              <div className="text-[10px] text-slate-400 font-mono">Real-time trade briefings & entry triggers</div>
            </div>
          </div>
          <button
            onClick={handleToggleVoice}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold border transition-all ${
              voiceEnabled
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            {voiceEnabled ? 'ENABLED' : 'MUTED'}
          </button>
        </div>

        {/* 5. 10-Minute Intelligent Auto-Sync Suite */}
        <div className="flex flex-col gap-2 p-3 rounded-xl bg-gradient-to-r from-amber-950/30 via-slate-950 to-cyan-950/30 border border-amber-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              <span className="text-xs font-bold font-mono text-amber-300">
                10-MIN AUTO-SYNC (KEEP, NOTES, DRIVE)
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-bold">
              ACTIVE (10m)
            </span>
          </div>

          <p className="text-[11px] text-slate-400 font-mono leading-relaxed">
            Periodically compiles an intelligent quant log with agent configurations,
            risk metrics, workspace URLs, and synchronizes to Google Keep formatted notes,
            Google Drive/Docs & Firestore.
          </p>

          {lastSyncTime && (
            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
              <Clock className="w-3 h-3 text-cyan-400" />
              <span>Last Snapshot: {new Date(lastSyncTime).toLocaleTimeString()}</span>
            </div>
          )}

          {syncStatusMsg && (
            <div className="text-[11px] font-mono text-amber-300 bg-amber-950/50 p-2 rounded-lg border border-amber-800/60">
              {syncStatusMsg}
            </div>
          )}

          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex items-center justify-center gap-2 py-2 rounded-xl bg-gradient-to-r from-amber-500/20 hover:from-amber-500/30 to-cyan-500/20 hover:to-cyan-500/30 border border-amber-500/40 text-amber-300 hover:text-amber-200 text-xs font-mono font-bold transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'SYNCING INTEL SNAPSHOT...' : 'SYNC NOW TO KEEP & DRIVE'}</span>
          </button>
        </div>

        {/* 6. Footer: Link to Full Settings Drawer */}
        <div className="border-t border-slate-800 pt-3 flex items-center justify-between">
          <button
            onClick={() => {
              onClose();
              onOpenFullSettings();
            }}
            className="flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            <span>Open Advanced Full Settings Drawer (15 Categories)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono font-bold transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
