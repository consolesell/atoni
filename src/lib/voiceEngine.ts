/**
 * SBAgent Voice Synthesis Engine
 * 
 * Provides smooth, humanized, low-latency multi-agent voice synthesis with:
 * - 4 distinct Agentic Personas (Executive, Sniper, Quant Risk, Neural Co-Pilot)
 * - Anti-stall sentence chunking to eliminate browser speech synthesis freeze bugs
 * - Audio speech queue & conversational natural pauses
 * - Humanized financial acronym/symbol formatting (e.g. "Volatility 100 1-second index")
 * - Real-time speech visualization state & interactive playback hooks
 */

export type AgentVoicePersonaId = 'executive' | 'sniper' | 'quant' | 'cyber';

export interface AgentVoicePersona {
  id: AgentVoicePersonaId;
  name: string;
  role: string;
  avatar: string;
  description: string;
  greeting: string;
  baseRate: number;
  basePitch: number;
  voiceNamePreferences: string[];
}

export const AGENT_PERSONAS: Record<AgentVoicePersonaId, AgentVoicePersona> = {
  executive: {
    id: 'executive',
    name: 'SBAgent Executive',
    role: 'Lead Strategic Director',
    avatar: '👔',
    description: 'Calm, authoritative, and strategic. Balanced cadence with crisp institutional perspective.',
    greeting: 'SBAgent Executive online. Quantitative feeds and risk corridors calibrated for strategic execution.',
    baseRate: 1.0,
    basePitch: 1.0,
    voiceNamePreferences: ['Google US English', 'Samantha', 'Daniel', 'Alex', 'en-US'],
  },
  sniper: {
    id: 'sniper',
    name: 'Tactical Sniper',
    role: 'Confluence Entry Specialist',
    avatar: '🎯',
    description: 'Fast, sharp, and disciplined. High-conviction entry alerts and micro-structure confluence calls.',
    greeting: 'Tactical Sniper standing by. Confluence vectors locked, waiting for optimal tick trigger.',
    baseRate: 1.1,
    basePitch: 0.95,
    voiceNamePreferences: ['Alex', 'Daniel', 'Google US English', 'Fred', 'en-US'],
  },
  quant: {
    id: 'quant',
    name: 'Quant Risk Officer',
    role: 'Mathematical Defense & Kelly Bounds',
    avatar: '🛡️',
    description: 'Deliberate, measured, and mathematically rigorous. Protects capital and audits drawdown exposure.',
    greeting: 'Quant Risk Officer engaged. Kelly Criterion thresholds and capital preservation routines active.',
    baseRate: 0.96,
    basePitch: 1.02,
    voiceNamePreferences: ['Samantha', 'Victoria', 'Google UK English Female', 'Karen', 'en-GB'],
  },
  cyber: {
    id: 'cyber',
    name: 'Neural Co-Pilot',
    role: 'Subagent Matrix Intelligence',
    avatar: '⚡',
    description: 'Dynamic, futuristic, and responsive. Synthesizes real-time pattern recognition and machine intelligence.',
    greeting: 'Neural Co-Pilot synced. Multi-agent tensor matrix scanning live order flow.',
    baseRate: 1.08,
    basePitch: 1.08,
    voiceNamePreferences: ['Google UK English Male', 'Daniel', 'Google US English', 'en-US'],
  },
};

export interface VoiceEngineState {
  isEnabled: boolean;
  isSpeaking: boolean;
  currentText: string;
  personaId: AgentVoicePersonaId;
  rateMultiplier: number; // 0.7 to 1.5
  pitchMultiplier: number; // 0.65 to 1.4
  volume: number; // 0 to 1
  selectedVoiceName: string | null;
  availableVoices: string[];
}

