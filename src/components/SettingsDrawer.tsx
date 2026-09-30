import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  ChevronRight,
  ArrowLeft,
  Sliders,
  BarChart3,
  Activity,
  Sparkles,
  Zap,
  ShieldAlert,
  Palette,
  Database,
  Wifi,
  RotateCcw,
  Check,
  ExternalLink,
  Volume2,
  VolumeX,
  Bot,
  Compass,
  Headphones,
  Play,
  Square,
  Mic,
  Radio,
  Lock,
  DollarSign,
  Clock,
  Key,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Layers,
  Settings,
  HelpCircle,
  AlertTriangle,
  FileText,
  Upload,
  Download,
  Flame,
} from 'lucide-react';
import { BotState, TechnicalIndicators, MarketRegime, CoreRiskMetrics, TradeRecord, TrailingStopConfig } from '../types/trading';
import { sound } from '../lib/soundEngine';
import { voice, AGENT_PERSONAS, AgentVoicePersonaId, VoiceEngineState } from '../lib/voiceEngine';
import { useTerminalSettings } from '../context/TerminalSettingsContext';
import { SubAgentSettingsView } from './SubAgentSettingsView';
import { SpatialProcessingMetricsView } from './SpatialProcessingMetricsView';
import { ThemeSelectorPanel } from './ThemeSelectorPanel';
import { SymbolPerformanceMatrix } from './SymbolPerformanceMatrix';
import { VoiceWaveform } from './VoiceWaveformIndicator';
import { derivWS } from '../lib/derivWS';

