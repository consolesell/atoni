import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Bot,
  User,
  Trash2,
  Mic,
  MicOff,
  Activity,
  ShieldAlert,
  TrendingUp,
  Cpu,
  Layers,
  Flame,
  CheckCircle2,
  Terminal,
  Maximize2,
  Volume2,
  VolumeX,
  Square,
  Radio,
  X,
} from 'lucide-react';
import { MarketRegime, TechnicalIndicators } from '../types/trading';
import { MarkdownRenderer } from './MarkdownRenderer';
import { voiceInput } from '../lib/voiceInputEngine';
import { sound } from '../lib/soundEngine';
import { voice } from '../lib/voiceEngine';
import { VoiceWaveform, VoiceTalkingRadar } from './VoiceWaveformIndicator';

interface AICopilotChatProps {
  symbol: string;
  currentPrice: number;
  regime: MarketRegime;
  indicators: TechnicalIndicators | null;
  botEnabled: boolean;
  pnl: number;
  onExpandFullscreen?: () => void;
  winRate?: number;
  maxDrawdown?: number;
  profitFactor?: number;
  currentStake?: number;
  balance?: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

export interface OperationalActivity {
  step: string;
  tool: string;
  label: string;
  detail: string;
  status: 'running' | 'completed';
  timestamp: string;
}

export const AICopilotChat: React.FC<AICopilotChatProps> = ({
  symbol,
  currentPrice,
  regime,
  indicators,
  botEnabled,
  pnl,
  onExpandFullscreen,
  winRate = 66.7,
  maxDrawdown = 0.0,
  profitFactor = 1.85,
  currentStake = 5.0,
  balance = 10000,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `### ⚡ SBAgent Autonomous Quantitative Co-Pilot

Greetings! I am **SBAgent**, engineered by **Givan (Kingvan)**. I continuously ingest live ticks on **${symbol}**, audit dynamic Half-Kelly stakes, and track pattern geometries in real time.

| Metric | Live Terminal Value | Operational Baseline |
| :--- | :--- | :--- |
| **Spot Price** | **${currentPrice}** | Low-Latency Ticker |
| **RSI (14)** | **${indicators?.rsiNow?.toFixed(1) || '50.0'}** | Momentum Filter |
| **Market Regime** | **${regime?.type || 'EQUILIBRIUM'}** | Structural Scan |
| **Session P&L** | **$${pnl.toFixed(2)}** | Win Rate: **${winRate}%** |

Select an action chip below or speak hands-free via the microphone:`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeActivities, setActiveActivities] = useState<OperationalActivity[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [interimVoiceText, setInterimVoiceText] = useState('');
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sbagent_chat_autospeak') === 'true';
    } catch {
      return false;
    }
  });
  const [speakingMessageIdx, setSpeakingMessageIdx] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const unsub = voice.subscribeSpeaking((speaking) => {
      if (!speaking) {
        setSpeakingMessageIdx(null);
      }
    });
    return () => unsub();
  }, []);

  const toggleAutoSpeak = () => {
    const next = !autoSpeak;
    setAutoSpeak(next);
    sound.play('toggle');
    try {
      localStorage.setItem('sbagent_chat_autospeak', String(next));
    } catch {}
  };

  const handleSpeakMessage = (index: number, content: string) => {
    sound.play('click');
    if (speakingMessageIdx === index && voice.getIsSpeaking()) {
      voice.stop();
      setSpeakingMessageIdx(null);
    } else {
      setSpeakingMessageIdx(index);
      voice.speak(content, {
        interrupt: true,
        onEnd: () => setSpeakingMessageIdx(null),
      });
    }
  };

  const actionChips = [
    { label: '👋 Say Hello & Chat', prompt: 'Hello sbagent! How are you doing today? What is on your mind right now?' },
    { label: '⚡ Blackbox Status', prompt: 'Provide a real-time status check of the Blackbox architecture, market stability, and active pipelines.' },
    { label: '📊 Analyze Market', prompt: 'Analyze current market structure, volatility, and key dynamic levels for this symbol.' },
    { label: '🧠 Explain Signal', prompt: 'Explain the current composite indicator consensus and latest AI confidence score.' },
    { label: '🛡️ Risk & Recovery', prompt: 'Perform a comprehensive risk audit of my session P&L, $10 balance anchor, and Martingale recovery status.' },
    { label: '💡 Trader Philosophy', prompt: 'Share an inspiring quantitative philosophy or trading insight with me.' },
    { label: '📈 Analyze Trend', prompt: 'What is the dominant trend across MA14 and MA50, and are we near an exhaustion point?' },
    { label: '⚙️ Review Config', prompt: 'Review my auto-trading bot settings and recommend optimal risk adjustments.' },
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, activeActivities]);

  // Setup Voice Input listeners
  useEffect(() => {
    setVoiceAvailable(voiceInput.isSupported());

    const unsubVoice = voiceInput.subscribe((listening, transcript, isFinal) => {
      setIsListening(listening);
      setInterimVoiceText(transcript);
      if (isFinal && transcript.trim()) {
        setInputPrompt(transcript.trim());
      }
    });

    const unsubCommand = voiceInput.subscribeCommand((match) => {
      handleSendMessage(match.mappedPrompt);
    });

    return () => {
      unsubVoice();
      unsubCommand();
    };
  }, []);

  const toggleVoice = () => {
    if (!voiceAvailable) {
      setVoiceNotice('Speech Recognition is not supported in this browser. Please try Chrome, Edge, or Safari.');
      setTimeout(() => setVoiceNotice(null), 4000);
      return;
    }
    voiceInput.toggle();
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputPrompt).trim();
    if (!text || isLoading) return;

    sound.play('click');
    if (isListening) {
      voiceInput.stop();
    }

    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputPrompt('');
    setInterimVoiceText('');
    setIsLoading(true);
    setActiveActivities([]);

    const payloadContext = {
      symbol,
      currentPrice,
      price: currentPrice,
      regime: regime?.type,
      botActive: botEnabled,
      pnl: pnl.toFixed(2),
      balance,
      currentStake,
      winRate,
      profitFactor,
      maxDrawdown,
      signals: {
        rsi: indicators?.rsiNow,
        ma14: indicators?.ma14Now,
        ma50: indicators?.ma50Now,
        pattern: indicators?.pattern?.pattern,
        volatility: indicators?.volatility,
      },
    };

    // Attempt Real Activity Streaming SSE first
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const response = await fetch('/api/ai/chat-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory.map((m) => ({ role: m.role, content: m.content })),
          context: payloadContext,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error('Streaming connection failed, falling back to synchronous chat.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let streamedAssistantText = '';
      let hasAddedAssistantPlaceholder = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const textChunk = decoder.decode(value, { stream: true });
        const lines = textChunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'activity') {
                setActiveActivities((prev) => {
                  const filtered = prev.filter((a) => a.step !== data.step);
                  return [
                    ...filtered,
                    {
                      step: data.step,
                      tool: data.tool,
                      label: data.label,
                      detail: data.detail,
                      status: data.status,
                      timestamp: data.timestamp,
                    },
                  ];
                });
              } else if (data.type === 'chunk') {
                streamedAssistantText += data.text;
                if (!hasAddedAssistantPlaceholder) {
                  hasAddedAssistantPlaceholder = true;
                  setMessages((prev) => [
                    ...prev,
                    {
                      role: 'assistant',
                      content: streamedAssistantText,
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      isStreaming: true,
                    },
                  ]);
                } else {
                  setMessages((prev) => {
                    const lastIdx = prev.length - 1;
                    const updated = [...prev];
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      content: streamedAssistantText,
                    };
                    return updated;
                  });
                }
              } else if (data.type === 'done') {
                setMessages((prev) => {
                  const lastIdx = prev.length - 1;
                  const updated = [...prev];
                  if (updated[lastIdx]?.role === 'assistant') {
                    updated[lastIdx].isStreaming = false;
                  }
                  return updated;
                });
                sound.play('toggle');
                if (autoSpeak && streamedAssistantText) {
                  voice.speak(streamedAssistantText, { interrupt: true });
                }
              }
            } catch (err) {
              // Ignore non-json lines
            }
          }
        }
      }
    } catch (streamErr: any) {
      console.warn('Falling back to standard chat endpoint:', streamErr?.message);
      // Fallback to standard chat endpoint
      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: newHistory.map((m) => ({ role: m.role, content: m.content })),
            context: payloadContext,
          }),
        });

        const data = await res.json();
        if (data.success && data.message) {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: data.message,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
          sound.play('toggle');
          if (autoSpeak && data.message) {
            voice.speak(data.message, { interrupt: true });
          }
        } else {
          throw new Error(data.error || 'No response returned');
        }
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `**Connection Notice**: SBAgent encountered an execution error: ${
              err.message || 'System busy'
            }. Please re-verify network or API settings.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } finally {
      setIsLoading(false);
      setActiveActivities([]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/95 border border-slate-800 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-slate-950/90 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-xs sm:text-sm text-white font-mono tracking-wider truncate">
                SBAGENT QUANTITATIVE CO-PILOT
              </h3>
              <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                STREAMING SSE
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 font-mono truncate">
              Continuous multi-agent deliberation, Kelly stake auditing & pattern recognition
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={toggleAutoSpeak}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono transition-all border ${
              autoSpeak
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border-slate-800'
            }`}
            title={autoSpeak ? 'Auto-Speak: Active (Agent reads replies)' : 'Auto-Speak: Off'}
          >
            {autoSpeak ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                <span className="hidden md:inline text-[10px] font-semibold text-cyan-300">AUTO-VOICE</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5" />
                <span className="hidden md:inline text-[10px]">VOICE OFF</span>
              </>
            )}
          </button>

          {onExpandFullscreen && (
            <button
              onClick={onExpandFullscreen}
              className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800/80 rounded-lg transition-colors"
              title="Expand to Fullscreen Workspace"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setMessages([])}
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded-lg transition-colors"
            title="Clear Conversation History"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 flex flex-col gap-3.5 font-sans text-xs scrollbar-thin scrollbar-thumb-slate-800">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex items-start gap-2.5 sm:gap-3 ${
              msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            {msg.role === 'assistant' && speakingMessageIdx === i ? (
              <VoiceTalkingRadar isSpeaking={true} size="sm" className="shrink-0" />
            ) : (
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-slate-900 text-cyan-400 border border-slate-800'
                }`}
              >
                {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>
            )}

            <div
              className={`p-3.5 sm:p-4 rounded-2xl max-w-[90%] sm:max-w-[85%] leading-relaxed transition-all ${
                msg.role === 'user'
                  ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-500/30 rounded-tr-none text-xs sm:text-sm font-sans'
                  : speakingMessageIdx === i
                  ? 'bg-slate-950/90 text-slate-200 border border-cyan-500/50 shadow-md shadow-cyan-950/50 rounded-tl-none ring-1 ring-cyan-500/30'
                  : 'bg-slate-950/80 text-slate-200 border border-slate-800 rounded-tl-none'
              }`}
            >
              {msg.role === 'user' ? (
                <div>{msg.content}</div>
              ) : (
                <MarkdownRenderer content={msg.content} />
              )}
              <div
                className={`text-[9px] font-mono mt-1 text-right flex items-center justify-end gap-1.5 ${
                  msg.role === 'user' ? 'text-cyan-300/60' : 'text-slate-500'
                }`}
              >
                {msg.role === 'assistant' && !msg.isStreaming && (
                  <button
                    onClick={() => handleSpeakMessage(i, msg.content)}
                    className={`px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 ${
                      speakingMessageIdx === i
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-cyan-300 hover:bg-slate-800'
                    }`}
                    title={speakingMessageIdx === i ? 'Stop Reading' : 'Listen to SBAgent Voice'}
                  >
                    {speakingMessageIdx === i ? (
                      <>
                        <Square className="w-2.5 h-2.5 fill-current text-cyan-300" />
                        <VoiceWaveform barCount={4} height="xs" color="cyan" active={true} />
                        <span className="text-cyan-300 font-bold text-[9px] tracking-wider">READING</span>
                      </>
                    ) : (
                      <Volume2 className="w-3 h-3" />
                    )}
                  </button>
                )}
                {msg.isStreaming && (
                  <span className="inline-flex items-center gap-1 text-cyan-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    streaming...
                  </span>
                )}
                <span>{msg.timestamp}</span>
              </div>
            </div>
          </div>
        ))}

        {/* Real Activity Streaming over Canned Loaders */}
        {isLoading && (
          <div className="flex flex-col gap-2 my-1">
            <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-400 uppercase tracking-wider pl-10">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>Real Operational Activity Stream</span>
            </div>

            <div className="ml-10 flex flex-col gap-1.5">
              {activeActivities.length === 0 ? (
                <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl text-slate-400 flex items-center gap-2 text-xs">
                  <Cpu className="w-4 h-4 text-cyan-400 animate-spin" />
                  <span>SBAgent is querying market nodes and synthesizing multi-agent consensus...</span>
                </div>
              ) : (
                activeActivities.map((act) => (
                  <div
                    key={act.step}
                    className="p-2.5 rounded-xl border border-slate-800/90 bg-slate-950/90 flex items-start gap-2.5 text-xs shadow-sm animate-fadeIn"
                  >
                    <div className="mt-0.5 shrink-0">
                      {act.status === 'completed' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Cpu className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-200 text-[11px]">
                          {act.label}
                        </span>
                        <span className="font-mono text-[9px] text-slate-500">{act.timestamp}</span>
                      </div>
                      <p className="font-mono text-[10px] text-cyan-300/80 truncate mt-0.5">
                        {act.detail}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Strategic Action Chips */}
      <div className="px-3 sm:px-4 py-2 bg-slate-950/70 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-[11px] font-mono shrink-0">
        <span className="text-slate-500 shrink-0 text-[10px]">Action Chips:</span>
        {actionChips.map((chip, idx) => (
          <button
            key={idx}
            disabled={isLoading}
            onClick={() => handleSendMessage(chip.prompt)}
            className="px-2.5 py-1 bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/40 rounded-lg shrink-0 transition-colors disabled:opacity-50 text-[11px]"
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Voice Interim Transcription Bar */}
      {isListening && (
        <div className="px-4 py-2 bg-cyan-950/40 border-t border-cyan-500/40 flex items-center justify-between gap-2 text-cyan-300 text-xs font-mono shrink-0 animate-pulse">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-rose-400 animate-bounce" />
            <span>Listening... "{interimVoiceText || 'Speak your strategic trading prompt'}"</span>
          </div>
          <button
            onClick={() => voiceInput.stop()}
            className="text-[10px] text-rose-400 underline hover:text-rose-300 font-sans"
          >
            Stop Mic
          </button>
        </div>
      )}

      {/* Voice Notice Alert */}
      {voiceNotice && (
        <div className="px-4 py-2 bg-amber-950/60 border-t border-amber-500/40 text-amber-300 text-xs font-mono flex items-center justify-between shrink-0">
          <span>{voiceNotice}</span>
          <button onClick={() => setVoiceNotice(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="p-3 sm:p-4 bg-slate-950/90 border-t border-slate-800 flex items-center gap-2 shrink-0"
      >
        <button
          type="button"
          onClick={toggleVoice}
          title={isListening ? 'Stop Voice Input' : 'Voice Input (Hands-free)'}
          className={`p-2.5 rounded-xl border transition-all ${
            isListening
              ? 'bg-rose-500/20 text-rose-400 border-rose-500/50 shadow-md shadow-rose-500/20 animate-pulse'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-cyan-400 hover:border-cyan-500/40'
          }`}
        >
          {isListening ? <MicOff className="w-4 h-4 text-rose-400" /> : <Mic className="w-4 h-4" />}
        </button>

        <input
          type="text"
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          placeholder={`Ask SBAgent about ${symbol}, indicators, or execute action chips...`}
          className="flex-1 bg-slate-900 border border-slate-800 hover:border-cyan-500/50 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-slate-100 placeholder-slate-500 text-xs sm:text-sm rounded-xl px-4 py-2.5 outline-none transition-all font-sans"
        />

        <button
          type="submit"
          disabled={!inputPrompt.trim() || isLoading}
          className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 text-slate-950 font-bold rounded-xl text-xs sm:text-sm font-mono flex items-center gap-1.5 transition-all shadow-md shadow-cyan-500/20 shrink-0"
        >
          <span>Send</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
