import { sound } from './soundEngine';
import { voice } from './voiceEngine';

// Type definitions for Web Speech API SpeechRecognition
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

// Built-in strategic voice command macros for AI Co-Pilot chat
export interface VoiceCommandMatch {
  command: string;
  mappedPrompt: string;
}

// Interactive voice trading commands
export type VoiceTradeCommandType =
  | 'EXECUTE_RISE'
  | 'EXECUTE_FALL'
  | 'SET_DURATION'
  | 'SET_STAKE'
  | 'TOGGLE_BOT'
  | 'ARM_SNIPER'
  | 'REPLENISH_ANCHOR'
  | 'SWITCH_SYMBOL';

export interface VoiceTradeCommand {
  type: VoiceTradeCommandType;
  rawText: string;
  payload?: {
    duration?: number;
    unit?: 'ticks' | 'seconds' | 'minutes';
    stake?: number;
    enabled?: boolean;
    symbol?: string;
  };
  feedbackMessage: string;
}

export const STRATEGIC_VOICE_COMMANDS: { triggers: string[]; command: string; prompt: string }[] = [
  {
    triggers: ['analyze market', 'market structure', 'market analysis', 'analyze the market'],
    command: 'Analyze Market',
    prompt: 'Analyze current market structure, volatility, and key dynamic levels for this symbol.',
  },
  {
    triggers: ['explain signal', 'signal explanation', 'why buy', 'why sell', 'current signal'],
    command: 'Explain Signal',
    prompt: 'Explain the current composite indicator consensus and latest AI confidence score.',
  },
  {
    triggers: ['analyze trend', 'trend analysis', 'trend direction', 'market trend'],
    command: 'Analyze Trend',
    prompt: 'What is the dominant trend across MA14 and MA50, and are we near an exhaustion point?',
  },
  {
    triggers: ['risk check', 'risk audit', 'check risk', 'drawdown check', 'portfolio risk'],
    command: 'Risk Check',
    prompt: 'Perform a comprehensive risk audit of my current session P&L, stake sizing, and stop loss rules.',
  },
  {
    triggers: ['stress test', 'prompt stress test', 'run stress test', 'simulate loss', 'simulate drawdown'],
    command: 'Prompt Stress Test',
    prompt: 'Execute a portfolio stress test simulating a 3-trade losing streak under current volatility and evaluate Kelly Criterion defense.',
  },
  {
    triggers: ['explain last trade', 'review last trade', 'last trade critique', 'last trade'],
    command: 'Explain Last Trade',
    prompt: 'Review our most recent trade execution and explain whether the entry criteria were sound.',
  },
  {
    triggers: ['review configuration', 'check settings', 'review bot', 'bot settings'],
    command: 'Review Configuration',
    prompt: 'Review my auto-trading bot settings and recommend optimal risk adjustments.',
  },
];

/**
 * Intelligent parser that converts human voice spoken phrases into concrete trade actions.
 * Handles commands like:
 * - "Open Rise" / "Buy Rise" / "Execute Rise" / "Rise" / "Call"
 * - "Open Fall" / "Buy Fall" / "Execute Fall" / "Fall" / "Put"
 * - "Set target to 10 minutes" / "Set duration to 5 minutes" / "Set target to 15 seconds" / "Target 5 ticks"
 * - "Set stake to 5 dollars" / "Stake 10" / "Amount 2 dollars"
 * - "Start bot" / "Stop bot" / "Toggle bot"
 * - "Arm sniper" / "Disarm sniper"
 * - "Replenish anchor" / "Replenish balance"
 * - "Switch to Volatility 10" / "Select Volatility 100"
 */