export type SettingsCategory =
  | 'overview'
  | 'general'
  | 'theme'
  | 'trading'
  | 'risk'
  | 'trailingStop'
  | 'indicators'
  | 'performance'
  | 'sbagent'
  | 'spatial'
  | 'ai'
  | 'voice'
  | 'interface'
  | 'connection'
  | 'data';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  stake: number;
  onStakeChange: (s: number) => void;
  duration: number;
  onDurationChange: (d: number) => void;
  isLiveMode: boolean;
  onToggleLiveMode: () => void;
  botState: BotState;
  onUpdateBotState: (updates: Partial<BotState>) => void;
  selectedSymbol: string;
  onSymbolChange: (sym: string) => void;
  granularity: number;
  onGranularityChange: (g: number) => void;
  onOpenTokenModal: () => void;
  latencyMs: number;
  onRefreshBalance: () => void;
  closedTradesCount: number;
  closedTrades?: TradeRecord[];
  currency?: string;
  onClearHistory?: () => void;
  indicators?: TechnicalIndicators | null;
  currentPrice?: number;
  regime?: MarketRegime;
  riskMetrics?: CoreRiskMetrics;
  isAutonomousRunning?: boolean;
  onToggleAutonomous?: () => void;
  onOpenSubAgentModal?: () => void;
  initialCategory?: SettingsCategory;
  trailingStopConfig?: TrailingStopConfig;
  onTrailingStopConfigChange?: (config: TrailingStopConfig) => void;
  onReplenishVirtualAnchor?: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  stake,
  onStakeChange,
  duration,
  onDurationChange,
  isLiveMode,
  onToggleLiveMode,
  botState,
  onUpdateBotState,
  selectedSymbol,
  onSymbolChange,
  granularity,
  onGranularityChange,
  onOpenTokenModal,
  latencyMs,
  onRefreshBalance,
  closedTradesCount,
  closedTrades = [],
  currency = 'USD',
  onClearHistory,
  indicators = null,
  currentPrice = 0,
  regime,
  riskMetrics,
  isAutonomousRunning,
  onToggleAutonomous,
  onOpenSubAgentModal,
  initialCategory = 'overview',
  trailingStopConfig,
  onTrailingStopConfigChange,
  onReplenishVirtualAnchor,
}) => {
  const {
    settings,
    updateGeneral,
    updateRisk,
    updateTrailingStop,
    updateIndicators,
    updateAI,
    updateAudio,
    updateConnection,
    updateInterface,
    resetToDefaults,
    exportSettingsJSON,
    importSettingsJSON,
  } = useTerminalSettings();

  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(initialCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [importJsonText, setImportJsonText] = useState('');
  const [importNotice, setImportNotice] = useState<{ success: boolean; message: string } | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceEngineState>(() => voice.getState());
  const [isTestingPing, setIsTestingPing] = useState(false);
  const [pingTestLatency, setPingTestLatency] = useState<number | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  React.useEffect(() => {
    const unsub = voice.subscribeState((st) => setVoiceState({ ...st }));
    return () => unsub();
  }, []);

  React.useEffect(() => {
    if (isOpen && initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [isOpen, initialCategory]);

  // Available markets
  const symbols = [
    { code: '1HZ10V', name: 'Volatility 10 (1s)' },
    { code: 'R_10', name: 'Volatility 10' },
    { code: '1HZ25V', name: 'Volatility 25 (1s)' },
    { code: 'R_25', name: 'Volatility 25' },
    { code: '1HZ50V', name: 'Volatility 50 (1s)' },
    { code: 'R_50', name: 'Volatility 50' },
    { code: '1HZ75V', name: 'Volatility 75 (1s)' },
    { code: 'R_75', name: 'Volatility 75' },
    { code: '1HZ100V', name: 'Volatility 100 (1s)' },
    { code: 'R_100', name: 'Volatility 100' },
  ];

  // Categories list
  const categories: {
    id: SettingsCategory;
    title: string;
    description: string;
    icon: any;
    color: string;
  }[] = [
    {
      id: 'general',
      title: 'General Execution',
      description: 'Default stakes, expiry durations, directions & market pairs',
      icon: Sliders,
      color: 'text-cyan-400 bg-cyan-500/10',
    },
    {
      id: 'risk',
      title: 'Risk & Capital Shield',
      description: 'Max daily loss, Kelly sizing, $10 virtual anchor & loss streak guard',
      icon: ShieldAlert,
      color: 'text-rose-400 bg-rose-500/10',
    },
    {
      id: 'trailingStop',
      title: 'Trailing Stop & Profit Lock',
      description: 'Dynamic ATR/percent distance ratchet & automated gain locks',
      icon: ShieldCheck,
      color: 'text-amber-400 bg-amber-500/10',
    },
    {
      id: 'indicators',
      title: 'Technical Indicators',
      description: 'Custom RSI, Bollinger Bands, Moving Averages & ATR periods',
      icon: Activity,
      color: 'text-teal-400 bg-teal-500/10',
    },
    {
      id: 'ai',
      title: 'Autonomous Bot & SBAgent',
      description: 'AI confidence gates, guardrails, rotation cooldown & Martingale reasoning',
      icon: Bot,
      color: 'text-indigo-400 bg-indigo-500/10',
    },
    {
      id: 'voice',
      title: 'Agent Voice & Cadence',
      description: 'Voice pitch, speed slider, personas & speech synthesis calibration',
      icon: Headphones,
      color: 'text-sky-400 bg-sky-500/10',
    },
    {
      id: 'theme',
      title: 'Themes & Visuals',
      description: 'Dark Neon, Ocean, Forest, Sunset, Light, Purple & accents',
      icon: Palette,
      color: 'text-pink-400 bg-pink-500/10',
    },
    {
      id: 'performance',
      title: 'Market Win/Loss Matrix',
      description: 'Individual symbol win/loss metrics & manual rotation telemetry',
      icon: BarChart3,
      color: 'text-emerald-400 bg-emerald-500/10',
    },
    {
      id: 'sbagent',
      title: 'sbagent.md Configuration',
      description: 'Autonomous strategy rules, symbol rotation & hot-reload',
      icon: Sparkles,
      color: 'text-cyan-400 bg-cyan-500/10',
    },
    {
      id: 'spatial',
      title: 'Spatial Processing Metrics',
      description: 'Phase-space vector field, latency breakdown & entropy',
      icon: Compass,
      color: 'text-purple-400 bg-purple-500/10',
    },
    {
      id: 'interface',
      title: 'Interface & Display',
      description: 'Compact density mode, tick tapes, confluence pills & animations',
      icon: Layers,
      color: 'text-blue-400 bg-blue-500/10',
    },
    {
      id: 'connection',
      title: 'Connection & Network',
      description: 'Deriv App ID, live ping telemetry, reconnection backoff & failovers',
      icon: Wifi,
      color: 'text-emerald-400 bg-emerald-500/10',
    },
    {
      id: 'data',
      title: 'Data, Backup & Reset',
      description: 'JSON configuration export/import, trade cache & factory reset',
      icon: Database,
      color: 'text-amber-400 bg-amber-500/10',
    },
  ];

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase();
    return categories.filter(
      (cat) =>
        cat.title.toLowerCase().includes(q) ||
        cat.description.toLowerCase().includes(q) ||
        cat.id.toLowerCase().includes(q)
    );
  }, [searchQuery, categories]);

  const handleExportJSON = () => {
    try {
      const jsonStr = exportSettingsJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sbatomic_terminal_settings_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportNotice('Terminal settings exported successfully!');
      sound.play('win');
      setTimeout(() => setExportNotice(null), 3000);
    } catch (e: any) {
      setExportNotice(`Export failed: ${e?.message}`);
    }
  };

  const handleImportJSON = () => {
    if (!importJsonText.trim()) return;
    const res = importSettingsJSON(importJsonText);
    if (res.success) {
      setImportNotice({ success: true, message: 'Settings imported successfully!' });
      setImportJsonText('');
      setTimeout(() => setImportNotice(null), 3000);
    } else {
      setImportNotice({ success: false, message: res.error || 'Failed parsing JSON.' });
    }
  };

  const handleRunPingTest = () => {
    setIsTestingPing(true);
    setPingTestLatency(null);
    derivWS.refreshBalance();
    setTimeout(() => {
      setPingTestLatency(derivWS.getLastLatency());
      setIsTestingPing(false);
      sound.play('click');
    }, 450);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer Container */}
      <div className="relative w-full max-w-lg h-full bg-slate-900 border-l border-slate-800 flex flex-col shadow-2xl z-10 animate-slide-left text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800 bg-slate-950/80 pt-safe shrink-0">
          <div className="flex items-center gap-2">
            {activeCategory !== 'overview' ? (
              <button
                onClick={() => {
                  setActiveCategory('overview');
                  sound.play('click');
                }}
                className="p-1.5 -ml-1 text-slate-400 hover:text-white rounded-lg active:bg-slate-800 flex items-center gap-1.5 text-xs font-mono font-bold"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Categories</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold tracking-tight text-white font-sans">
                    Terminal Configuration Hub
                  </h2>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Single source of truth for execution & safety
                  </span>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Field */}
        <div className="p-3 border-b border-slate-800 bg-slate-900/50 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search settings (e.g. stake, bot, rsi, trailing, ping)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-sans"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-safe">
          {/* VIEW: OVERVIEW */}
          {activeCategory === 'overview' && (
            <div className="space-y-2">
              {filteredCategories.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setActiveCategory(cat.id);
                      sound.play('click');
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800/80 hover:border-slate-700 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${cat.color} shrink-0`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm text-slate-100 group-hover:text-cyan-300 transition-colors">
                          {cat.title}
                        </span>
                        <span className="text-xs text-slate-400 line-clamp-1">{cat.description}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {/* VIEW: GENERAL EXECUTION */}
          {activeCategory === 'general' && (
            <div className="space-y-4 font-sans text-xs">
              {/* Default Stake */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm text-slate-200 block">Default Stake ($ USD)</span>
                    <span className="text-[11px] text-slate-400">Baseline stake loaded on startup</span>
                  </div>
                  <span className="font-mono text-cyan-400 font-bold text-sm">
                    ${settings.general.defaultStake.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {[0.5, 1, 2, 5, 10].map((val) => (
                    <button
                      key={val}
                      onClick={() => {
                        updateGeneral({ defaultStake: val });
                        onStakeChange(val);
                        sound.play('click');
                      }}
                      className={`flex-1 py-1.5 rounded-lg font-mono font-bold text-xs transition-all ${
                        settings.general.defaultStake === val
                          ? 'bg-cyan-500 text-slate-950'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                      }`}
                    >
                      ${val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Default Expiry Duration */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm text-slate-200 block">Default Duration</span>
                    <span className="text-[11px] text-slate-400">Default expiry interval</span>
                  </div>
                  <span className="font-mono text-cyan-400 font-bold text-sm">
                    {settings.general.defaultDuration}{' '}
                    {settings.general.defaultDurationUnit === 'ticks'
                      ? 'ticks'
                      : settings.general.defaultDurationUnit === 'seconds'
                      ? 'sec'
                      : 'min'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-900 rounded-lg border border-slate-800 font-mono">
                  {(['ticks', 'seconds', 'minutes'] as const).map((unit) => (
                    <button
                      key={unit}
                      onClick={() => {
                        updateGeneral({ defaultDurationUnit: unit });
                        sound.play('click');
                      }}
                      className={`py-1 rounded text-center text-xs font-bold capitalize transition-all ${
                        settings.general.defaultDurationUnit === unit
                          ? 'bg-cyan-500 text-slate-950 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              </div>

              {/* Default Direction */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <span className="font-bold text-sm text-slate-200 block">Default Trade Bias</span>
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <button
                    onClick={() => {
                      updateGeneral({ defaultDirection: 'CALL' });
                      sound.play('click');
                    }}
                    className={`py-2 rounded-xl border font-bold flex items-center justify-center gap-1.5 transition-all ${
                      settings.general.defaultDirection === 'CALL'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>RISE (CALL)</span>
                  </button>
                  <button
                    onClick={() => {
                      updateGeneral({ defaultDirection: 'PUT' });
                      sound.play('click');
                    }}
                    className={`py-2 rounded-xl border font-bold flex items-center justify-center gap-1.5 transition-all ${
                      settings.general.defaultDirection === 'PUT'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    <TrendingDown className="w-3.5 h-3.5" />
                    <span>FALL (PUT)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: RISK & CAPITAL SHIELD */}
          {activeCategory === 'risk' && (
            <div className="space-y-4 font-sans text-xs">
              {/* Max Daily Loss */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Max Daily Loss Limit ($ USD)</span>
                  <span className="font-mono font-bold text-rose-400 text-sm">
                    ${settings.risk.maxDailyLoss}
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="200"
                  step="5"
                  value={settings.risk.maxDailyLoss}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    updateRisk({ maxDailyLoss: val });
                    onUpdateBotState({ maxDailyLoss: val });
                  }}
                  className="w-full accent-rose-500"
                />
                <p className="text-[11px] text-slate-400">
                  Bot will automatically stop if session loss exceeds this ceiling.
                </p>
              </div>

              {/* Max Daily Trades */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Max Daily Trades Cap</span>
                  <span className="font-mono font-bold text-cyan-400 text-sm">
                    {settings.risk.maxDailyTrades} trades
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="300"
                  step="10"
                  value={settings.risk.maxDailyTrades}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    updateRisk({ maxDailyTrades: val });
                    onUpdateBotState({ maxDailyTrades: val });
                  }}
                  className="w-full accent-cyan-500"
                />
              </div>

              {/* Position Sizing Mode */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <span className="font-bold text-slate-200 block">Position Sizing Algorithm</span>
                <div className="grid grid-cols-3 gap-1.5 font-mono text-xs">
                  {(['KELLY_HALF', 'KELLY_QUARTER', 'FIXED'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        updateRisk({ sizingMode: mode });
                        sound.play('click');
                      }}
                      className={`py-2 rounded-lg border text-center font-bold transition-all ${
                        settings.risk.sizingMode === mode
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      {mode === 'KELLY_HALF'
                        ? 'Half-Kelly'
                        : mode === 'KELLY_QUARTER'
                        ? 'Quarter-Kelly'
                        : 'Manual Fixed'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Virtual Account Anchor & Auto-Replenishment */}
              <div className="bg-emerald-950/30 p-4 rounded-xl border border-emerald-500/40 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-slate-100">Virtual Account Anchor Protocol</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Standardized virtual account balance is anchored at <strong>${settings.risk.virtualAnchorBalance.toFixed(2)} USD</strong>.
                  Depleted accounts automatically replenish back to $10 immediately.
                </p>
                {onReplenishVirtualAnchor && (
                  <button
                    onClick={() => {
                      onReplenishVirtualAnchor();
                      sound.play('win');
                    }}
                    className="w-full py-2 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 rounded-lg font-mono font-bold transition-all"
                  >
                    Force Replenish Virtual Anchor ($10.00 USD)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* VIEW: TRAILING STOP & PROFIT LOCK */}
          {activeCategory === 'trailingStop' && (
            <div className="space-y-4 font-sans text-xs">
              {/* Default Enable */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-200 block">Default Trailing Stop-Loss</span>
                    <span className="text-[11px] text-slate-400">Engage dynamic ratchet stop on new orders</span>
                  </div>
                  <button
                    onClick={() => {
                      const next = !settings.trailingStop.enabled;
                      updateTrailingStop({ enabled: next });
                      onTrailingStopConfigChange?.({
                        ...(trailingStopConfig || {}),
                        enabled: next,
                      } as TrailingStopConfig);
                      sound.play('toggle');
                    }}
                    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                      settings.trailingStop.enabled ? 'bg-amber-500' : 'bg-slate-800'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        settings.trailingStop.enabled ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Distance Type */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <span className="font-bold text-slate-200 block">Trailing Distance Calculation</span>
                <div className="grid grid-cols-3 gap-1.5 font-mono">
                  {(['ATR', 'PERCENT', 'POINTS'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        updateTrailingStop({ distanceType: type });
                        onTrailingStopConfigChange?.({
                          ...(trailingStopConfig || {}),
                          distanceType: type,
                        } as TrailingStopConfig);
                        sound.play('click');
                      }}
                      className={`py-1.5 rounded-lg border text-center font-bold text-xs transition-all ${
                        settings.trailingStop.distanceType === type
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Distance Value */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Trailing Distance Value</span>
                  <span className="font-mono font-bold text-amber-400 text-sm">
                    {settings.trailingStop.distanceValue} {settings.trailingStop.distanceType}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="5.0"
                  step="0.1"
                  value={settings.trailingStop.distanceValue}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    updateTrailingStop({ distanceValue: val });
                    onTrailingStopConfigChange?.({
                      ...(trailingStopConfig || {}),
                      distanceValue: val,
                    } as TrailingStopConfig);
                  }}
                  className="w-full accent-amber-500"
                />
              </div>

              {/* Profit Lock Automation */}
              <div className="bg-amber-950/30 p-4 rounded-xl border border-amber-500/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-400" />
                    <div>
                      <span className="font-bold text-slate-100 block">Profit Lock Automation</span>
                      <span className="text-[11px] text-slate-300">
                        Credit gains into main balance while position runs
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const next = !settings.trailingStop.profitLockEnabled;
                      updateTrailingStop({ profitLockEnabled: next });
                      onTrailingStopConfigChange?.({
                        ...(trailingStopConfig || {}),
                        profitLockEnabled: next,
                      } as TrailingStopConfig);
                      sound.play('toggle');
                    }}
                    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                      settings.trailingStop.profitLockEnabled ? 'bg-amber-500' : 'bg-slate-800'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        settings.trailingStop.profitLockEnabled ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-amber-500/20">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-300">Target Profit Lock Threshold:</span>
                    <span className="text-amber-400 font-bold">
                      {settings.trailingStop.profitLockThresholdPercent}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="80"
                    step="5"
                    value={settings.trailingStop.profitLockThresholdPercent}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateTrailingStop({ profitLockThresholdPercent: val });
                      onTrailingStopConfigChange?.({
                        ...(trailingStopConfig || {}),
                        profitLockThresholdPercent: val,
                      } as TrailingStopConfig);
                    }}
                    className="w-full accent-amber-400"
                  />
                </div>
              </div>
            </div>
          )}

          {/* VIEW: TECHNICAL INDICATORS */}
          {activeCategory === 'indicators' && (
            <div className="space-y-4 font-sans text-xs">
              {/* RSI Settings */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-100">Relative Strength Index (RSI)</span>
                  <span className="font-mono text-cyan-400 font-bold">
                    Period: {settings.indicators.rsiPeriod}
                  </span>
                </div>
                <input
                  type="range"
                  min="7"
                  max="28"
                  value={settings.indicators.rsiPeriod}
                  onChange={(e) => updateIndicators({ rsiPeriod: Number(e.target.value) })}
                  className="w-full accent-cyan-500"
                />
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-[11px] font-mono">
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-400">Overbought: {settings.indicators.rsiOverbought}</span>
                    <input
                      type="range"
                      min="65"
                      max="85"
                      value={settings.indicators.rsiOverbought}
                      onChange={(e) => updateIndicators({ rsiOverbought: Number(e.target.value) })}
                      className="accent-rose-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-400">Oversold: {settings.indicators.rsiOversold}</span>
                    <input
                      type="range"
                      min="15"
                      max="35"
                      value={settings.indicators.rsiOversold}
                      onChange={(e) => updateIndicators({ rsiOversold: Number(e.target.value) })}
                      className="accent-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Bollinger Bands Settings */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-100">Bollinger Bands (BB)</span>
                  <span className="font-mono text-sky-400 font-bold">
                    {settings.indicators.bbPeriod} bars • {settings.indicators.bbStdDev.toFixed(1)}σ
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-slate-400 font-mono text-[11px]">
                    <span>Period:</span>
                    <span>{settings.indicators.bbPeriod}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="40"
                    value={settings.indicators.bbPeriod}
                    onChange={(e) => updateIndicators({ bbPeriod: Number(e.target.value) })}
                    className="w-full accent-sky-500"
                  />
                  <div className="flex items-center justify-between text-slate-400 font-mono text-[11px]">
                    <span>Standard Deviation:</span>
                    <span>{settings.indicators.bbStdDev.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="3.0"
                    step="0.1"
                    value={settings.indicators.bbStdDev}
                    onChange={(e) => updateIndicators({ bbStdDev: parseFloat(e.target.value) })}
                    className="w-full accent-sky-500"
                  />
                </div>
              </div>

              {/* Moving Averages Settings */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-100">Dual Moving Averages</span>
                  <span className="font-mono text-amber-400 font-bold">
                    EMA {settings.indicators.fastMaPeriod} / SMA {settings.indicators.slowMaPeriod}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-400">Fast EMA: {settings.indicators.fastMaPeriod}</span>
                    <input
                      type="range"
                      min="5"
                      max="25"
                      value={settings.indicators.fastMaPeriod}
                      onChange={(e) => updateIndicators({ fastMaPeriod: Number(e.target.value) })}
                      className="accent-amber-400"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-400">Slow SMA: {settings.indicators.slowMaPeriod}</span>
                    <input
                      type="range"
                      min="30"
                      max="100"
                      value={settings.indicators.slowMaPeriod}
                      onChange={(e) => updateIndicators({ slowMaPeriod: Number(e.target.value) })}
                      className="accent-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* ATR Settings */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-100">Average True Range (ATR)</span>
                  <span className="font-mono text-purple-400 font-bold">
                    Period: {settings.indicators.atrPeriod}
                  </span>
                </div>
                <input
                  type="range"
                  min="7"
                  max="25"
                  value={settings.indicators.atrPeriod}
                  onChange={(e) => updateIndicators({ atrPeriod: Number(e.target.value) })}
                  className="w-full accent-purple-500"
                />
              </div>
            </div>
          )}

          {/* VIEW: AI & MULTI-AGENT */}
          {activeCategory === 'ai' && (
            <div className="space-y-4 font-sans text-xs">
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-200 block">Require AI Direction Match</span>
                    <span className="text-[11px] text-slate-400">
                      Block trades unless sbagent matches algorithmic bias
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const next = !settings.ai.aiDirectionMatchRequired;
                      updateAI({ aiDirectionMatchRequired: next });
                      onUpdateBotState({ aiDirectionMatchRequired: next });
                      sound.play('toggle');
                    }}
                    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                      settings.ai.aiDirectionMatchRequired ? 'bg-indigo-500' : 'bg-slate-800'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        settings.ai.aiDirectionMatchRequired ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Minimum AI Confidence Score</span>
                  <span className="font-mono font-bold text-indigo-400 text-sm">
                    {Math.round(settings.ai.minConfidence * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="90"
                  step="5"
                  value={Math.round(settings.ai.minConfidence * 100)}
                  onChange={(e) => {
                    const val = Number(e.target.value) / 100;
                    updateAI({ minConfidence: val });
                    onUpdateBotState({ minConfidence: val });
                  }}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Autonomous Symbol Rotation</span>
                  <button
                    onClick={() => {
                      const next = !settings.ai.autonomousSymbolChange;
                      updateAI({ autonomousSymbolChange: next });
                      onUpdateBotState({ autonomousSymbolChange: next });
                      sound.play('toggle');
                    }}
                    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                      settings.ai.autonomousSymbolChange ? 'bg-cyan-500' : 'bg-slate-800'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        settings.ai.autonomousSymbolChange ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>
                <div className="space-y-1 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
                    <span>Rotation Cooldown:</span>
                    <span className="text-cyan-400 font-bold">{settings.ai.rotationCooldownSeconds}s</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="180"
                    step="5"
                    value={settings.ai.rotationCooldownSeconds}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateAI({ rotationCooldownSeconds: val });
                      onUpdateBotState({ rotationCooldownSeconds: val });
                    }}
                    className="w-full accent-cyan-400"
                  />
                </div>
              </div>

              {/* Agentic Martingale Parameters */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3 font-mono">
                <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5 font-sans">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  Agentic Martingale Recovery Limits
                </span>
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-400">Max Steps: {settings.ai.maxMartingaleRecoverySteps}</span>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={settings.ai.maxMartingaleRecoverySteps}
                      onChange={(e) => updateAI({ maxMartingaleRecoverySteps: Number(e.target.value) })}
                      className="accent-amber-400"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-400">Multiplier: {settings.ai.martingaleMultiplier.toFixed(2)}x</span>
                    <input
                      type="range"
                      min="1.2"
                      max="2.5"
                      step="0.05"
                      value={settings.ai.martingaleMultiplier}
                      onChange={(e) => updateAI({ martingaleMultiplier: parseFloat(e.target.value) })}
                      className="accent-amber-400"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: AGENT VOICE & CADENCE */}
          {activeCategory === 'voice' && (
            <div className="space-y-4 text-xs font-sans">
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Headphones className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-slate-100">Voice Feedback Engine</span>
                  </div>
                  <button
                    onClick={() => {
                      const next = !settings.audio.voiceEnabled;
                      updateAudio({ voiceEnabled: next });
                      sound.play('toggle');
                    }}
                    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                      settings.audio.voiceEnabled ? 'bg-cyan-500' : 'bg-slate-800'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        settings.audio.voiceEnabled ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Persona Selector */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-2">
                <span className="font-bold text-slate-200 block">Agent Voice Persona</span>
                <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                  {Object.values(AGENT_PERSONAS).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        updateAudio({ voicePersona: p.id });
                        voice.setPersona(p.id);
                        sound.play('click');
                      }}
                      className={`p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all ${
                        settings.audio.voicePersona === p.id
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span className="font-bold text-xs">{p.name}</span>
                      <span className="text-[10px] text-slate-500">{p.role}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Speed & Pitch Controls */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3 font-mono">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Cadence Speed (Rate)</span>
                    <span className="text-cyan-300 font-bold">{settings.audio.voiceRate.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.70"
                    max="1.50"
                    step="0.05"
                    value={settings.audio.voiceRate}
                    onChange={(e) => updateAudio({ voiceRate: parseFloat(e.target.value) })}
                    className="w-full accent-cyan-400"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Audio Pitch</span>
                    <span className="text-teal-300 font-bold">{settings.audio.voicePitch.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.70"
                    max="1.30"
                    step="0.05"
                    value={settings.audio.voicePitch}
                    onChange={(e) => updateAudio({ voicePitch: parseFloat(e.target.value) })}
                    className="w-full accent-teal-400"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => voice.testCadence()}
                    className="flex-1 py-2 bg-slate-900 hover:bg-slate-850 text-cyan-300 border border-cyan-500/30 rounded-lg flex items-center justify-center gap-1.5 font-bold"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Test Voice Briefing</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: INTERFACE & DISPLAY */}
          {activeCategory === 'interface' && (
            <div className="space-y-4 font-sans text-xs">
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-cyan-400" />
                    <div>
                      <span className="font-bold text-slate-100 block">Sound Effects</span>
                      <span className="text-[11px] text-slate-400">Order execution chimes & alert audio</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const next = !settings.audio.soundEnabled;
                      updateAudio({ soundEnabled: next });
                      sound.play('toggle');
                    }}
                    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                      settings.audio.soundEnabled ? 'bg-cyan-500' : 'bg-slate-800'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        settings.audio.soundEnabled ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-100 block">Compact Mobile Density</span>
                    <span className="text-[11px] text-slate-400">Optimizes spacing for small viewports</span>
                  </div>
                  <button
                    onClick={() => {
                      updateInterface({ compactMode: !settings.interface.compactMode });
                      sound.play('toggle');
                    }}
                    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                      settings.interface.compactMode ? 'bg-cyan-500' : 'bg-slate-800'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        settings.interface.compactMode ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-100">Visible Candlesticks on Chart</span>
                  <span className="font-mono text-cyan-400 font-bold">{settings.interface.visibleCandlesCount}</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="200"
                  step="10"
                  value={settings.interface.visibleCandlesCount}
                  onChange={(e) => updateInterface({ visibleCandlesCount: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>
          )}

          {/* VIEW: CONNECTION & NETWORK */}
          {activeCategory === 'connection' && (
            <div className="space-y-4 font-sans text-xs">
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3 font-mono">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-100 font-sans">Deriv WebSocket Gateway</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    ONLINE
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>Ping Latency:</span>
                  <span className="text-cyan-300 font-bold">
                    {pingTestLatency !== null ? `${pingTestLatency} ms` : `${latencyMs || 35} ms`}
                  </span>
                </div>
                <button
                  onClick={handleRunPingTest}
                  disabled={isTestingPing}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-850 text-cyan-300 border border-cyan-500/40 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isTestingPing ? 'animate-spin' : ''}`} />
                  <span>{isTestingPing ? 'Testing Ping...' : 'Ping Deriv Gateway Now'}</span>
                </button>
              </div>

              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3 font-mono">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-100 font-sans">Deriv App ID</span>
                  <button
                    onClick={() => updateConnection({ derivAppId: '1089' })}
                    className="text-[10px] text-cyan-400 underline"
                  >
                    Reset (1089)
                  </button>
                </div>
                <input
                  type="text"
                  value={settings.connection.derivAppId}
                  onChange={(e) => updateConnection({ derivAppId: e.target.value.trim() })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 outline-none font-mono"
                />
              </div>

              <button
                onClick={onOpenTokenModal}
                className="w-full py-2.5 bg-gradient-to-r from-rose-600/20 to-red-600/20 text-rose-300 border border-rose-500/40 rounded-xl font-mono font-bold flex items-center justify-center gap-2"
              >
                <Key className="w-4 h-4 text-rose-400" />
                <span>Open Deriv In-App Login Screen</span>
              </button>
            </div>
          )}

          {/* VIEW: DATA, BACKUP & RESET */}
          {activeCategory === 'data' && (
            <div className="space-y-4 font-sans text-xs">
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-100">Export Terminal Settings</span>
                  <span className="text-[10px] text-slate-400 font-mono">JSON v{settings.version}</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Download a backup file containing all your custom indicators, risk limits, personas, and configurations.
                </p>
                <button
                  onClick={handleExportJSON}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-850 text-cyan-300 border border-cyan-500/40 rounded-xl font-mono font-bold flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Settings JSON</span>
                </button>
                {exportNotice && (
                  <p className="text-[11px] text-emerald-400 font-mono">{exportNotice}</p>
                )}
              </div>

              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <span className="font-bold text-slate-100 block">Import Settings JSON</span>
                <textarea
                  rows={3}
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                  placeholder="Paste terminal settings JSON here..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-mono outline-none"
                />
                <button
                  onClick={handleImportJSON}
                  disabled={!importJsonText.trim()}
                  className="w-full py-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 rounded-xl font-mono font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  <span>Apply Imported Settings</span>
                </button>
                {importNotice && (
                  <p
                    className={`text-[11px] font-mono ${
                      importNotice.success ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {importNotice.message}
                  </p>
                )}
              </div>

              {/* Reset to Factory Defaults */}
              <div className="bg-rose-950/20 p-4 rounded-xl border border-rose-500/30 space-y-3">
                <span className="font-bold text-rose-300 block">Factory Reset</span>
                <p className="text-[11px] text-slate-400">
                  Restores all execution stakes, durations, indicators, and risk shields to initial calibrated factory defaults.
                </p>
                {showResetConfirm ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        resetToDefaults();
                        setShowResetConfirm(false);
                      }}
                      className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-mono font-bold"
                    >
                      Confirm Reset
                    </button>
                    <button
                      onClick={() => setShowResetConfirm(false)}
                      className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg font-mono font-bold"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    className="w-full py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/40 rounded-xl font-mono font-bold"
                  >
                    Reset All Settings to Factory Defaults
                  </button>
                )}
              </div>
            </div>
          )}

          {/* VIEW: THEMES & VISUALS */}
          {activeCategory === 'theme' && <ThemeSelectorPanel />}

          {/* VIEW: PERFORMANCE MATRIX */}
          {activeCategory === 'performance' && (
            <SymbolPerformanceMatrix
              allowedSymbols={botState.allowedRotationSymbols}
              closedTrades={closedTrades}
              selectedSymbol={selectedSymbol}
              onSelectSymbol={onSymbolChange}
              currency={currency}
              regime={regime}
              onOpenAutoRotationConfig={() => setActiveCategory('sbagent')}
            />
          )}

          {/* VIEW: SBAGENT.MD */}
          {activeCategory === 'sbagent' && (
            <SubAgentSettingsView
              botState={botState}
              onUpdateBotState={onUpdateBotState}
              selectedSymbol={selectedSymbol}
              onSymbolChange={onSymbolChange}
              isAutonomousRunning={isAutonomousRunning}
              onToggleAutonomous={onToggleAutonomous}
              onOpenFullModal={onOpenSubAgentModal}
            />
          )}

          {/* VIEW: SPATIAL PROCESSING METRICS */}
          {activeCategory === 'spatial' && (
            <SpatialProcessingMetricsView
              symbol={selectedSymbol}
              currentPrice={currentPrice}
              indicators={indicators}
              regime={regime}
              riskMetrics={riskMetrics}
              onSelectSymbol={onSymbolChange}
              autonomousSymbolChange={botState.autonomousSymbolChange ?? true}
              onToggleAutonomousChange={(enabled) =>
                onUpdateBotState({ autonomousSymbolChange: enabled })
              }
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs font-mono shrink-0">
          <span className="text-[10px] text-slate-500">
            sbatomic v4.1 • Persistent Settings Hub
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-bold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
