import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  BarChart2,
  FileText,
  Sliders,
  RefreshCw,
  Zap,
  Mic,
  MicOff,
  Cpu,
  CheckCircle2,
} from 'lucide-react';
import {
  Candle,
  TechnicalIndicators,
  TradeRecord,
  AIPredictionResult,
  MarketRegime,
  BotState,
} from '../types/trading';
import { sound } from '../lib/soundEngine';
import { MarkdownRenderer } from './MarkdownRenderer';
import { voiceInput } from '../lib/voiceInputEngine';

interface SystemCopilotBottomSheetProps {
  symbol: string;
  currentPrice: number;
  timeframe?: string;
  candles: Candle[];
  indicators: TechnicalIndicators | null;
  regime: MarketRegime | null;
  aiPrediction: AIPredictionResult | null;
  openTrades: TradeRecord[];
  closedTrades: TradeRecord[];
  balance: number;
  stake: number;
  botState: BotState;
  isLiveMode: boolean;
  currency?: string;
  latencyMs?: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

interface OperationalActivity {
  step: string;
  tool: string;
  label: string;
  detail: string;
  status: 'running' | 'completed';
  timestamp: string;
}

export const SystemCopilotBottomSheet: React.FC<SystemCopilotBottomSheetProps> = ({
  symbol,
  currentPrice,
  timeframe = '1m',
  candles,
  indicators,
  regime,
  aiPrediction,
  openTrades,
  closedTrades,
  balance,
  stake,
  botState,
  isLiveMode,
  currency = 'USD',
  latencyMs = 45,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeActivities, setActiveActivities] = useState<OperationalActivity[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [interimVoiceText, setInterimVoiceText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const totalPnL = closedTrades.reduce((acc, t) => acc + (t.profit || 0), 0);
  const winCount = closedTrades.filter((t) => t.result === 'WIN').length;
  const winRate = closedTrades.length > 0 ? (winCount / closedTrades.length) * 100 : 66.7;

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      role: 'assistant',
      content: `### ⚡ SBAgent Quant Copilot

Terminal Synchronized on **${symbol}** (Spot: **${currentPrice}**).
- **RSI (14)**: **${indicators?.rsiNow ? indicators.rsiNow.toFixed(1) : '50.0'}**
- **Regime**: **${regime?.type || regime?.state || 'NORMAL'}**
- **Dynamic Stake**: **$${stake.toFixed(2)}** | **Session P&L**: **$${totalPnL.toFixed(2)}**

How can I assist your execution or risk audit?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const quickActions = [
    { label: '📊 Analyze Market', prompt: 'Analyze current market structure, volatility, and key dynamic levels for this symbol.' },
    { label: '🧠 Explain Signal', prompt: 'Explain the current composite indicator consensus and latest AI confidence score.' },
    { label: '🛡️ Risk Check', prompt: 'Perform a comprehensive risk audit of my current session P&L, stake sizing, and stop loss rules.' },
    { label: '💥 Prompt Stress Test', prompt: 'Execute a portfolio stress test simulating a 3-trade losing streak under current volatility and evaluate Kelly Criterion defense.' },
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [isOpen, messages, isLoading, activeActivities]);

  // Voice Input Setup
  useEffect(() => {
    const unsubVoice = voiceInput.subscribe((listening, transcript, isFinal) => {
      setIsListening(listening);
      setInterimVoiceText(transcript);
      if (isFinal && transcript.trim()) {
        setInput(transcript.trim());
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

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = (customPrompt || input).trim();
    if (!textToSend || isLoading) return;

    sound.play('click');
    if (isListening) {
      voiceInput.stop();
    }

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setInterimVoiceText('');
    setIsLoading(true);
    setActiveActivities([]);

    const fullContext = {
      symbol,
      currentPrice,
      price: currentPrice,
      timeframe,
      candlesCount: candles.length,
      signals: {
        rsi: indicators?.rsiNow,
        ma14: indicators?.ma14Now,
        ma50: indicators?.ma50Now,
        macd: indicators?.macdNow,
        atr: indicators?.atrNow,
        pattern: indicators?.pattern?.pattern,
        volatility: indicators?.volatility,
      },
      activePositionsCount: openTrades.length,
      winRate,
      pnl: totalPnL.toFixed(2),
      balance,
      currentStake: stake,
      riskSettings: {
        maxDailyLoss: botState.maxDailyLoss,
        maxConsecutiveLosses: botState.maxConsecutiveLosses,
      },
      executionMode: isLiveMode ? 'REAL' : 'DEMO',
      botActive: botState.enabled,
      connectionStatus: 'ONLINE',
      latencyMs,
      regime: regime?.type || regime?.state || 'NORMAL_VOLATILITY',
      aiPrediction,
    };

    // Attempt Real Activity Streaming SSE first
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const res = await fetch('/api/ai/chat-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          context: fullContext,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error('Streaming unavailable');
      }

      const reader = res.body.getReader();
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
                      id: `ast_${Date.now()}`,
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
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (streamErr) {
      // Standard fetch fallback
      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
            context: fullContext,
          }),
        });

        const data = await res.json();
        const assistantMsg: ChatMessage = {
          id: `ast_${Date.now()}`,
          role: 'assistant',
          content: data.message || 'Analysis complete.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        setMessages((prev) => [...prev, assistantMsg]);
        sound.play('toggle');
      } catch (err) {
        console.warn('Copilot request failed:', err);
        const errorMsg: ChatMessage = {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: `Quantitative Strategist: Spot price is ${currentPrice} with RSI at ${
            indicators?.rsiNow ? indicators.rsiNow.toFixed(1) : 50
          }. Keep risk controlled and maintain stop loss discipline.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } finally {
      setIsLoading(false);
      setActiveActivities([]);
    }
  };

  return (
    <>
      {/* Persistent Mobile Floating Action Button (FAB) */}
      {!isOpen && (
        <div
          className="fixed bottom-safe right-4 z-40"
          style={{
            bottom: 'calc(18px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <button
            onClick={() => {
              sound.play('click');
              setIsOpen(true);
            }}
            className="group relative flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 text-white font-medium text-xs rounded-full shadow-lg shadow-cyan-500/25 border border-cyan-400/40 hover:scale-105 active:scale-95 transition-all duration-200"
          >
            <div className="relative">
              <Sparkles className="w-4 h-4 text-cyan-200 group-hover:rotate-12 transition-transform duration-300" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full" />
            </div>
            <span className="font-semibold tracking-wide pr-1">SBAgent AI</span>
          </button>
        </div>
      )}

      {/* Slide-Up Bottom Sheet Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-fadeIn">
          {/* Backdrop click to dismiss */}
          <div className="flex-1" onClick={() => setIsOpen(false)} />

          <div className="w-full max-w-xl mx-auto bg-slate-900 border-t border-slate-700 rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] h-[650px] overflow-hidden">
            {/* Drag Handle & Header */}
            <div className="px-4 pt-3 pb-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white font-mono tracking-wider">
                    SBAGENT COPILOT
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Real-Time Operational Activity & Quant Matrix
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Action Chips Row */}
            <div className="px-3 py-2 bg-slate-900/80 border-b border-slate-800/60 overflow-x-auto no-scrollbar flex items-center gap-1.5 shrink-0">
              {quickActions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(action.prompt)}
                  disabled={isLoading}
                  className="px-2.5 py-1 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 text-[11px] font-sans font-medium whitespace-nowrap active:scale-95 transition-all disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
            </div>

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 font-sans text-xs">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${
                    msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                      msg.role === 'user'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                    }`}
                  >
                    {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                  </div>

                  <div
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-cyan-600 text-white rounded-tr-sm shadow-md'
                        : 'bg-slate-950/80 text-slate-200 border border-slate-800 rounded-tl-sm shadow-sm'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <div>{msg.content}</div>
                    ) : (
                      <MarkdownRenderer content={msg.content} />
                    )}
                    <span className="block text-[9px] text-slate-400/80 mt-1 text-right font-mono">
                      {msg.timestamp}
                    </span>
                  </div>
                </div>
              ))}

              {/* Real Operational Activity Stream */}
              {isLoading && (
                <div className="flex flex-col gap-1.5 my-1 ml-9">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                    <span>Real Tool Execution Stream</span>
                  </div>

                  {activeActivities.length === 0 ? (
                    <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-400 flex items-center gap-2 text-xs">
                      <Cpu className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                      <span>Ingesting live tick deltas & computing consensus...</span>
                    </div>
                  ) : (
                    activeActivities.map((act) => (
                      <div
                        key={act.step}
                        className="p-2 rounded-lg border border-slate-800 bg-slate-950/90 flex items-start gap-2 text-xs animate-fadeIn"
                      >
                        {act.status === 'completed' ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5" />
                        ) : (
                          <Cpu className="w-3 h-3 text-cyan-400 mt-0.5 animate-spin" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-semibold text-slate-200">{act.label}</span>
                            <span className="font-mono text-slate-500">{act.timestamp}</span>
                          </div>
                          <p className="font-mono text-[9px] text-cyan-300/80 truncate">
                            {act.detail}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Voice Preview Bar */}
            {isListening && (
              <div className="px-3 py-1.5 bg-cyan-950/50 border-t border-cyan-500/30 flex items-center justify-between text-cyan-300 text-xs font-mono shrink-0">
                <div className="flex items-center gap-2">
                  <Mic className="w-3.5 h-3.5 text-rose-400 animate-bounce" />
                  <span className="truncate">Listening: "{interimVoiceText || 'Speak command...'}"</span>
                </div>
                <button onClick={() => voiceInput.stop()} className="text-[10px] text-rose-400">
                  Stop
                </button>
              </div>
            )}

            {/* Input Form */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 shrink-0 pb-safe">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <button
                  type="button"
                  onClick={() => voiceInput.toggle()}
                  className={`p-2.5 rounded-xl border transition-colors ${
                    isListening
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/50 animate-pulse'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-cyan-400'
                  }`}
                  title="Voice Command"
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`Ask SBAgent about ${symbol}, risks, or signals...`}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-sans"
                />

                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="p-2.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-40 text-white rounded-xl active:scale-95 transition-all shadow-md"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