export function parseVoiceTradeCommand(transcript: string): VoiceTradeCommand | null {
  const text = transcript.trim();
  const lower = text.toLowerCase();

  // 1. Duration / Target: "Set target to 10 minutes", "Set duration to 5 minutes", "Set target to 15 seconds", "Set target to 5 ticks"
  const durMatch =
    lower.match(/(?:set\s+)?(?:target|duration|expiry|time|expiration)\s+(?:to\s+|at\s+)?(\d+)\s*(minutes?|mins?|seconds?|secs?|ticks?|t|s|m)\b/i) ||
    lower.match(/^(\d+)\s*(minutes?|mins?|seconds?|secs?|ticks?)\s*(?:target|duration|expiry)?$/i);

  if (durMatch) {
    const val = parseInt(durMatch[1], 10);
    const rawUnit = durMatch[2].toLowerCase();
    let unit: 'ticks' | 'seconds' | 'minutes' = 'minutes';
    if (rawUnit.startsWith('tick') || rawUnit === 't') {
      unit = 'ticks';
    } else if (rawUnit.startsWith('sec') || rawUnit === 's') {
      unit = 'seconds';
    } else {
      unit = 'minutes';
    }
    return {
      type: 'SET_DURATION',
      rawText: text,
      payload: { duration: val, unit },
      feedbackMessage: `Execution target calibrated to ${val} ${unit}.`,
    };
  }

  // 2. Stake / Amount: "Set stake to 5 dollars", "Stake 10", "Set amount to 2.50"
  const stakeMatch = lower.match(/(?:set\s+)?(?:stake|amount)\s+(?:to\s+|at\s+)?(?:\$)?\s*(\d+(?:\.\d+)?)\s*(?:dollars?|usd)?\b/i);
  if (stakeMatch) {
    const stakeVal = parseFloat(stakeMatch[1]);
    if (!isNaN(stakeVal) && stakeVal > 0) {
      return {
        type: 'SET_STAKE',
        rawText: text,
        payload: { stake: stakeVal },
        feedbackMessage: `Base stake updated to $${stakeVal.toFixed(2)}.`,
      };
    }
  }

  // 3. Open Rise / Buy: "Open Rise", "Buy Rise", "Rise", "Execute Rise", "Open Call"
  if (
    !lower.includes('why') &&
    !lower.includes('explain') &&
    !lower.includes('what is') &&
    (/(?:open|execute|enter|buy|trade|place|start)\s+(?:a\s+)?(?:rise|call)\b/i.test(lower) ||
      /^(?:rise|call|buy)$/i.test(lower))
  ) {
    return {
      type: 'EXECUTE_RISE',
      rawText: text,
      feedbackMessage: 'Rise order executed.',
    };
  }

  // 4. Open Fall / Sell: "Open Fall", "Buy Fall", "Fall", "Execute Fall", "Open Put"
  if (
    !lower.includes('why') &&
    !lower.includes('explain') &&
    !lower.includes('what is') &&
    (/(?:open|execute|enter|buy|sell|trade|place|start)\s+(?:a\s+)?(?:fall|put)\b/i.test(lower) ||
      /^(?:fall|put|sell)$/i.test(lower))
  ) {
    return {
      type: 'EXECUTE_FALL',
      rawText: text,
      feedbackMessage: 'Fall order executed.',
    };
  }

  // 5. Bot toggle: "Start bot", "Stop bot", "Activate bot"
  if (/\b(?:start|activate|enable|turn on|run)\s+(?:the\s+)?(?:auto\s*)?bot\b/i.test(lower)) {
    return {
      type: 'TOGGLE_BOT',
      rawText: text,
      payload: { enabled: true },
      feedbackMessage: 'Automated trading engine activated.',
    };
  }
  if (/\b(?:stop|pause|disable|turn off|halt)\s+(?:the\s+)?(?:auto\s*)?bot\b/i.test(lower)) {
    return {
      type: 'TOGGLE_BOT',
      rawText: text,
      payload: { enabled: false },
      feedbackMessage: 'Automated trading engine stopped.',
    };
  }
  if (/\b(?:toggle)\s+(?:the\s+)?(?:auto\s*)?bot\b/i.test(lower)) {
    return {
      type: 'TOGGLE_BOT',
      rawText: text,
      feedbackMessage: 'Automated trading engine toggled.',
    };
  }

  // 6. Tactical Sniper: "Arm sniper", "Disarm sniper"
  if (/\b(?:arm|enable|activate)\s*(?:tactical\s+)?sniper\b/i.test(lower)) {
    return {
      type: 'ARM_SNIPER',
      rawText: text,
      payload: { enabled: true },
      feedbackMessage: 'Tactical sniper armed.',
    };
  }
  if (/\b(?:disarm|disable|deactivate)\s*(?:tactical\s+)?sniper\b/i.test(lower)) {
    return {
      type: 'ARM_SNIPER',
      rawText: text,
      payload: { enabled: false },
      feedbackMessage: 'Tactical sniper disarmed.',
    };
  }

  // 7. Replenish Anchor: "Replenish balance", "Reset balance", "Replenish anchor"
  if (/\b(?:replenish|top up|reload|re-anchor|reset)\s*(?:virtual\s*)?(?:balance|anchor|account)\b/i.test(lower)) {
    return {
      type: 'REPLENISH_ANCHOR',
      rawText: text,
      feedbackMessage: 'Virtual account balance replenished to $10.00 anchor.',
    };
  }

  // 8. Symbol Switch: "Switch to Volatility 10", "Select Volatility 100"
  const symMatch = lower.match(/\b(?:switch to|select|trade|change to)?\s*(?:volatility|vol)\s*(10|25|50|75|100)(?:\s*(?:1s|1\s*second))?\b/i);
  if (symMatch) {
    const num = symMatch[1];
    const is1s = lower.includes('1s') || lower.includes('1 second');
    const symbolCode = is1s ? `1HZ${num}V` : `R_${num}`;
    return {
      type: 'SWITCH_SYMBOL',
      rawText: text,
      payload: { symbol: symbolCode },
      feedbackMessage: `Market switched to Volatility ${num}${is1s ? ' 1-second' : ''}.`,
    };
  }

  return null;
}

