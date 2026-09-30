import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Zap,
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  Bot,
  Crosshair,
  RotateCcw,
  CheckCircle2,
  X,
  Sparkles,
  ChevronUp,
  ChevronDown,
  HelpCircle,
} from 'lucide-react';
import { voiceInput, VoiceTradeCommand } from '../lib/voiceInputEngine';
import { sound } from '../lib/soundEngine';

interface VoiceCommandHUDProps {
  onExecuteTrade: (direction: 'CALL' | 'PUT') => void;
  onDurationChange: (duration: number, unit?: 'ticks' | 'seconds' | 'minutes') => void;
  onStakeChange: (stake: number) => void;
  onToggleBot: () => void;
  onToggleSniper: () => void;
  onReplenishAnchor: () => void;
  onSelectSymbol?: (symbol: string) => void;
  currentStake: number;
  currentDuration: number;
  currentDurationUnit: 'ticks' | 'seconds' | 'minutes';
  botEnabled: boolean;
  isSniperArmed: boolean;
  currency?: string;
}

export const VoiceCommandHUD: React.FC<VoiceCommandHUDProps> = (props) => {
  const {
    currentStake,
    currentDuration,
    currentDurationUnit,
    botEnabled,
    isSniperArmed,
    currency = 'USD',
  } = props;

  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [lastExecutedCommand, setLastExecutedCommand] = useState<{
    text: string;
    action: string;
    timestamp: number;
  } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const isSupported = voiceInput.isSupported();

  useEffect(() => {
    // 1. Subscribe to speech recognition status & interim text
    const unsubVoice = voiceInput.subscribe((listening, transcript, isFinal) => {
      setIsListening(listening);
      setInterimText(transcript);
    });

    // 2. Subscribe to parsed trade commands
    const unsubTradeCmd = voiceInput.subscribeTradeCommand((cmd: VoiceTradeCommand) => {
      const p = propsRef.current;
      switch (cmd.type) {
        case 'EXECUTE_RISE':
          p.onExecuteTrade('CALL');
          setLastExecutedCommand({
            text: cmd.rawText,
            action: `Executed RISE trade ($${p.currentStake.toFixed(2)} • ${p.currentDuration} ${p.currentDurationUnit})`,
            timestamp: Date.now(),
          });
          break;

        case 'EXECUTE_FALL':
          p.onExecuteTrade('PUT');
          setLastExecutedCommand({
            text: cmd.rawText,
            action: `Executed FALL trade ($${p.currentStake.toFixed(2)} • ${p.currentDuration} ${p.currentDurationUnit})`,
            timestamp: Date.now(),
          });
          break;

        case 'SET_DURATION':
          if (cmd.payload?.duration) {
            p.onDurationChange(cmd.payload.duration, cmd.payload.unit);
            setLastExecutedCommand({
              text: cmd.rawText,
              action: `Target set to ${cmd.payload.duration} ${cmd.payload.unit || 'minutes'}`,
              timestamp: Date.now(),
            });
          }
          break;

        case 'SET_STAKE':
          if (cmd.payload?.stake) {
            p.onStakeChange(cmd.payload.stake);
            setLastExecutedCommand({
              text: cmd.rawText,
              action: `Base stake set to $${cmd.payload.stake.toFixed(2)} ${p.currency || 'USD'}`,
              timestamp: Date.now(),
            });
          }
          break;

        case 'TOGGLE_BOT':
          p.onToggleBot();
          setLastExecutedCommand({
            text: cmd.rawText,
            action: p.botEnabled ? 'Automated Bot stopped' : 'Automated Bot activated',
            timestamp: Date.now(),
          });
          break;

        case 'ARM_SNIPER':
          p.onToggleSniper();
          setLastExecutedCommand({
            text: cmd.rawText,
            action: p.isSniperArmed ? 'Sniper trigger disarmed' : 'Sniper trigger armed',
            timestamp: Date.now(),
          });
          break;

        case 'REPLENISH_ANCHOR':
          p.onReplenishAnchor();
          setLastExecutedCommand({
            text: cmd.rawText,
            action: 'Virtual account anchor replenished ($10.00)',
            timestamp: Date.now(),
          });
          break;

        case 'SWITCH_SYMBOL':
          if (cmd.payload?.symbol && p.onSelectSymbol) {
            p.onSelectSymbol(cmd.payload.symbol);
            setLastExecutedCommand({
              text: cmd.rawText,
              action: `Switched symbol to ${cmd.payload.symbol}`,
              timestamp: Date.now(),
            });
          }
          break;
      }
    });

    const unsubError = voiceInput.subscribeError((err) => {
      setErrorNotice(err);
      setTimeout(() => setErrorNotice(null), 5000);
    });

    return () => {
      unsubVoice();
      unsubTradeCmd();
      unsubError();
    };
  }, []);

  // Auto-dismiss confirmation toast after 4 seconds
  useEffect(() => {
    if (!lastExecutedCommand) return;
    const timer = setTimeout(() => {
      setLastExecutedCommand(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [lastExecutedCommand]);

  const toggleMic = () => {
    sound.play('click');
    if (!isSupported) {
      setErrorNotice('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      setTimeout(() => setErrorNotice(null), 5000);
      return;
    }
    voiceInput.toggle();
  };

  const handleSimulateCommand = (text: string) => {
    sound.play('click');
    voiceInput.processSpokenText(text);
  };

  return (
    <div className="fixed bottom-16 sm:bottom-6 left-3 sm:left-6 z-40 flex flex-col items-start gap-2 max-w-sm pointer-events-none">
      {/* Toast Notification for Executed Voice Action */}
      {lastExecutedCommand && (
        <div className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-900/95 border border-cyan-500/40 rounded-xl shadow-2xl backdrop-blur-md text-xs font-mono text-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-cyan-300 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-cyan-400" /> Voice Command Executed
            </span>
            <span className="text-slate-300 text-[11px]">{lastExecutedCommand.action}</span>
          </div>
          <button
            onClick={() => setLastExecutedCommand(null)}
            className="text-slate-500 hover:text-slate-300 ml-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error Notice */}
      {errorNotice && (
        <div className="pointer-events-auto flex items-center gap-2 px-3 py-2 bg-rose-950/90 border border-rose-500/40 rounded-xl shadow-xl text-xs text-rose-300 font-mono backdrop-blur-md animate-in fade-in">
          <span>{errorNotice}</span>
          <button onClick={() => setErrorNotice(null)} className="text-rose-400 hover:text-rose-200">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Expanded Voice Command Panel & Quick Triggers */}
      {isExpanded && (
        <div className="pointer-events-auto w-80 bg-slate-950/95 border border-slate-800 rounded-2xl p-4 shadow-2xl backdrop-blur-xl space-y-3 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Mic className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-100 block">Voice Execution HUD</span>
                <span className="text-[10px] text-slate-400">Hands-Free Trading Control</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowCheatSheet(!showCheatSheet)}
                className={`p-1 rounded text-slate-400 hover:text-cyan-300 transition-colors ${
                  showCheatSheet ? 'text-cyan-400 bg-cyan-500/10' : ''
                }`}
                title="Command reference cheat sheet"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsExpanded(false)}
                className="p-1 text-slate-400 hover:text-slate-200 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Live Mic Wave & Speech Transcript Stream */}
          <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isListening ? 'bg-cyan-400 animate-ping' : 'bg-slate-600'
                  }`}
                />
                {isListening ? (
                  <span className="text-cyan-400 font-bold">LISTENING FOR TRADE COMMANDS...</span>
                ) : (
                  <span className="text-slate-400">Microphone Inactive</span>
                )}
              </span>
              <button
                onClick={toggleMic}
                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                  isListening
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/40 hover:bg-rose-500/20'
                    : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/40 hover:bg-cyan-500/20'
                }`}
              >
                {isListening ? 'Stop' : 'Start Mic'}
              </button>
            </div>

            {/* Audio Waveform visualization */}
            {isListening && (
              <div className="flex items-center justify-center gap-1 py-1 h-6">
                {[0.4, 0.8, 1.2, 0.6, 1.5, 0.9, 1.3, 0.5, 1.1, 0.7].map((height, i) => (
                  <div
                    key={i}
                    className="w-1 bg-gradient-to-t from-cyan-500 to-blue-400 rounded-full animate-pulse"
                    style={{
                      height: `${Math.max(4, height * 14)}px`,
                      animationDuration: `${0.4 + (i % 4) * 0.15}s`,
                    }}
                  />
                ))}
              </div>
            )}

            <div className="text-[11px] min-h-[28px] text-slate-200 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 flex items-center">
              {interimText ? (
                <span className="text-cyan-300 italic">"{interimText}"</span>
              ) : isListening ? (
                <span className="text-slate-500 italic">Say "Open Rise", "Open Fall", or "Set target to 10 minutes"...</span>
              ) : (
                <span className="text-slate-500">Tap microphone or say command to trigger actions</span>
              )}
            </div>
          </div>

          {/* Quick Voice Simulation Buttons */}
          <div className="space-y-1.5">
            <span className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase block">
              Quick Voice Commands (Speak or Click)
            </span>
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <button
                type="button"
                onClick={() => handleSimulateCommand('Open Rise')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/50 transition-colors text-left"
              >
                <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="truncate">"Open Rise"</span>
              </button>
              <button
                type="button"
                onClick={() => handleSimulateCommand('Open Fall')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 hover:bg-rose-900/50 transition-colors text-left"
              >
                <TrendingDown className="w-3 h-3 text-rose-400 shrink-0" />
                <span className="truncate">"Open Fall"</span>
              </button>
              <button
                type="button"
                onClick={() => handleSimulateCommand('Set target to 10 minutes')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700/60 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors text-left"
              >
                <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                <span className="truncate">"Target 10 mins"</span>
              </button>
              <button
                type="button"
                onClick={() => handleSimulateCommand('Set stake to 5 dollars')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700/60 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors text-left"
              >
                <DollarSign className="w-3 h-3 text-cyan-400 shrink-0" />
                <span className="truncate">"Stake $5"</span>
              </button>
              <button
                type="button"
                onClick={() => handleSimulateCommand(botEnabled ? 'Stop Bot' : 'Start Bot')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700/60 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors text-left"
              >
                <Bot className="w-3 h-3 text-cyan-400 shrink-0" />
                <span className="truncate">"{botEnabled ? 'Stop Bot' : 'Start Bot'}"</span>
              </button>
              <button
                type="button"
                onClick={() => handleSimulateCommand('Arm Sniper')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700/60 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors text-left"
              >
                <Crosshair className="w-3 h-3 text-cyan-400 shrink-0" />
                <span className="truncate">"Arm Sniper"</span>
              </button>
            </div>
          </div>

          {/* Reference Cheat Sheet Accordion */}
          {showCheatSheet && (
            <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 space-y-1.5 text-[10px] text-slate-300">
              <span className="font-bold text-slate-100 block border-b border-slate-800 pb-1">
                Supported Voice Grammars:
              </span>
              <ul className="space-y-1 list-disc pl-3 text-slate-400">
                <li><strong className="text-emerald-300">"Open Rise"</strong> or <strong className="text-emerald-300">"Buy Rise"</strong> – Executes Call order</li>
                <li><strong className="text-rose-300">"Open Fall"</strong> or <strong className="text-rose-300">"Buy Fall"</strong> – Executes Put order</li>
                <li><strong className="text-cyan-300">"Set target to 10 minutes"</strong> – Adjusts contract duration</li>
                <li><strong className="text-cyan-300">"Set target to 5 ticks"</strong> – Switches to tick expiry</li>
                <li><strong className="text-amber-300">"Set stake to $5"</strong> – Calibrates position size</li>
                <li><strong className="text-blue-300">"Start bot" / "Stop bot"</strong> – Toggles automated bot</li>
                <li><strong className="text-indigo-300">"Arm sniper"</strong> – Arms confluence entry trigger</li>
                <li><strong className="text-teal-300">"Replenish anchor"</strong> – Resets $10 virtual capital</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Main Floating Trigger Pill */}
      <div className="pointer-events-auto flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 rounded-full p-1 shadow-2xl backdrop-blur-md">
        <button
          onClick={toggleMic}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono font-bold transition-all shadow-md ${
            isListening
              ? 'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-rose-500/25 animate-pulse'
              : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-500/25'
          }`}
          title={isListening ? 'Click to stop listening' : 'Voice Command: Say "Open Rise" or "Set target to 10 minutes"'}
        >
          {isListening ? (
            <>
              <Mic className="w-3.5 h-3.5 animate-bounce" />
              <span>LISTENING...</span>
            </>
          ) : (
            <>
              <Mic className="w-3.5 h-3.5" />
              <span>VOICE TRADING</span>
            </>
          )}
        </button>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 text-slate-400 hover:text-slate-200 rounded-full hover:bg-slate-900 transition-colors"
          title={isExpanded ? 'Collapse voice HUD' : 'Expand voice HUD'}
        >
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};