export class VoiceEngine {
  private synth: SpeechSynthesis | null = null;
  private isEnabled: boolean = true;
  private personaId: AgentVoicePersonaId = 'executive';
  private rateMultiplier: number = 1.0;
  private pitchMultiplier: number = 1.0;
  private volume: number = 1.0;
  private voice: SpeechSynthesisVoice | null = null;
  private isCurrentlySpeaking: boolean = false;
  private activeText: string = '';
  
  // Sentence queue management to prevent browser speech cutoff
  private chunkQueue: string[] = [];
  private currentChunkIndex: number = 0;
  private queueTimeoutId: any = null;
  private keepAliveIntervalId: any = null;

  private speakingListeners: Set<(isSpeaking: boolean, text?: string) => void> = new Set();
  private stateListeners: Set<(state: VoiceEngineState) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.loadVoice();

      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this.loadVoice();
      }

      // Check local storage preferences
      try {
        const storedEnabled = localStorage.getItem('sbagent_voice_enabled');
        if (storedEnabled !== null) {
          this.isEnabled = storedEnabled === 'true';
        }
        const storedPersona = localStorage.getItem('sbagent_voice_persona') as AgentVoicePersonaId;
        if (storedPersona && AGENT_PERSONAS[storedPersona]) {
          this.personaId = storedPersona;
        }
        const storedRate = localStorage.getItem('sbagent_voice_rate');
        if (storedRate) {
          this.rateMultiplier = Math.max(0.7, Math.min(1.5, parseFloat(storedRate)));
        }
        const storedPitch = localStorage.getItem('sbagent_voice_pitch');
        if (storedPitch) {
          this.pitchMultiplier = Math.max(0.65, Math.min(1.4, parseFloat(storedPitch)));
        }
      } catch {
        // Ignore storage errors
      }
    }
  }

  private loadVoice() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    if (!voices || voices.length === 0) return;

    const persona = AGENT_PERSONAS[this.personaId];
    const preferences = [
      ...(persona?.voiceNamePreferences || []),
      'Google US English',
      'Google UK English Female',
      'Google UK English Male',
      'Samantha',
      'Daniel',
      'Alex',
      'Microsoft Zira',
      'Microsoft David',
      'Victoria',
      'Karen',
      'en-US',
      'en-GB',
    ];

    let found: SpeechSynthesisVoice | null = null;

    for (const pref of preferences) {
      found = voices.find((v) => v.name.includes(pref) || v.lang.startsWith(pref)) || null;
      if (found) break;
    }

    this.voice = found || voices.find((v) => v.lang.startsWith('en')) || voices[0] || null;
    this.notifyState();
  }

  public getState(): VoiceEngineState {
    const voices = this.synth?.getVoices() || [];
    return {
      isEnabled: this.isEnabled,
      isSpeaking: this.isCurrentlySpeaking,
      currentText: this.activeText,
      personaId: this.personaId,
      rateMultiplier: this.rateMultiplier,
      pitchMultiplier: this.pitchMultiplier,
      volume: this.volume,
      selectedVoiceName: this.voice?.name || null,
      availableVoices: voices.filter((v) => v.lang.startsWith('en')).map((v) => v.name),
    };
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    try {
      localStorage.setItem('sbagent_voice_enabled', String(enabled));
    } catch {
      // Ignore
    }
    if (!enabled && this.synth) {
      this.stop();
    }
    this.notifyState();
  }

  public getEnabled(): boolean {
    return this.isEnabled;
  }

  public setPersona(personaId: AgentVoicePersonaId, previewGreeting: boolean = true) {
    if (!AGENT_PERSONAS[personaId]) return;
    this.personaId = personaId;
    try {
      localStorage.setItem('sbagent_voice_persona', personaId);
    } catch {
      // Ignore
    }
    this.loadVoice();
    this.notifyState();

    if (previewGreeting && this.isEnabled) {
      this.speak(AGENT_PERSONAS[personaId].greeting, { interrupt: true });
    }
  }

  public getPersona(): AgentVoicePersona {
    return AGENT_PERSONAS[this.personaId];
  }

  public setRateMultiplier(rate: number) {
    this.rateMultiplier = Math.max(0.7, Math.min(1.5, Math.round(rate * 100) / 100));
    try {
      localStorage.setItem('sbagent_voice_rate', String(this.rateMultiplier));
    } catch {
      // Ignore
    }
    this.notifyState();
  }

  public setPitchMultiplier(pitch: number) {
    this.pitchMultiplier = Math.max(0.65, Math.min(1.4, Math.round(pitch * 100) / 100));
    try {
      localStorage.setItem('sbagent_voice_pitch', String(this.pitchMultiplier));
    } catch {
      // Ignore
    }
    this.notifyState();
  }

  public resetCadence() {
    this.setRateMultiplier(1.0);
    this.setPitchMultiplier(1.0);
  }

  public testCadence(customMessage?: string) {
    const persona = AGENT_PERSONAS[this.personaId] || AGENT_PERSONAS.executive;
    const speedFormatted = this.rateMultiplier.toFixed(2);
    const pitchFormatted = this.pitchMultiplier.toFixed(2);
    const text =
      customMessage ||
      `Voice cadence test. Speech rate configured at ${speedFormatted}x speed, pitch calibrated at ${pitchFormatted}x frequency under the ${persona.name} profile. Audio pipeline operational.`;
    this.speak(text, { interrupt: true });
  }

  public setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.notifyState();
  }

  public subscribeSpeaking(listener: (isSpeaking: boolean, text?: string) => void) {
    this.speakingListeners.add(listener);
    return () => {
      this.speakingListeners.delete(listener);
    };
  }

  public subscribeState(listener: (state: VoiceEngineState) => void) {
    this.stateListeners.add(listener);
    // Defer initial callback to prevent React render-phase update warnings
    queueMicrotask(() => {
      try {
        if (this.stateListeners.has(listener)) {
          listener(this.getState());
        }
      } catch (e) {
        console.warn('Initial voice state callback note:', e);
      }
    });
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private notifySpeaking(speaking: boolean, text?: string) {
    this.isCurrentlySpeaking = speaking;
    this.activeText = speaking ? text || this.activeText : '';
    queueMicrotask(() => {
      this.speakingListeners.forEach((l) => {
        try {
          l(speaking, text);
        } catch (e) {
          console.warn('Voice speaking listener error:', e);
        }
      });
      this.notifyState();
    });
  }

  private notifyState() {
    const state = this.getState();
    queueMicrotask(() => {
      this.stateListeners.forEach((l) => {
        try {
          l(state);
        } catch (e) {
          console.warn('Voice state listener error:', e);
        }
      });
    });
  }

  public getIsSpeaking(): boolean {
    return this.isCurrentlySpeaking;
  }

  public stop() {
    if (this.queueTimeoutId) {
      clearTimeout(this.queueTimeoutId);
      this.queueTimeoutId = null;
    }
    if (this.keepAliveIntervalId) {
      clearInterval(this.keepAliveIntervalId);
      this.keepAliveIntervalId = null;
    }
    this.chunkQueue = [];
    this.currentChunkIndex = 0;

    if (this.synth) {
      try {
        this.synth.cancel();
      } catch (e) {
        // Ignore
      }
      this.notifySpeaking(false, '');
    }
  }

  /**
   * Sanitizes markdown, symbols, and technical tokens into natural spoken English.
   */
  public humanizeTextForSpeech(text: string): string {
    if (!text) return '';

    return text
      // Common Deriv synthetic symbol formatting
      .replace(/1HZ10V/g, 'Volatility 10 1-second index')
      .replace(/1HZ25V/g, 'Volatility 25 1-second index')
      .replace(/1HZ50V/g, 'Volatility 50 1-second index')
      .replace(/1HZ75V/g, 'Volatility 75 1-second index')
      .replace(/1HZ100V/g, 'Volatility 100 1-second index')
      .replace(/R_10\b/g, 'Volatility 10 index')
      .replace(/R_25\b/g, 'Volatility 25 index')
      .replace(/R_50\b/g, 'Volatility 50 index')
      .replace(/R_75\b/g, 'Volatility 75 index')
      .replace(/R_100\b/g, 'Volatility 100 index')
      .replace(/frxEURUSD/g, 'Euro U S Dollar')
      .replace(/frxGBPUSD/g, 'British Pound U S Dollar')
      .replace(/frxUSDJPY/g, 'U S Dollar Japanese Yen')
      .replace(/cryBTCUSD/g, 'Bitcoin U S Dollar')
      .replace(/cryETHUSD/g, 'Ethereum U S Dollar')
      // Acronyms and trading terms
      .replace(/\bTSL\b/g, 'Trailing Stop Loss')
      .replace(/\bATR\b/g, 'A T R')
      .replace(/\bRSI\b/g, 'R S I')
      .replace(/\bEMA\b/g, 'Exponential Moving Average')
      .replace(/\bSMA\b/g, 'Simple Moving Average')
      .replace(/\bPnL\b/gi, 'profit and loss')
      .replace(/\bP&L\b/gi, 'profit and loss')
      .replace(/\bTP\b/g, 'Take Profit')
      .replace(/\bSL\b/g, 'Stop Loss')
      .replace(/\bOB\b/g, 'Order Block')
      .replace(/\bFVG\b/g, 'Fair Value Gap')
      .replace(/\bCALL\b/g, 'Rise')
      .replace(/\bPUT\b/g, 'Fall')
      // Currency values: $12.50 -> 12 dollars 50 cents
      .replace(/\$([0-9]+)\.([0-9]{2})/g, '$1 dollars and $2 cents')
      .replace(/\$([0-9]+)/g, '$1 dollars')
      // Percentage: 65.5% -> 65.5 percent
      .replace(/%/g, ' percent')
      // Markdown stripping
      .replace(/[*_#`~[\]()]/g, ' ')
      .replace(/•/g, ', ')
      .replace(/\|/g, ', ')
      .replace(/https?:\/\/\S+/g, 'link')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Chunks text into natural sentence boundaries to prevent speech synthesis stall.
   */
  private splitIntoSentenceChunks(text: string): string[] {
    const rawChunks = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    const cleanChunks: string[] = [];

    for (const chunk of rawChunks) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;
      // If a sentence is very long (> 160 characters), split by comma or semi-colon
      if (trimmed.length > 160) {
        const subChunks = trimmed.match(/[^,;:]+[,;:]+|[^,;:]+$/g) || [trimmed];
        for (const sub of subChunks) {
          const s = sub.trim();
          if (s) cleanChunks.push(s);
        }
      } else {
        cleanChunks.push(trimmed);
      }
    }

    return cleanChunks.length > 0 ? cleanChunks : [text];
  }

  /**
   * Speaks text using the active persona and smooth sentence streaming.
   */
  public speak(
    text: string,
    options?:
      | {
          rate?: number;
          pitch?: number;
          volume?: number;
          personaId?: AgentVoicePersonaId;
          onEnd?: () => void;
          interrupt?: boolean;
        }
      | 'calm'
      | 'urgent'
      | 'analytical'
  ): void {
    if (!this.isEnabled || !this.synth) return;

    let opts: {
      rate?: number;
      pitch?: number;
      volume?: number;
      personaId?: AgentVoicePersonaId;
      onEnd?: () => void;
      interrupt?: boolean;
    } = {};

    if (typeof options === 'string') {
      if (options === 'calm') {
        opts = { rate: 0.95, pitch: 0.95 };
      } else if (options === 'urgent') {
        opts = { rate: 1.15, pitch: 1.05 };
      } else {
        opts = { rate: 1.0, pitch: 1.0 };
      }
    } else if (options) {
      opts = options;
    }

    if (opts.interrupt !== false) {
      this.stop();
    }

    const humanized = this.humanizeTextForSpeech(text);
    if (!humanized) return;

    const persona = AGENT_PERSONAS[opts.personaId || this.personaId] || AGENT_PERSONAS.executive;
    const finalRate = (opts.rate ?? persona.baseRate) * this.rateMultiplier;
    const finalPitch = (opts.pitch ?? persona.basePitch) * this.pitchMultiplier;
    const finalVolume = opts.volume ?? this.volume;

    const chunks = this.splitIntoSentenceChunks(humanized);
    this.chunkQueue = chunks;
    this.currentChunkIndex = 0;

    this.notifySpeaking(true, humanized);

    // Keep-alive loop to prevent browser speech synthesis silence timeout
    if (!this.keepAliveIntervalId) {
      this.keepAliveIntervalId = setInterval(() => {
        if (this.synth && this.isCurrentlySpeaking) {
          this.synth.pause();
          this.synth.resume();
        }
      }, 10000);
    }

    this.playNextChunk(finalRate, finalPitch, finalVolume, opts.onEnd);
  }

  private playNextChunk(
    rate: number,
    pitch: number,
    volume: number,
    onOverallEnd?: () => void
  ) {
    if (!this.synth || this.currentChunkIndex >= this.chunkQueue.length) {
      this.stop();
      onOverallEnd?.();
      return;
    }

    const currentChunk = this.chunkQueue[this.currentChunkIndex];
    try {
      const utterance = new SpeechSynthesisUtterance(currentChunk);
      if (this.voice) {
        utterance.voice = this.voice;
      }
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;

      utterance.onend = () => {
        this.currentChunkIndex++;
        if (this.currentChunkIndex < this.chunkQueue.length) {
          // Micro pause (60ms) between sentences for human naturalness
          this.queueTimeoutId = setTimeout(() => {
            this.playNextChunk(rate, pitch, volume, onOverallEnd);
          }, 60);
        } else {
          this.stop();
          onOverallEnd?.();
        }
      };

      utterance.onerror = (e) => {
        console.warn('Speech synthesis chunk error:', e.error);
        this.currentChunkIndex++;
        if (this.currentChunkIndex < this.chunkQueue.length) {
          this.playNextChunk(rate, pitch, volume, onOverallEnd);
        } else {
          this.stop();
          onOverallEnd?.();
        }
      };

      this.synth.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis exception in chunk:', err);
      this.stop();
      onOverallEnd?.();
    }
  }

  /* ---------- Agentic Interactive Voice Outputs ---------- */

  public speakPersonaGreeting(personaId: AgentVoicePersonaId) {
    const persona = AGENT_PERSONAS[personaId];
    if (persona) {
      this.speak(persona.greeting, { personaId, interrupt: true });
    }
  }

  public speakMarketBriefing(briefing: {
    symbol: string;
    regime: string;
    winProb: number;
    recommendation: string;
    catalyst?: string;
    reason?: string;
    price?: number;
  }) {
    const dir = briefing.recommendation === 'BUY' ? 'Rise' : briefing.recommendation === 'SELL' ? 'Fall' : 'Consolidation Hold';
    const probPercent = Math.round(briefing.winProb * 100);
    const cat = briefing.catalyst ? `Primary catalyst identified as ${briefing.catalyst}.` : '';
    const rsn = briefing.reason ? `Tactical insight: ${briefing.reason}` : '';

    const text = `SBAgent Market Briefing for ${briefing.symbol}. Current market structure is in ${briefing.regime}. The AI quantitative forecast projects a ${dir} bias with a ${probPercent} percent win probability. ${cat} ${rsn}`;
    this.speak(text, { personaId: 'executive', interrupt: true });
  }

  public speakSniperCall(sniper: {
    symbol: string;
    direction: string;
    score: number;
    optimalEntry?: number;
    takeProfit?: number;
    stopLoss?: number;
    durationLabel?: string;
  }) {
    const dir = sniper.direction === 'CALL' ? 'Rise' : sniper.direction === 'PUT' ? 'Fall' : 'Neutral';
    const entry = sniper.optimalEntry ? `Optimal entry level at ${sniper.optimalEntry.toFixed(2)}.` : '';
    const tp = sniper.takeProfit ? `Target take profit is ${sniper.takeProfit.toFixed(2)}.` : '';
    const dur = sniper.durationLabel ? `Recommended time horizon: ${sniper.durationLabel}.` : '';

    const text = `Sniper Alert. High-conviction ${dir} confluence detected on ${sniper.symbol} with a score of ${sniper.score} out of 100. ${entry} ${tp} ${dur} Awaiting tick trigger.`;
    this.speak(text, { personaId: 'sniper', interrupt: true });
  }

  public speakRiskAudit(risk: {
    balance: number;
    winRate: number;
    profitFactor: number;
    maxDrawdown: number;
    recommendedStake: number;
  }) {
    const text = `Quant Risk Officer report. Current account balance stands at ${risk.balance.toFixed(2)} dollars. Win rate is running at ${risk.winRate.toFixed(1)} percent, with a profit factor of ${risk.profitFactor.toFixed(2)}. Peak session drawdown is ${risk.maxDrawdown.toFixed(1)} percent. Half-Kelly algorithm recommends a calibrated stake size of ${risk.recommendedStake.toFixed(2)} dollars.`;
    this.speak(text, { personaId: 'quant', interrupt: true });
  }

  public speakTradeExecuted(direction: 'RISE' | 'FALL' | string, symbol: string, stake: number) {
    const msg = `Order executed: ${direction} position confirmed on ${symbol}, stake ${stake.toFixed(2)} dollars. Dynamic monitoring engaged.`;
    this.speak(msg, { interrupt: false });
  }

  public speakTradeResult(won: boolean, profit: number, symbol?: string, exitReason?: string) {
    const asset = symbol ? `on ${symbol}` : '';
    if (won) {
      const msg = `Position closed. Victory achieved ${asset}. Net realized profit of ${profit.toFixed(2)} dollars added to balance.`;
      this.speak(msg, { interrupt: true });
    } else {
      const reasonNote = exitReason === 'TRAILING_STOP' ? 'Trailing stop loss capped the downside.' : 'Risk buffers engaged.';
      const msg = `Position closed at loss ${asset}. Stake of ${Math.abs(profit).toFixed(2)} dollars absorbed. ${reasonNote}`;
      this.speak(msg, { interrupt: true });
    }
  }

  public speakTrailingStopUpdate(
    action: 'RATCHET' | 'TRIGGERED',
    stopPrice: number,
    lockedProfit: number
  ) {
    if (action === 'RATCHET') {
      const msg = `Trailing stop ratcheted to ${stopPrice.toFixed(2)}. Securing ${lockedProfit.toFixed(2)} dollars in locked profit.`;
      this.speak(msg, { personaId: 'sniper', interrupt: false });
    } else {
      const msg = `Trailing stop triggered at ${stopPrice.toFixed(2)}. Locked profit of ${lockedProfit.toFixed(2)} dollars secured.`;
      this.speak(msg, { personaId: 'quant', interrupt: true });
    }
  }

  public speakDrawdownWarning(drawdownPercent: number) {
    const msg = `Drawdown warning: Session drawdown reached ${drawdownPercent.toFixed(1)} percent. Risk mitigation engaged.`;
    this.speak(msg, { personaId: 'quant', interrupt: true });
  }

  public speakStrategyUpdate(ruleSummary: string) {
    const msg = `Strategy updated: ${ruleSummary}`;
    this.speak(msg, { personaId: 'cyber', interrupt: false });
  }
}

export const voice = new VoiceEngine();