export class VoiceInputEngine {
  private recognition: any = null;
  private isListening: boolean = false;
  private listeners: Set<(listening: boolean, transcript: string, isFinal: boolean) => void> = new Set();
  private errorListeners: Set<(err: string) => void> = new Set();
  private commandListeners: Set<(match: VoiceCommandMatch) => void> = new Set();
  private tradeCommandListeners: Set<(cmd: VoiceTradeCommand) => void> = new Set();

  constructor() {
    this.initRecognition();
  }

  private initRecognition() {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isListening = true;
        sound.play('click');
        this.notify(true, '', false);
      };

      this.recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            final += res[0].transcript;
          } else {
            interim += res[0].transcript;
          }
        }

        const currentText = (final || interim).trim();
        this.notify(this.isListening, currentText, Boolean(final));

        if (final) {
          this.processSpokenText(final.trim());
        }
      };

      this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn('Speech recognition notice:', event.error);
        if (event.error === 'not-allowed') {
          this.isListening = false;
          this.notify(false, '', false);
          this.errorListeners.forEach((l) => l('Microphone access denied. Please allow microphone permissions in your browser.'));
        } else if (event.error !== 'no-speech') {
          this.errorListeners.forEach((l) => l(event.error));
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.notify(false, '', false);
      };
    } catch (e: any) {
      console.warn('Voice input initialization exception:', e);
    }
  }

  public isSupported(): boolean {
    return Boolean(
      typeof window !== 'undefined' &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    );
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  public start() {
    if (!this.recognition) {
      this.initRecognition();
    }
    if (!this.recognition) {
      this.errorListeners.forEach((l) => l('Speech recognition not supported in this browser.'));
      return;
    }

    try {
      if (this.isListening) {
        this.recognition.stop();
      }
      this.recognition.start();
    } catch (err: any) {
      console.warn('Failed to start speech recognition:', err);
    }
  }

  public stop() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (err) {
        // Ignore
      }
    }
    this.isListening = false;
    this.notify(false, '', false);
  }

  public toggle() {
    if (this.isListening) {
      this.stop();
    } else {
      this.start();
    }
  }

  public subscribe(
    listener: (listening: boolean, transcript: string, isFinal: boolean) => void
  ) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeError(listener: (err: string) => void) {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  public subscribeCommand(listener: (match: VoiceCommandMatch) => void) {
    this.commandListeners.add(listener);
    return () => {
      this.commandListeners.delete(listener);
    };
  }

  public subscribeTradeCommand(listener: (cmd: VoiceTradeCommand) => void) {
    this.tradeCommandListeners.add(listener);
    return () => {
      this.tradeCommandListeners.delete(listener);
    };
  }

  private notify(listening: boolean, transcript: string, isFinal: boolean) {
    queueMicrotask(() => {
      this.listeners.forEach((l) => {
        try {
          l(listening, transcript, isFinal);
        } catch (e) {
          console.warn('Voice input listener error:', e);
        }
      });
    });
  }

  /**
   * Evaluates spoken text against trade execution rules and strategic chat macros.
   */
  public processSpokenText(transcript: string): VoiceTradeCommand | null {
    // 1. Check for immediate trading action
    const tradeCmd = parseVoiceTradeCommand(transcript);
    if (tradeCmd) {
      sound.play('trade');
      voice.speak(tradeCmd.feedbackMessage, 'calm');
      queueMicrotask(() => {
        this.tradeCommandListeners.forEach((l) => {
          try {
            l(tradeCmd);
          } catch (e) {
            console.warn('Voice trade command listener error:', e);
          }
        });
      });
      return tradeCmd;
    }

    // 2. Check for strategic macro prompt for Co-Pilot
    const lower = transcript.toLowerCase();
    for (const cmd of STRATEGIC_VOICE_COMMANDS) {
      for (const trigger of cmd.triggers) {
        if (lower.includes(trigger)) {
          sound.play('toggle');
          const match: VoiceCommandMatch = {
            command: cmd.command,
            mappedPrompt: cmd.prompt,
          };
          this.commandListeners.forEach((l) => l(match));
          return null;
        }
      }
    }

    return null;
  }
}

export const voiceInput = new VoiceInputEngine();
