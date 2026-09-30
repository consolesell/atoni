import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Candle,
  TechnicalIndicators,
  MarketRegime,
  DecisionResult,
  AIPredictionResult,
  TradeRecord,
  BotState,
  TradingAgent,
  Tick,
  AgentEvolutionLog,
  PositionSizingMode,
  TrailingStopConfig,
} from './types/trading';
import { derivWS } from './lib/derivWS';
import { DERIV_SYMBOLS, getSymbolDetails } from './lib/derivSymbols';
import {
  analyzeAllIndicators,
} from './lib/indicators';
import {
  DEFAULT_AGENTS,
  runAlgorithmicDecisionEngine,
} from './lib/decisionEngine';
import { sound } from './lib/soundEngine';
import { voice } from './lib/voiceEngine';
import { calculateCoreRiskMetrics, calculateDynamicStake } from './lib/riskEngine';
import { detectPattern, recordPatternOutcome } from './lib/adaptivePatternEngine';
import {
  calculateTrailingDistance,
  initializeTrailingStopParams,
  evaluateTrailingStop,
  DEFAULT_TRAILING_STOP_CONFIG,
} from './lib/trailingStopEngine';
import { evaluateHighestWinGate, analyzeMarketStability } from './lib/strategicFiltering';
import { INITIAL_AGENTIC_MARTINGALE_STATE, processMartingaleTradeOutcome } from './lib/agenticMartingaleEngine';
import { useAuth } from './context/AuthContext';
import { useTerminalSettings } from './context/TerminalSettingsContext';
import { db, collection, query, where, orderBy, limit, getDocs, setDoc, doc, Timestamp } from './lib/firebase';
import { TradeDurationUnit, SniperConfluenceResult } from './types/sniper';
import { evaluateSniperConfluence } from './lib/sniperEngine';
import { AgenticMartingaleState } from './types/trading';

// Components
import { Navbar } from './components/Navbar';
import { LivePriceHeader } from './components/LivePriceHeader';
import { InteractiveChart } from './components/InteractiveChart';
import { TradeControls } from './components/TradeControls';
import { AIPredictionCard } from './components/AIPredictionCard';
import { MultiAgentMatrix } from './components/MultiAgentMatrix';
import { BotAutoTrader } from './components/BotAutoTrader';
import { PositionsDrawer } from './components/PositionsDrawer';
import { TechnicalAnalyticsView } from './components/TechnicalAnalyticsView';
import { AICopilotChat } from './components/AICopilotChat';
import { BlackboxHubView } from './components/BlackboxHubView';
import { AccountTokenModal } from './components/AccountTokenModal';
import { TradeCritiqueModal } from './components/TradeCritiqueModal';
import { PlatformHelpModal } from './components/PlatformHelpModal';
import { AuthModal } from './components/AuthModal';
import { SubAgentEditorModal } from './components/SubAgentEditorModal';
import { AgentEvolutionModal } from './components/AgentEvolutionModal';
import { GoogleDocsModal } from './components/GoogleDocsModal';
import { GoogleKeepNotesModal } from './components/GoogleKeepNotesModal';
import { BrainAnatomyModal } from './components/BrainAnatomyModal';
import { DailyCumulativePnLChart } from './components/DailyCumulativePnLChart';
import { AdvancedAlertsModal } from './components/AdvancedAlertsModal';
import { DetailedAuthVisual } from './components/DetailedAuthVisual';
import { SettingsDrawer, SettingsCategory } from './components/SettingsDrawer';
import { SystemCopilotBottomSheet } from './components/SystemCopilotBottomSheet';
import { FullscreenWorkspace } from './components/FullscreenWorkspace';
import { MobileExecutionBar } from './components/MobileExecutionBar';
import { SymbolPerformanceMatrix } from './components/SymbolPerformanceMatrix';
import { VoiceBroadcastBanner } from './components/VoiceWaveformIndicator';
import { VoiceCommandHUD } from './components/VoiceCommandHUD';
import { AlertRule, TriggeredAlert } from './types/alerts';
import {
  loadAlertRules,
  saveAlertRules,
  loadAlertHistory,
  saveAlertHistory,
  evaluateAlerts,
} from './lib/alertsEngine';
import { Bell, Sparkles, AlertTriangle, CheckCircle2, X } from 'lucide-react';

export default function App() {
  // Authentication & Persistent Profile
  const { user, userProfile, updateBalances, updateAccountMode } = useAuth();
  const { settings, updateTrailingStop } = useTerminalSettings();

  // Navigation & Views
  const [activeTab, setActiveTab] = useState<'terminal' | 'analytics' | 'copilot' | 'markets' | 'blackbox'>('terminal');
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>('overview');

  // Asset & Market State
  const [selectedSymbol, setSelectedSymbol] = useState<string>(() => settings.general.defaultSymbol || '1HZ10V');
  const symbolDetails = useMemo(() => getSymbolDetails(selectedSymbol), [selectedSymbol]);
  const decimals = symbolDetails.decimals ?? 2;
  const [granularity, setGranularity] = useState<number>(60);
  const [currentPrice, setCurrentPrice] = useState<number>(1000);
  const [prevPrice, setPrevPrice] = useState<number>(1000);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [tickBuffer, setTickBuffer] = useState<Tick[]>([]);
  const [indicators, setIndicators] = useState<TechnicalIndicators | null>(null);
  const [regime, setRegime] = useState<MarketRegime>({
    type: 'EQUILIBRIUM' as any,
    confidence: 0.6,
  });

  // Multi-Agents & Dynamic Weights
  const [agents, setAgents] = useState<TradingAgent[]>(DEFAULT_AGENTS);
  const [evolutionLogs, setEvolutionLogs] = useState<AgentEvolutionLog[]>([]);
  const [isEvolving, setIsEvolving] = useState<boolean>(false);
  const [algorithmicDecision, setAlgorithmicDecision] = useState<DecisionResult | null>(null);
  const [aiPrediction, setAiPrediction] = useState<AIPredictionResult | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState<boolean>(false);

  // Trade Execution Deck State (Standardized $1.00 Base Stake Anchor)
  const [stake, setStake] = useState<number>(() => settings.general.defaultStake ?? 1.0);
  const [sizingMode, setSizingMode] = useState<PositionSizingMode>(() => settings.risk.sizingMode ?? 'KELLY_HALF');
  const [duration, setDuration] = useState<number>(() => settings.general.defaultDuration ?? 15);
  const [durationUnit, setDurationUnit] = useState<TradeDurationUnit>(() => settings.general.defaultDurationUnit ?? 'minutes');
  const [direction, setDirection] = useState<'CALL' | 'PUT'>(() => settings.general.defaultDirection ?? 'CALL');
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [isSniperTriggerArmed, setIsSniperTriggerArmed] = useState<boolean>(false);

  // Positions & Balance (Standardized Virtual Account Anchor: $10 USD)
  const [openTrades, setOpenTrades] = useState<TradeRecord[]>([]);
  const [closedTrades, setClosedTrades] = useState<TradeRecord[]>([]);
  const [balance, setBalance] = useState<number>(10.0);
  const [currency, setCurrency] = useState<string>('USD');
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [loginid, setLoginid] = useState<string | null>(null);

  // Advanced Agentic Martingale Reasoning State ($1.00 Base Anchor)
  const [martingaleState, setMartingaleState] = useState<AgenticMartingaleState>(INITIAL_AGENTIC_MARTINGALE_STATE);
  const martingaleStateRef = useRef<AgenticMartingaleState>(INITIAL_AGENTIC_MARTINGALE_STATE);
  useEffect(() => {
    martingaleStateRef.current = martingaleState;
  }, [martingaleState]);

  // Core Quantitative Risk Metrics & Kelly Criterion Bounds
  const coreRiskMetrics = useMemo(() => {
    return calculateCoreRiskMetrics(closedTrades, balance);
  }, [closedTrades, balance]);

  const dynamicStake = useMemo(() => {
    if (martingaleState.enabled && martingaleState.currentStake) {
      return martingaleState.currentStake;
    }
    const winProb = aiPrediction?.ai_predicted_win_probability 
      ? aiPrediction.ai_predicted_win_probability 
      : (algorithmicDecision?.confidence ? algorithmicDecision.confidence : 0.62);
    const res = calculateDynamicStake({
      balance,
      winRate: winProb,
      mode: sizingMode,
      fixedStake: 1.0,
      minStake: 1.0,
    });
    return res.recommendedStake;
  }, [sizingMode, balance, aiPrediction?.ai_predicted_win_probability, algorithmicDecision?.confidence, martingaleState.enabled, martingaleState.currentStake]);

  // Keep stake synchronized with dynamic Kelly / Martingale stake when not in manual fixed mode
  useEffect(() => {
    if (sizingMode !== 'FIXED') {
      setStake(dynamicStake);
    }
  }, [sizingMode, dynamicStake]);

  // Determine current active mode (DEMO vs REAL from profile or default)
  const [localLiveMode, setLocalLiveMode] = useState<boolean>(false);
  const isLiveMode = userProfile ? userProfile.accountMode === 'REAL' : localLiveMode;

  // Synchronize balance with user profile account mode (Standardized $10 Virtual Anchor)
  useEffect(() => {
    if (userProfile) {
      if (userProfile.accountMode === 'REAL') {
        setBalance(userProfile.realBalance ?? 0);
      } else {
        setBalance(userProfile.demoBalance ?? 10.0);
      }
    }
  }, [userProfile?.accountMode, userProfile?.demoBalance, userProfile?.realBalance]);

  // Load persistent trade history & evolution from Firestore on user login
  useEffect(() => {
    if (!user) return;
    const fetchPersistentData = async () => {
      try {
        const tradesQ = query(
          collection(db, 'trades'),
          where('uid', '==', user.uid),
          orderBy('timestamp', 'desc'),
          limit(50)
        );
        const snap = await getDocs(tradesQ);
        const persistedTrades: TradeRecord[] = [];
        snap.forEach((doc) => {
          persistedTrades.push(doc.data() as TradeRecord);
        });
        if (persistedTrades.length > 0) {
          setClosedTrades(persistedTrades);
        }
      } catch (err) {
        console.warn('Firestore trades load note:', err);
      }
    };
    fetchPersistentData();
  }, [user]);

  // Automated Trading Bot
  const [botState, setBotState] = useState<BotState>(() => ({
    enabled: false,
    isPaused: false,
    pauseReason: null,
    symbol: settings.general.defaultSymbol || '1HZ10V',
    granularity: 60,
    stake: settings.general.defaultStake ?? 5,
    adaptiveConfidenceEnabled: true,
    preset: 'balanced',
    minConfidence: settings.ai.minConfidence ?? 0.45,
    aiDirectionMatchRequired: settings.ai.aiDirectionMatchRequired ?? true,
    maxDailyLoss: settings.risk.maxDailyLoss ?? 30,
    currentDailyLoss: 0,
    consecutiveLosses: 0,
    maxConsecutiveLosses: settings.risk.maxConsecutiveLosses ?? 4,
    dailyTradeCount: 0,
    tradesToday: 0,
    dailyProfit: 0,
    maxDailyTrades: settings.risk.maxDailyTrades ?? 100,
    cooldownUntil: 0,
    autonomousSymbolChange: settings.ai.autonomousSymbolChange ?? true,
    allowedRotationSymbols: ['1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V', 'R_10', 'R_25', 'R_50', 'R_75', 'R_100'],
    rotationCooldownSeconds: settings.ai.rotationCooldownSeconds ?? 60,
    lastSymbolRotationTime: 0,
  }));

  const [botLogs, setBotLogs] = useState<
    { time: string; message: string; type: 'info' | 'success' | 'warn' | 'error' }[]
  >([]);

  // sbagent.md Autonomous Subagent State
  const [isAutonomousRunning, setIsAutonomousRunning] = useState<boolean>(false);
  const [lastSubagentDecision, setLastSubagentDecision] = useState<{
    action: string;
    confidence: number;
    rule_matched?: string;
    reasoning?: string;
    timestamp?: string;
  } | null>(null);

  // Modals
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSubAgentModalOpen, setIsSubAgentModalOpen] = useState(false);
  const [isEvolutionModalOpen, setIsEvolutionModalOpen] = useState(false);
  const [isGoogleDocsModalOpen, setIsGoogleDocsModalOpen] = useState(false);
  const [isKeepModalOpen, setIsKeepModalOpen] = useState(false);
  const [isBrainModalOpen, setIsBrainModalOpen] = useState(false);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isFullscreenWorkspaceOpen, setIsFullscreenWorkspaceOpen] = useState(false);
  const [selectedCritiqueTrade, setSelectedCritiqueTrade] = useState<TradeRecord | null>(null);

  // Advanced Alerts & Live Session State
  const [alertRules, setAlertRules] = useState<AlertRule[]>(() => loadAlertRules());
  const [triggeredAlerts, setTriggeredAlerts] = useState<TriggeredAlert[]>(() => loadAlertHistory());
  const [activeToastAlert, setActiveToastAlert] = useState<TriggeredAlert | null>(null);
  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState<boolean>(false);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState<boolean>(false);
  const [trailingStopConfig, setTrailingStopConfig] = useState<TrailingStopConfig>(() => ({
    enabled: settings.trailingStop.enabled,
    distanceType: settings.trailingStop.distanceType,
    distanceValue: settings.trailingStop.distanceValue,
    profitLockEnabled: settings.trailingStop.profitLockEnabled,
    profitLockThresholdPercent: settings.trailingStop.profitLockThresholdPercent,
    profitLockSecuredPercent: settings.trailingStop.profitLockSecuredPercent,
  }));

  // Synchronize trailingStopConfig with settings.trailingStop
  useEffect(() => {
    setTrailingStopConfig({
      enabled: settings.trailingStop.enabled,
      distanceType: settings.trailingStop.distanceType,
      distanceValue: settings.trailingStop.distanceValue,
      profitLockEnabled: settings.trailingStop.profitLockEnabled,
      profitLockThresholdPercent: settings.trailingStop.profitLockThresholdPercent,
      profitLockSecuredPercent: settings.trailingStop.profitLockSecuredPercent,
    });
  }, [
    settings.trailingStop.enabled,
    settings.trailingStop.distanceType,
    settings.trailingStop.distanceValue,
    settings.trailingStop.profitLockEnabled,
    settings.trailingStop.profitLockThresholdPercent,
    settings.trailingStop.profitLockSecuredPercent,
  ]);

  // Synchronize bot risk & AI parameters whenever settings update
  useEffect(() => {
    setBotState((prev) => ({
      ...prev,
      maxDailyLoss: settings.risk.maxDailyLoss,
      maxDailyTrades: settings.risk.maxDailyTrades,
      maxConsecutiveLosses: settings.risk.maxConsecutiveLosses,
      minConfidence: prev.minConfidence ?? settings.ai.minConfidence ?? 0.45,
      autonomousSymbolChange: settings.ai.autonomousSymbolChange ?? prev.autonomousSymbolChange,
      rotationCooldownSeconds: settings.ai.rotationCooldownSeconds ?? prev.rotationCooldownSeconds,
    }));
  }, [
    settings.risk.maxDailyLoss,
    settings.risk.maxDailyTrades,
    settings.risk.maxConsecutiveLosses,
    settings.ai.autonomousSymbolChange,
    settings.ai.rotationCooldownSeconds,
  ]);

  // Synchronize sizingMode whenever settings.risk.sizingMode updates
  useEffect(() => {
    if (settings.risk.sizingMode) {
      setSizingMode(settings.risk.sizingMode);
    }
  }, [settings.risk.sizingMode]);

  // References
  const lastAiScanTimeRef = useRef<number>(0);
  const lastBotTradeTimeRef = useRef<number>(0);
  const lastSubagentRunTimeRef = useRef<number>(0);
  const currentPriceRef = useRef<number>(currentPrice);
  const tradeTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Keep currentPriceRef synchronized
  useEffect(() => {
    currentPriceRef.current = currentPrice;
  }, [currentPrice]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      tradeTimeoutsRef.current.forEach((timer) => clearTimeout(timer));
      tradeTimeoutsRef.current.clear();
    };
  }, []);

  // Append log to bot stream
  const addLog = useCallback(
    (message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
      const time = new Date().toLocaleTimeString();
      setBotLogs((prev) => [{ time, message, type }, ...prev.slice(0, 99)]);
    },
    []
  );

  // 1. Initial Candles Generator & Deriv Connection
  useEffect(() => {
    const details = getSymbolDetails(selectedSymbol);
    const basePrice = details.defaultBasePrice || 1000;
    const decimals = details.decimals || 2;
    const volatilityStep = basePrice * 0.0004;

    // Reset tick buffer immediately on symbol/granularity change
    setTickBuffer([]);

    // Generate accurate initial candles anchored to the symbol's specific price scale
    const initialCandles: Candle[] = [];
    let cur = basePrice;
    const now = Math.floor(Date.now() / 1000);

    for (let i = 80; i >= 0; i--) {
      const epoch = now - i * granularity;
      const change = (Math.random() - 0.49) * volatilityStep;
      const open = Number(cur.toFixed(decimals));
      const close = Number((cur + change).toFixed(decimals));
      const high = Number((Math.max(open, close) + Math.random() * volatilityStep * 0.8).toFixed(decimals));
      const low = Number((Math.min(open, close) - Math.random() * volatilityStep * 0.8).toFixed(decimals));
      cur = close;
      initialCandles.push({
        epoch,
        open,
        high,
        low,
        close,
        volume: Math.floor(Math.random() * 80) + 20,
      });
    }

    setCandles(initialCandles);
    setCurrentPrice(cur);
    setPrevPrice(cur);

    derivWS.connect();
    derivWS.fetchCandles(selectedSymbol, granularity, 120);
    derivWS.subscribeTicks(selectedSymbol);

    const unsubscribe = derivWS.subscribe((data: any) => {
      if (data.msg_type === 'tick' && data.tick) {
        const tick = data.tick;
        const tickSymbol = tick.symbol || data.echo_req?.ticks;
        // Strictly ignore ticks that do not match the currently selected symbol
        if (tickSymbol && tickSymbol !== selectedSymbol) {
          return;
        }

        const rawQuote = tick.quote ?? tick.price;
        if (typeof rawQuote !== 'number' || isNaN(rawQuote)) return;
        const newQuote = Number(rawQuote.toFixed(decimals));

        setPrevPrice(currentPriceRef.current);
        setCurrentPrice(newQuote);

        setTickBuffer((prev) => [...prev.slice(-40), { epoch: tick.epoch || Math.floor(Date.now() / 1000), quote: newQuote, symbol: selectedSymbol }]);

        const tickTime = Math.floor(tick.epoch || Date.now() / 1000);
        const candlePeriod = Math.floor(tickTime / granularity) * granularity;

        setCandles((prevCandles) => {
          if (prevCandles.length === 0) return prevCandles;

          // Outlier safety guard: if quote deviates by > 35% from the latest candle (e.g. symbol transition), re-anchor
          const last = prevCandles[prevCandles.length - 1];
          if (last && Math.abs(newQuote - last.close) / Math.max(newQuote, last.close) > 0.35) {
            return prevCandles.map((c) => ({
              ...c,
              open: newQuote,
              high: newQuote,
              low: newQuote,
              close: newQuote,
            }));
          }

          if (last.epoch === candlePeriod) {
            const updated: Candle = {
              ...last,
              high: Number(Math.max(last.high, newQuote).toFixed(decimals)),
              low: Number(Math.min(last.low, newQuote).toFixed(decimals)),
              close: newQuote,
              volume: (last.volume || 0) + 1,
            };
            return [...prevCandles.slice(0, -1), updated];
          } else if (candlePeriod > last.epoch) {
            const newCandle: Candle = {
              epoch: candlePeriod,
              open: newQuote,
              high: newQuote,
              low: newQuote,
              close: newQuote,
              volume: 1,
            };
            return [...prevCandles.slice(-150), newCandle];
          }
          return prevCandles;
        });
      } else if (data.msg_type === 'candles' && Array.isArray(data.candles)) {
        const reqSymbol = data.echo_req?.ticks_history;
        // Strictly verify that received candles match currently selected symbol
        if (reqSymbol && reqSymbol !== selectedSymbol) {
          return;
        }

        if (data.candles.length > 0) {
          setCandles(data.candles);
          const lastClose = data.candles[data.candles.length - 1].close;
          setCurrentPrice(lastClose);
          setPrevPrice(lastClose);
        }
      } else if (data.msg_type === 'authorize' && data.authorize) {
        setIsAuthorized(true);
        const activeId = data.authorize.loginid || 'CR_DEMO_AI';
        setLoginid(activeId);
        const isVirtual = Boolean(data.authorize.is_virtual || activeId.startsWith('VRTC'));
        setLocalLiveMode(!isVirtual);
        if (userProfile && updateAccountMode) {
          updateAccountMode(!isVirtual ? 'REAL' : 'DEMO');
        }
        if (data.authorize.balance !== undefined) {
          setBalance(data.authorize.balance);
        }
        if (data.authorize.currency) {
          setCurrency(data.authorize.currency);
        }
      } else if (data.msg_type === 'balance' && data.balance) {
        if (typeof data.balance.balance === 'number') {
          setBalance(data.balance.balance);
        }
        if (data.balance.currency) {
          setCurrency(data.balance.currency);
        }
        if (data.balance.loginid) {
          setLoginid(data.balance.loginid);
        }
        setIsRefreshingBalance(false);
      } else if (data.msg_type === 'deriv_logout') {
        setIsAuthorized(false);
        setLoginid('VRTC_VIRTUAL_10');
        setBalance(10.0);
        setCurrency('USD');
        setLocalLiveMode(false);
        if (userProfile && updateAccountMode) {
          updateAccountMode('DEMO');
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [selectedSymbol, granularity]);

  // 2. Technical Indicators & Multi-Agent Calculation
  useEffect(() => {
    if (candles.length < 15) return;

    const calculatedIndicators = analyzeAllIndicators(candles, tickBuffer, settings.indicators);
    const pattern = detectPattern(candles);
    if (pattern) {
      calculatedIndicators.pattern = pattern;
    }
    setIndicators(calculatedIndicators);

    const decision = runAlgorithmicDecisionEngine(
      candles,
      calculatedIndicators,
      agents,
      botState.minConfidence ?? 0.38
    );
    setAlgorithmicDecision(decision);

    if (decision.regime) {
      setRegime(decision.regime);
    }
  }, [candles, tickBuffer, agents, settings.indicators]);

  // 2b. Real-Time Sniper Confluence Evaluation (Multi-Confluence Entry, TP/SL Targets, Adaptive Duration)
  const sniperSetup = useMemo(() => {
    if (!candles || candles.length < 15) return null;
    return evaluateSniperConfluence(
      currentPrice,
      candles,
      indicators,
      regime,
      algorithmicDecision,
      agents
    );
  }, [currentPrice, candles, indicators, regime, algorithmicDecision, agents]);

  // 2c. Highest-Win Prioritization Gatekeeper (Filters out low-probability gamble setups)
  const highestWinGate = useMemo(() => {
    return evaluateHighestWinGate({
      currentPrice,
      candles,
      indicators,
      regime,
      decision: algorithmicDecision,
      direction,
      confluenceScore: sniperSetup?.score ?? 60,
      minWinProbabilityThreshold: 52,
    });
  }, [currentPrice, candles, indicators, regime, algorithmicDecision, direction, sniperSetup?.score]);

  // 2d. Continuous Market Stability & Volatility Noise Monitoring
  const marketStability = useMemo(() => {
    return analyzeMarketStability(
      selectedSymbol,
      candles,
      indicators,
      regime,
      botState.allowedRotationSymbols
    );
  }, [selectedSymbol, candles, indicators, regime, botState.allowedRotationSymbols]);

  // Real-Time Virtual Account Auto-Replenishment ($10 USD Standardized Anchor)
  useEffect(() => {
    const replenishThreshold = settings.risk.autoReplenishThreshold ?? 1.00;
    const anchorAmount = settings.risk.virtualAnchorBalance ?? 10.00;
    if (!isLiveMode && balance < replenishThreshold) {
      setBalance(anchorAmount);
      if (userProfile) {
        updateBalances(anchorAmount, undefined);
      }
      if (settings.audio.soundEnabled) {
        sound.play('win');
      }
      if (settings.audio.voiceEnabled && settings.audio.speakAutoReplenish) {
        voice.speak(
          `Virtual account balance depleted. Automatically replenished back to ${Math.round(anchorAmount)} dollars.`,
          'urgent'
        );
      }
      addLog(
        `🔄 [AUTO-REPLENISHMENT] Virtual account balance depleted below minimum threshold ($${replenishThreshold.toFixed(2)}). Automatically replenished back to $${anchorAmount.toFixed(2)} USD anchor.`,
        'success'
      );
    }
  }, [
    balance,
    isLiveMode,
    userProfile,
    updateBalances,
    addLog,
    settings.risk.autoReplenishThreshold,
    settings.risk.virtualAnchorBalance,
    settings.audio.soundEnabled,
    settings.audio.voiceEnabled,
    settings.audio.speakAutoReplenish,
  ]);

  // Manual Anchor Replenish Handler
  const handleReplenishVirtualAnchor = useCallback(() => {
    const topUp = settings.risk.virtualAnchorBalance ?? 10.00;
    setBalance(topUp);
    if (userProfile) {
      updateBalances(topUp, undefined);
    }
    if (settings.audio.soundEnabled) {
      sound.play('win');
    }
    addLog(`🔄 Virtual account balance anchor manually re-anchored to $${topUp.toFixed(2)} USD.`, 'success');
  }, [userProfile, updateBalances, addLog, settings.risk.virtualAnchorBalance, settings.audio.soundEnabled]);

  // Autonomous Symbol Switch on Market Instability
  useEffect(() => {
    if (
      botState.enabled &&
      marketStability.switchRecommended &&
      marketStability.targetStableSymbol &&
      marketStability.targetStableSymbol !== selectedSymbol &&
      (botState.autonomousSymbolChange ?? true)
    ) {
      const cooldownSecs = botState.rotationCooldownSeconds || 60;
      const lastRot = botState.lastSymbolRotationTime || 0;
      if (Date.now() - lastRot > cooldownSecs * 1000) {
        const nextSym = marketStability.targetStableSymbol;
        setBotState((prev) => ({
          ...prev,
          lastSymbolRotationTime: Date.now(),
          lastRotationReason: marketStability.switchReason,
        }));
        addLog(
          `🛡️ [STABILITY MONITOR] High noise on ${selectedSymbol} (Stability Index: ${marketStability.stabilityIndex}%). Auto-switching to stable pair ${nextSym}.`,
          'warn'
        );
        setSelectedSymbol(nextSym);
        derivWS.fetchCandles(nextSym, granularity, 120);
        derivWS.subscribeTicks(nextSym);
      }
    }
  }, [
    botState.enabled,
    botState.autonomousSymbolChange,
    botState.rotationCooldownSeconds,
    botState.lastSymbolRotationTime,
    marketStability,
    selectedSymbol,
    granularity,
    addLog,
  ]);

  // Autonomous Sniper Reticle Auto-Trigger when price touches optimal entry target
  useEffect(() => {
    if (!isSniperTriggerArmed || !sniperSetup || !sniperSetup.isPrimed || sniperSetup.direction === 'NEUTRAL' || isExecuting) return;
    const priceDiff = Math.abs(currentPrice - sniperSetup.optimalEntryPrice) / (sniperSetup.optimalEntryPrice || 1);
    if (priceDiff < 0.0012) {
      sound.play('trade');
      voice.speak(`Sniper optimal entry executed on ${selectedSymbol} at ${currentPrice.toFixed(3)}`, 'urgent');
      addLog(`🎯 [SNIPER AUTO-TRIGGER] Optimal entry hit at ${currentPrice.toFixed(3)} (${sniperSetup.score}% confluence)!`, 'success');
      executeTrade(
        sniperSetup.direction,
        stake,
        sniperSetup.recommendedDuration.value,
        'AUTO_BOT',
        sniperSetup.recommendedDuration.unit,
        {
          isSniperTrade: true,
          confluenceScore: sniperSetup.score,
          entryTarget: sniperSetup.optimalEntryPrice,
          takeProfitTarget: sniperSetup.takeProfitPrice,
          stopLossTarget: sniperSetup.stopLossPrice,
        }
      );
      setIsSniperTriggerArmed(false);
    }
  }, [currentPrice, isSniperTriggerArmed, sniperSetup, isExecuting, stake, selectedSymbol]);

  // 3. Gemini AI Scan
  const triggerAIScan = useCallback(async () => {
    if (!indicators || isLoadingAI) return;
    const now = Date.now();
    if (now - lastAiScanTimeRef.current < 8000) return;
    lastAiScanTimeRef.current = now;

    setIsLoadingAI(true);
    try {
      const response = await fetch('/api/ai/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol,
          currentPrice: currentPriceRef.current,
          regime: regime.type,
          indicators: {
            rsiNow: indicators.rsiNow,
            ma14Now: indicators.ma14Now,
            ma50Now: indicators.ma50Now,
            volatility: indicators.volatility,
            pattern: indicators.pattern?.pattern,
            mood: indicators.mood?.mood,
            moodRatio: indicators.mood?.ratio,
          },
          timeframe: `${granularity}s`,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setAiPrediction(data);
      }
    } catch (err) {
      console.warn('AI Scan trigger note:', err);
    } finally {
      setIsLoadingAI(false);
    }
  }, [indicators, isLoadingAI, selectedSymbol, regime.type, granularity]);

  // Trigger AI Agent Evolution Cycle (Reinforcement Learning)
  const triggerAgentEvolution = useCallback(async () => {
    setIsEvolving(true);
    try {
      const res = await fetch('/api/ai/evolve-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agents,
          recentTrades: closedTrades.slice(0, 15),
          regimeHistory: regime,
        }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.evolved_agents)) {
        setAgents((prev) =>
          prev.map((ag) => {
            const evolved = data.evolved_agents.find((ea: any) => ea.name === ag.name);
            if (evolved && evolved.weights) {
              return {
                ...ag,
                weights: evolved.weights,
              };
            }
            return ag;
          })
        );

        const newLog: AgentEvolutionLog = {
          id: `EVO-${Date.now()}`,
          agentName: 'Multi-Agent Reinforcement Consensus',
          timestamp: new Date().toISOString(),
          trigger: 'AI_OPTIMIZER',
          previousWeights: agents[0].weights,
          newWeights: data.evolved_agents[0]?.weights || agents[0].weights,
          reason: data.overall_learning_summary || 'Learned from recent trade win/loss distribution',
          improvementMetric: `Self-optimized across ${closedTrades.length} trades`,
        };

        setEvolutionLogs((prev) => [newLog, ...prev.slice(0, 20)]);
        addLog(`🧠 Multi-Agent Self-Evolution complete: ${data.overall_learning_summary}`, 'success');

        // Persist to Firestore if user logged in
        if (user) {
          try {
            await setDoc(doc(db, 'evolution_logs', newLog.id), {
              ...newLog,
              uid: user.uid,
            });
          } catch (e) {
            console.warn('Silent log persist error:', e);
          }
        }
      }
    } catch (err: any) {
      console.error('Agent evolution failed:', err);
      addLog(`Evolution optimizer notice: ${err.message}`, 'warn');
    } finally {
      setIsEvolving(false);
    }
  }, [agents, closedTrades, regime, addLog, user]);

  // 4. Trade Execution Method (Manual, Auto-Bot, Subagent, or Sniper Engine)
  const executeTrade = useCallback(
    async (
      tradeDirection: 'CALL' | 'PUT',
      tradeStake: number,
      tradeDuration: number,
      source: 'MANUAL' | 'AUTO_BOT' | 'SUBAGENT_MD' = 'MANUAL',
      tradeDurationUnit: TradeDurationUnit = 'minutes',
      sniperData?: {
        isSniperTrade?: boolean;
        confluenceScore?: number;
        entryTarget?: number;
        takeProfitTarget?: number;
        stopLossTarget?: number;
      },
      trailingStopOptions?: TrailingStopConfig
    ) => {
      if (isExecuting) return;
      if (balance < tradeStake) {
        addLog(`Insufficient funds ($${balance.toFixed(2)}) for trade stake $${tradeStake}`, 'error');
        return;
      }

      // Strict Duration Compliance: Mandatory execution bounds ensuring every trade strictly adheres to predefined expiry and duration rules without dynamic overrides
      let validDuration = tradeDuration;
      if (tradeDurationUnit === 'ticks') {
        validDuration = Math.max(1, Math.min(10, Math.round(tradeDuration)));
      } else if (tradeDurationUnit === 'seconds') {
        validDuration = Math.max(15, Math.min(60, Math.round(tradeDuration)));
      } else {
        validDuration = Math.max(2, Math.min(30, Math.round(tradeDuration)));
      }

      setIsExecuting(true);
      const uniqueSuffix = Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7).toUpperCase();
      const tradeId = `TRD-${uniqueSuffix}`;
      const entrySpot = currentPriceRef.current;

      const newBalance = Number((balance - tradeStake).toFixed(2));
      setBalance(newBalance);
      if (userProfile) {
        if (userProfile.accountMode === 'REAL') {
          updateBalances(undefined, newBalance);
        } else {
          updateBalances(newBalance, undefined);
        }
      }

      // Initialize Trailing Stop-Loss & Profit Lock parameters if requested
      let tslProps: Partial<TradeRecord> = {};
      if (trailingStopOptions?.enabled) {
        const trailingDist = calculateTrailingDistance(
          entrySpot,
          candles,
          indicators,
          trailingStopOptions
        );
        const tslParams = initializeTrailingStopParams(
          entrySpot,
          tradeDirection,
          trailingDist,
          decimals,
          trailingStopOptions
        );
        tslProps = {
          trailingStopEnabled: true,
          trailingStopDistanceType: trailingStopOptions.distanceType,
          trailingStopDistance: trailingDist,
          initialStopPrice: tslParams.initialStopPrice,
          currentTrailingStopPrice: tslParams.currentTrailingStopPrice,
          highestFavorablePrice: tslParams.highestFavorablePrice,
          lowestFavorablePrice: tslParams.lowestFavorablePrice,
          lockedInProfit: 0,
          peakProfit: 0,
          profitLockEnabled: trailingStopOptions.profitLockEnabled ?? true,
          profitLockThresholdPercent: trailingStopOptions.profitLockThresholdPercent ?? 50,
          profitLockTriggered: false,
          profitLockSecuredAmount: 0,
        };
      }

      const newTrade: TradeRecord = {
        id: tradeId,
        timestamp: new Date().toISOString(),
        mode: isLiveMode ? 'LIVE' : 'SIMULATION',
        symbol: selectedSymbol,
        amount: tradeStake,
        decision: tradeDirection === 'CALL' ? 'BUY' : 'SELL',
        result: 'PENDING',
        profit: 0,
        confidence: sniperData?.confluenceScore
          ? sniperData.confluenceScore / 100
          : algorithmicDecision?.confidence || 0.6,
        agent: sniperData?.isSniperTrade
          ? 'Sniper Confluence Pro'
          : source === 'SUBAGENT_MD'
          ? 'sbagent (sbagent.md)'
          : algorithmicDecision?.agent || 'Consensus',
        regime: regime.type,
        duration: validDuration,
        durationUnit: tradeDurationUnit,
        entryPrice: entrySpot,
        isSniperTrade: sniperData?.isSniperTrade,
        confluenceScore: sniperData?.confluenceScore,
        ...tslProps,
      };

      setOpenTrades((prev) => [newTrade, ...prev]);

      const unitSuffix = tradeDurationUnit === 'ticks' ? 't' : tradeDurationUnit === 'seconds' ? 's' : 'm';
      const sniperTag = sniperData?.isSniperTrade ? ` [SNIPER ${sniperData.confluenceScore}%]` : '';
      const tslTag = trailingStopOptions?.enabled
        ? ` [TSL Stop: ${tslProps.currentTrailingStopPrice?.toFixed(decimals)}${trailingStopOptions.profitLockEnabled ? ' • Profit Lock: ' + (trailingStopOptions.profitLockThresholdPercent ?? 50) + '%' : ''}]`
        : '';
      addLog(
        `[${source}${sniperTag}${tslTag}] Opened ${tradeDirection === 'CALL' ? 'RISE' : 'FALL'} contract on ${selectedSymbol} at ${entrySpot.toFixed(decimals)} ($${tradeStake}, ${validDuration}${unitSuffix})`,
        'success'
      );

      // Scaled simulation duration strictly compliant with bounds
      let simulatedDurationMs = validDuration * 4000;
      if (tradeDurationUnit === 'ticks') {
        simulatedDurationMs = Math.max(1500, validDuration * 1200);
      } else if (tradeDurationUnit === 'seconds') {
        simulatedDurationMs = Math.max(2000, validDuration * 1000);
      } else {
        simulatedDurationMs = Math.max(3000, validDuration * 4000);
      }

      const timerId = setTimeout(async () => {
        tradeTimeoutsRef.current.delete(tradeId);

        let activeTrade: TradeRecord | undefined;
        setOpenTrades((currOpen) => {
          activeTrade = currOpen.find((t) => t.id === tradeId);
          if (!activeTrade) return currOpen;
          return currOpen.filter((t) => t.id !== tradeId);
        });

        if (!activeTrade) return;

        const latestPrice = currentPriceRef.current;
        const isCall = tradeDirection === 'CALL';
        const won = isCall ? latestPrice > entrySpot : latestPrice < entrySpot;
        const rawNetProfit = won ? tradeStake * 0.95 : -tradeStake;

        // If profit lock already credited portion to balance, settle only remaining delta
        const alreadySecured = activeTrade.profitLockTriggered ? (activeTrade.profitLockSecuredAmount || 0) : 0;
        const netProfit = Number(rawNetProfit.toFixed(2));
        const returnCredit = won ? tradeStake + (rawNetProfit - alreadySecured) : (alreadySecured > 0 ? alreadySecured : 0);

        setBalance((prevBal) => {
          const finalBalance = Number((prevBal + returnCredit).toFixed(2));
          if (userProfile) {
            if (userProfile.accountMode === 'REAL') {
              updateBalances(undefined, finalBalance);
            } else {
              updateBalances(finalBalance, undefined);
            }
          }
          return finalBalance;
        });

        if (won) {
          sound.play('win');
          voice.speak(`Contract settled with profit of $${(tradeStake * 0.95).toFixed(2)}`, 'calm');
          addLog(`✓ WON trade ${tradeId}: +$${(tradeStake * 0.95).toFixed(2)} (${tradeDirection} @ ${entrySpot.toFixed(3)} -> ${latestPrice.toFixed(3)})`, 'success');
        } else {
          sound.play('loss');
          voice.speak(`Contract closed with loss of $${tradeStake.toFixed(2)}`, 'urgent');
          addLog(`✗ LOST trade ${tradeId}: -$${tradeStake.toFixed(2)} (${tradeDirection} @ ${entrySpot.toFixed(3)} -> ${latestPrice.toFixed(3)})`, 'error');
        }

        // Advanced Agentic Martingale Reasoning & Tactical Adaptation Cycle
        if (martingaleStateRef.current.enabled) {
          const outcome = processMartingaleTradeOutcome(
            martingaleStateRef.current,
            won,
            tradeStake,
            netProfit,
            balance + returnCredit
          );
          setMartingaleState(outcome.nextState);
          martingaleStateRef.current = outcome.nextState;
          setStake(outcome.nextState.currentStake);
          addLog(outcome.actionMessage, won ? 'success' : 'warn');
          addLog(`🧠 ${outcome.tacticalDirective}`, 'info');
        }

        if (indicators?.pattern?.pattern) {
          recordPatternOutcome(indicators.pattern.pattern, won);
        }

        const settledTrade: TradeRecord = {
          ...newTrade,
          exitPrice: latestPrice,
          profit: netProfit,
          result: won ? 'WIN' : 'LOSS',
          holdMs: Math.max(1000, Date.now() - new Date(newTrade.timestamp).getTime()),
        };

        setClosedTrades((currClosed) => [settledTrade, ...currClosed]);

        // Persist trade to Firestore if user logged in
        if (user) {
          setDoc(doc(db, 'trades', tradeId), {
            ...settledTrade,
            uid: user.uid,
          }).catch((err) => console.warn('Firestore trade persist note:', err));
        }

        // Update agent win rates
        setAgents((prevAgents) =>
          prevAgents.map((ag) => {
            if (ag.name === newTrade.agent || newTrade.agent.includes(ag.displayName)) {
              const wins = won ? ag.wins + 1 : ag.wins;
              const trades = ag.trades + 1;
              return {
                ...ag,
                wins,
                trades,
                winRate: trades > 0 ? wins / trades : 0.5,
              };
            }
            return ag;
          })
        );

        // Update bot state tracking
        setBotState((prev) => ({
          ...prev,
          dailyTradeCount: (prev.dailyTradeCount ?? 0) + 1,
          tradesToday: (prev.tradesToday ?? 0) + 1,
          currentDailyLoss: won ? Math.max(0, (prev.currentDailyLoss ?? 0) - netProfit) : (prev.currentDailyLoss ?? 0) + tradeStake,
          consecutiveLosses: won ? 0 : prev.consecutiveLosses + 1,
        }));
      }, simulatedDurationMs);

      tradeTimeoutsRef.current.set(tradeId, timerId);
      setIsExecuting(false);
    },
    [
      isExecuting,
      balance,
      isLiveMode,
      selectedSymbol,
      algorithmicDecision,
      regime,
      addLog,
      user,
      userProfile,
      updateBalances,
      candles,
      indicators,
      decimals,
    ]
  );

  // 5. Autonomous Subagent (sbagent.md) Execution Loop
  const runSubAgentStep = useCallback(async () => {
    if (!indicators || openTrades.length > 0) return;
    try {
      // 1. Fetch live markdown
      const scriptRes = await fetch('/api/subagent/script');
      const scriptData = await scriptRes.json();
      if (!scriptData.success) return;

      // 2. Evaluate with Gemini
      const evalRes = await fetch('/api/subagent/execute-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subagentMarkdown: scriptData.content,
          marketContext: {
            symbol: selectedSymbol,
            currentPrice: currentPriceRef.current,
            regime,
            indicators,
            allowedSymbols: botState.allowedRotationSymbols || [
              '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V', 'R_10', 'R_25', 'R_50', 'R_75', 'R_100'
            ],
            autonomousSymbolChange: botState.autonomousSymbolChange ?? true,
          },
        }),
      });

      const evalData = await evalRes.json();
      if (evalData.success) {
        setLastSubagentDecision({
          action: evalData.action,
          confidence: evalData.confidence,
          rule_matched: evalData.rule_matched,
          reasoning: evalData.reasoning,
          timestamp: new Date().toLocaleTimeString(),
        });

        // Autonomous Symbol Rotation Check
        if (
          evalData.symbol_action === 'SWITCH_SYMBOL' &&
          evalData.recommended_symbol &&
          evalData.recommended_symbol !== selectedSymbol &&
          (botState.autonomousSymbolChange ?? true)
        ) {
          const cooldownSecs = botState.rotationCooldownSeconds || 60;
          const lastRotTime = botState.lastSymbolRotationTime || 0;
          if (Date.now() - lastRotTime > cooldownSecs * 1000) {
            const nextSym = evalData.recommended_symbol;
            addLog(
              `🔄 [SBAgent Auto-Rotation] Switched active market to ${nextSym}: ${
                evalData.symbol_rotation_reason || 'Volatility optimization'
              }`,
              'warn'
            );
            setSelectedSymbol(nextSym);
            derivWS.fetchCandles(nextSym, granularity, 120);
            setBotState((prev) => ({
              ...prev,
              lastSymbolRotationTime: Date.now(),
              lastRotationReason: evalData.symbol_rotation_reason,
            }));
            sound.play('win');
            voice.speak(`SBAgent autonomously rotated market to ${nextSym}`, 'analytical');
            return;
          }
        }

        if (evalData.action === 'BUY' || evalData.action === 'SELL') {
          const dir = evalData.action === 'BUY' ? 'CALL' : 'PUT';
          const dur = evalData.suggested_duration_mins || 15;
          addLog(`🤖 Subagent (sbagent.md) triggered: ${dir} (${evalData.rule_matched})`, 'success');
          executeTrade(dir, stake, dur, 'SUBAGENT_MD');
        }
      }
    } catch (err: any) {
      console.warn('Subagent execution step notice:', err);
    }
  }, [
    indicators,
    openTrades.length,
    selectedSymbol,
    regime,
    stake,
    granularity,
    botState.allowedRotationSymbols,
    botState.autonomousSymbolChange,
    botState.rotationCooldownSeconds,
    botState.lastSymbolRotationTime,
    addLog,
    executeTrade,
  ]);

  // Autonomous Subagent Timer
  useEffect(() => {
    if (!isAutonomousRunning || openTrades.length > 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastSubagentRunTimeRef.current > 15000) {
        lastSubagentRunTimeRef.current = now;
        runSubAgentStep();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [isAutonomousRunning, openTrades.length, runSubAgentStep]);

  // 6. Automated Bot Deliberation Loop
  useEffect(() => {
    if (!botState.enabled || !algorithmicDecision || openTrades.length > 0) return;

    const now = Date.now();
    if (now - lastBotTradeTimeRef.current < 8000) return;

    const currentLoss = botState.currentDailyLoss ?? 0;
    if (currentLoss >= botState.maxDailyLoss) {
      addLog(`Daily loss limit reached ($${currentLoss.toFixed(2)} / $${botState.maxDailyLoss}). Pausing bot.`, 'warn');
      setBotState((b) => ({ ...b, enabled: false }));
      return;
    }

    if (botState.consecutiveLosses >= botState.maxConsecutiveLosses) {
      addLog(`Consecutive loss limit reached (${botState.consecutiveLosses}). Pausing bot for risk cooldown.`, 'warn');
      setBotState((b) => ({ ...b, enabled: false }));
      return;
    }

    const { action, confidence } = algorithmicDecision;
    const minConf = botState.minConfidence ?? 0.38;

    // Check for high-confluence sniper opportunity as an autonomous trigger
    const hasSniperTrigger = sniperSetup?.isPrimed && sniperSetup.score >= 70 && sniperSetup.direction !== 'NEUTRAL';
    const hasAlgorithmicSignal = (action === 'BUY' || action === 'STRONG BUY' || action === 'SELL' || action === 'STRONG SELL') && confidence >= minConf;

    if (!hasAlgorithmicSignal && !hasSniperTrigger) {
      return;
    }

    const tradeDir: 'CALL' | 'PUT' =
      hasSniperTrigger && sniperSetup && sniperSetup.direction !== 'NEUTRAL'
        ? sniperSetup.direction
        : (action === 'BUY' || action === 'STRONG BUY' ? 'CALL' : 'PUT');

    // 3. Strategic Execution & Filtering: Highest-Win Gatekeeper evaluated for BOT's trade direction
    const botWinGate = evaluateHighestWinGate({
      currentPrice,
      candles,
      indicators,
      regime,
      decision: algorithmicDecision,
      direction: tradeDir,
      confluenceScore: sniperSetup?.score ?? 60,
      minWinProbabilityThreshold: 45,
    });

    if (botWinGate && !botWinGate.passed && botWinGate.isGambleSetup) {
      addLog(`🛡️ [RISK GATE] Auto-Bot withheld: High noise setup on ${tradeDir}. Quality: ${botWinGate.qualityGrade}`, 'warn');
      return;
    }

    // 4. Tactical Adaptation Confluence Requirement ONLY when in active recovery deepening!
    if (martingaleState.activeTacticalDeepening) {
      const requiredConfluence = martingaleState.minRecoveryConfluence || 65;
      if (sniperSetup && sniperSetup.score < requiredConfluence) {
        addLog(`🛡️ [MARTINGALE RECOVERY] Awaiting high confluence (${sniperSetup.score}% / ${requiredConfluence}% required).`, 'info');
        return;
      }
    }

    if (botState.aiDirectionMatchRequired && aiPrediction) {
      const aiAction = aiPrediction.recommendation;
      if (
        (tradeDir === 'CALL' && aiAction === 'SELL') ||
        (tradeDir === 'PUT' && aiAction === 'BUY')
      ) {
        addLog(`AI Guardrail: SBAgent disagreed (${aiAction} vs Algorithmic ${tradeDir}). Skipping trade.`, 'warn');
        return;
      }
    }

    lastBotTradeTimeRef.current = now;
    const effectiveStake = martingaleState.enabled
      ? martingaleState.currentStake
      : (botState.stake || stake || 1.0);
    
    if (sniperSetup?.isPrimed && sniperSetup.direction === tradeDir) {
      addLog(`🎯 Auto-Bot SNIPER signal executed: ${tradeDir} (${sniperSetup.score}% confluence, ${sniperSetup.recommendedDuration.label}, Stake $${effectiveStake.toFixed(2)})`, 'success');
      executeTrade(
        tradeDir,
        effectiveStake,
        sniperSetup.recommendedDuration.value,
        'AUTO_BOT',
        sniperSetup.recommendedDuration.unit,
        {
          isSniperTrade: true,
          confluenceScore: sniperSetup.score,
          entryTarget: sniperSetup.optimalEntryPrice,
          takeProfitTarget: sniperSetup.takeProfitPrice,
          stopLossTarget: sniperSetup.stopLossPrice,
        },
        trailingStopConfig
      );
    } else {
      const optDuration = aiPrediction?.suggested_duration || algorithmicDecision.duration || 15;
      addLog(`Auto-Bot signal triggered: ${tradeDir} (Confidence: ${Math.round(confidence * 100)}%, Stake $${effectiveStake.toFixed(2)})`, 'info');
      executeTrade(tradeDir, effectiveStake, optDuration, 'AUTO_BOT', 'minutes', undefined, trailingStopConfig);
    }
  }, [
    botState,
    algorithmicDecision,
    aiPrediction,
    sniperSetup,
    martingaleState,
    trailingStopConfig,
    openTrades.length,
    executeTrade,
    stake,
    addLog,
    currentPrice,
    candles,
    indicators,
    regime,
  ]);

  // Early close position handler
  const handleEarlyExit = (tradeId: string) => {
    const timer = tradeTimeoutsRef.current.get(tradeId);
    if (timer) {
      clearTimeout(timer);
      tradeTimeoutsRef.current.delete(tradeId);
    }

    let trade: TradeRecord | undefined;
    setOpenTrades((currOpen) => {
      trade = currOpen.find((t) => t.id === tradeId);
      if (!trade) return currOpen;
      return currOpen.filter((t) => t.id !== tradeId);
    });

    if (!trade) return;

    const latestPrice = currentPriceRef.current;
    const isCall = trade.decision.includes('BUY') || trade.decision.includes('CALL');
    const inProfit = isCall ? latestPrice > trade.entryPrice : latestPrice < trade.entryPrice;
    const returnAmount = inProfit ? trade.amount * 1.5 : trade.amount * 0.3;
    const profit = returnAmount - trade.amount;

    setBalance((prevBal) => {
      const nextBal = Number((prevBal + returnAmount).toFixed(2));
      if (userProfile) {
        if (userProfile.accountMode === 'REAL') {
          updateBalances(undefined, nextBal);
        } else {
          updateBalances(nextBal, undefined);
        }
      }
      return nextBal;
    });

    const settled: TradeRecord = {
      ...trade,
      exitPrice: latestPrice,
      profit,
      result: inProfit ? ('WIN' as const) : ('LOSS' as const),
      holdMs: Math.max(1000, Date.now() - new Date(trade.timestamp).getTime()),
    };

    if (user) {
      setDoc(doc(db, 'trades', tradeId), {
        ...settled,
        uid: user.uid,
      }).catch((err) => console.warn('Firestore early exit persist note:', err));
    }

    setClosedTrades((currClosed) => [settled, ...currClosed.filter((t) => t.id !== tradeId)]);

    sound.play(inProfit ? 'win' : 'loss');
    addLog(`Early closed position ${tradeId} at ${latestPrice.toFixed(3)} (P&L: ${profit >= 0 ? `+$${profit.toFixed(2)}` : `-$${Math.abs(profit).toFixed(2)}`})`, 'info');
  };

  // 4b. Trailing Stop-Loss Real-Time Ratchet & Exit Evaluation Loop
  useEffect(() => {
    if (openTrades.length === 0 || !currentPrice || currentPrice <= 0) return;

    const hasTSLTrades = openTrades.some((t) => t.trailingStopEnabled && t.currentTrailingStopPrice);
    if (!hasTSLTrades) return;

    const triggeredExits: {
      trade: TradeRecord;
      reason: string;
      profit: number;
    }[] = [];

    const profitLockEvents: {
      tradeId: string;
      securedAmt: number;
    }[] = [];

    setOpenTrades((prevOpen) => {
      let stateChanged = false;
      const updatedList = prevOpen.map((trade) => {
        if (!trade.trailingStopEnabled || !trade.currentTrailingStopPrice) {
          return trade;
        }

        const evalResult = evaluateTrailingStop(trade, currentPrice, decimals);

        // Profit Lock Automation: Safely queue event outside state updater
        if (evalResult.profitLockTriggeredNow && evalResult.profitLockSecuredAmount && evalResult.profitLockSecuredAmount > 0) {
          profitLockEvents.push({
            tradeId: trade.id,
            securedAmt: evalResult.profitLockSecuredAmount,
          });
        }

        if (evalResult.isTriggered) {
          triggeredExits.push({
            trade: evalResult.updatedTrade,
            reason: evalResult.triggerReason || 'Trailing Stop Reached',
            profit: evalResult.settlementProfit,
          });
          return null;
        }

        if (
          evalResult.updatedTrade.currentTrailingStopPrice !== trade.currentTrailingStopPrice ||
          evalResult.updatedTrade.highestFavorablePrice !== trade.highestFavorablePrice ||
          evalResult.updatedTrade.lowestFavorablePrice !== trade.lowestFavorablePrice ||
          evalResult.updatedTrade.lockedInProfit !== trade.lockedInProfit ||
          evalResult.updatedTrade.peakProfit !== trade.peakProfit ||
          evalResult.updatedTrade.profitLockTriggered !== trade.profitLockTriggered
        ) {
          stateChanged = true;
          return evalResult.updatedTrade;
        }

        return trade;
      });

      if (triggeredExits.length > 0) {
        return updatedList.filter((t): t is TradeRecord => t !== null);
      }

      return stateChanged ? (updatedList as TradeRecord[]) : prevOpen;
    });

    // Execute Profit Lock balance & audio effects safely outside the state updater
    if (profitLockEvents.length > 0) {
      profitLockEvents.forEach(({ tradeId, securedAmt }) => {
        setBalance((prevBal) => {
          const nextBal = Number((prevBal + securedAmt).toFixed(2));
          if (userProfile) {
            if (userProfile.accountMode === 'REAL') {
              updateBalances(undefined, nextBal);
            } else {
              updateBalances(nextBal, undefined);
            }
          }
          return nextBal;
        });
        if (settings.audio.soundEnabled) {
          sound.play('win');
        }
        if (settings.audio.voiceEnabled && settings.audio.speakProfitLock) {
          voice.speak(`Profit lock automated! $${securedAmt.toFixed(2)} secured directly into main balance.`, 'calm');
        }
        addLog(
          `🔒 [PROFIT LOCK AUTOMATION] Target threshold reached on ${tradeId}! Exact portion (+$${securedAmt.toFixed(2)}) secured directly into main balance, position continues behind Trailing Stop.`,
          'success'
        );
      });
    }

    if (triggeredExits.length > 0) {
      triggeredExits.forEach(({ trade, reason, profit }) => {
        const timer = tradeTimeoutsRef.current.get(trade.id);
        if (timer) {
          clearTimeout(timer);
          tradeTimeoutsRef.current.delete(trade.id);
        }

        const isWon = profit > 0;
        const returnAmount = Math.max(0, trade.amount + profit);

        setBalance((prevBal) => {
          const nextBal = Math.max(0, Number((prevBal + returnAmount).toFixed(2)));
          if (userProfile) {
            if (userProfile.accountMode === 'REAL') {
              updateBalances(undefined, nextBal);
            } else {
              updateBalances(nextBal, undefined);
            }
          }
          return nextBal;
        });

        // Advanced Agentic Martingale Reasoning & Tactical Adaptation Cycle
        if (martingaleStateRef.current.enabled) {
          const outcome = processMartingaleTradeOutcome(
            martingaleStateRef.current,
            isWon,
            trade.amount,
            profit,
            balance
          );
          setMartingaleState(outcome.nextState);
          martingaleStateRef.current = outcome.nextState;
          setStake(outcome.nextState.currentStake);
          addLog(outcome.actionMessage, isWon ? 'success' : 'warn');
          addLog(`🧠 ${outcome.tacticalDirective}`, 'info');
        }

        const settled: TradeRecord = {
          ...trade,
          exitPrice: currentPrice,
          profit,
          result: isWon ? 'WIN' : 'LOSS',
          exitReason: reason,
          holdMs: Math.max(1000, Date.now() - new Date(trade.timestamp).getTime()),
        };

        setClosedTrades((currClosed) => {
          if (currClosed.some((t) => t.id === trade.id)) return currClosed;
          return [settled, ...currClosed];
        });

        if (user) {
          setDoc(doc(db, 'trades', trade.id), {
            ...settled,
            uid: user.uid,
          }).catch((err) => console.warn('Firestore TSL exit persist note:', err));
        }

        // Update agent win rates
        setAgents((prevAgents) =>
          prevAgents.map((ag) => {
            if (ag.name === trade.agent || trade.agent.includes(ag.displayName)) {
              const wins = isWon ? ag.wins + 1 : ag.wins;
              const trades = ag.trades + 1;
              return {
                ...ag,
                wins,
                trades,
                winRate: trades > 0 ? wins / trades : 0.5,
              };
            }
            return ag;
          })
        );

        // Update bot state tracking if bot opened this
        if (trade.agent.includes('Auto-Bot') || trade.agent.includes('Bot')) {
          setBotState((prev) => ({
            ...prev,
            dailyTradeCount: (prev.dailyTradeCount ?? 0) + 1,
            tradesToday: (prev.tradesToday ?? 0) + 1,
            currentDailyLoss: isWon
              ? Math.max(0, (prev.currentDailyLoss ?? 0) - profit)
              : (prev.currentDailyLoss ?? 0) + Math.abs(profit),
            consecutiveLosses: isWon ? 0 : prev.consecutiveLosses + 1,
          }));
        }

        if (isWon) {
          sound.play('win');
          voice.speak(`Trailing stop locked in profit of $${profit.toFixed(2)} on ${trade.symbol}`, 'calm');
          addLog(
            `🎯 [TRAILING STOP PROFIT] ${trade.id} reached ratchet target at ${currentPrice.toFixed(decimals)} (+$${profit.toFixed(2)}) - ${reason}`,
            'success'
          );
        } else {
          sound.play('loss');
          voice.speak(`Trailing stop executed capital preservation exit at ${currentPrice.toFixed(decimals)}`, 'urgent');
          addLog(
            `🛡️ [TRAILING STOP CAPITAL DEFENSE] ${trade.id} stopped out early at ${currentPrice.toFixed(decimals)} (-$${Math.abs(profit).toFixed(2)}) - ${reason}`,
            'warn'
          );
        }
      });
    }
  }, [currentPrice, decimals, openTrades, user, userProfile, updateBalances, addLog]);

  // Balance Refresh Callback
  const handleRefreshBalance = useCallback(() => {
    setIsRefreshingBalance(true);
    derivWS.refreshBalance();
    sound.play('click');
    setTimeout(() => {
      setIsRefreshingBalance(false);
    }, 1000);
  }, []);

  // Smooth Live / Demo Account Switcher Callback
  const handleToggleLiveMode = useCallback(
    async (targetReal: boolean) => {
      setLocalLiveMode(targetReal);
      const targetMode = targetReal ? 'REAL' : 'DEMO';
      if (userProfile && updateAccountMode) {
        await updateAccountMode(targetMode);
      } else {
        setBalance(targetReal ? 0 : 10.0);
      }
      sound.play('toggle');
    },
    [userProfile, updateAccountMode]
  );

  // Alert Rules & History Management
  const handleUpdateAlertRules = useCallback((newRules: AlertRule[]) => {
    setAlertRules(newRules);
    saveAlertRules(newRules);
  }, []);

  const handleClearAlertHistory = useCallback(() => {
    setTriggeredAlerts([]);
    saveAlertHistory([]);
  }, []);

  // Real-time Algorithmic Alerts Evaluation
  useEffect(() => {
    if (!currentPrice || currentPrice <= 0) return;
    const dailyPnL = closedTrades.reduce((acc, t) => acc + (t.profit || 0), 0);

    evaluateAlerts(
      alertRules,
      {
        symbol: selectedSymbol,
        currentPrice,
        indicators,
        decision: algorithmicDecision,
        aiPrediction,
        regime,
        dailyPnL,
      },
      (triggered, updatedRule) => {
        setTriggeredAlerts((prev) => {
          const next = [triggered, ...prev.slice(0, 49)];
          saveAlertHistory(next);
          return next;
        });

        setAlertRules((prev) => {
          const next = prev.map((r) => (r.id === updatedRule.id ? updatedRule : r));
          saveAlertRules(next);
          return next;
        });

        setActiveToastAlert(triggered);
        setTimeout(() => {
          setActiveToastAlert((curr) => (curr?.id === triggered.id ? null : curr));
        }, 5500);
      }
    );
  }, [currentPrice, indicators, algorithmicDecision, aiPrediction, regime, closedTrades, selectedSymbol, alertRules]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Fixed Header Navbar */}
      <Navbar
        balance={balance}
        currency={currency}
        isLiveMode={isLiveMode}
        isAuthorized={isAuthorized}
        loginid={loginid}
        botEnabled={botState.enabled}
        onToggleBot={() => {
          sound.play('toggle');
          setBotState((prev) => ({ ...prev, enabled: !prev.enabled }));
        }}
        onOpenTokenModal={() => setIsTokenModalOpen(true)}
        onOpenHelpModal={() => setIsHelpModalOpen(true)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onOpenSubAgentModal={() => setIsSubAgentModalOpen(true)}
        onOpenEvolutionModal={() => setIsEvolutionModalOpen(true)}
        onOpenGoogleDocsModal={() => setIsGoogleDocsModalOpen(true)}
        onOpenGoogleKeepModal={() => setIsKeepModalOpen(true)}
        onOpenBrainModal={() => setIsBrainModalOpen(true)}
        onOpenAlertsModal={() => setIsAlertsModalOpen(true)}
        activeAlertsCount={alertRules.filter((r) => r.enabled).length}
        onRefreshBalance={handleRefreshBalance}
        isRefreshingBalance={isRefreshingBalance}
        activeTab={activeTab}
        onTabChange={(tab: any) => setActiveTab(tab)}
        isAutonomousRunning={isAutonomousRunning}
        onOpenSettings={() => {
          setSettingsCategory('overview');
          setIsSettingsDrawerOpen(true);
        }}
        onOpenTheme={() => {
          setSettingsCategory('theme');
          setIsSettingsDrawerOpen(true);
        }}
        onOpenFullscreenWorkspace={() => setIsFullscreenWorkspaceOpen(true)}
      />

      {/* Main Body Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 lg:p-6 pb-28 lg:pb-8 flex flex-col gap-3.5 sm:gap-5">
        {/* Real-time Ticker & Market Header */}
        <LivePriceHeader
          selectedSymbol={selectedSymbol}
          onSymbolChange={(sym) => {
            setSelectedSymbol(sym);
            sound.play('click');
          }}
          currentPrice={currentPrice}
          prevPrice={prevPrice}
          regime={regime}
          volatility={indicators?.volatility ?? 0.002}
          onOpenMarketMatrix={() => setActiveTab('markets')}
        />

        {/* Detailed Authentication Visual & Deriv Connection Matrix */}
        <DetailedAuthVisual
          isLiveMode={isLiveMode}
          onToggleLiveMode={handleToggleLiveMode}
          balance={balance}
          currency={currency}
          loginid={loginid}
          onRefreshBalance={handleRefreshBalance}
          isRefreshingBalance={isRefreshingBalance}
          onOpenTokenModal={() => setIsTokenModalOpen(true)}
          latencyMs={derivWS.getLastLatency()}
        />

        {/* View 1: Main Trading Terminal */}
        {activeTab === 'terminal' && (
          <div className="flex flex-col gap-4">
            {/* Blackbox Quick Status Ribbon */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/90 border border-slate-800 rounded-xl text-xs font-mono shadow-md backdrop-blur-md">
              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveTab('blackbox')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 font-bold transition-all"
                >
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span>BLACKBOX HUB</span>
                </button>
                <span className="text-slate-600 hidden sm:inline">•</span>
                <span className="text-slate-300 flex items-center gap-1">
                  <span>🔒 Profit Lock:</span>
                  <span className="text-amber-400 font-bold">
                    {trailingStopConfig.profitLockEnabled ? `ON (${trailingStopConfig.profitLockThresholdPercent ?? 50}%)` : 'OFF'}
                  </span>
                </span>
                <span className="text-slate-600 hidden sm:inline">•</span>
                <span className="text-slate-300 flex items-center gap-1">
                  <span>Martingale ($1 Anchor):</span>
                  <span className="text-cyan-300 font-bold">
                    ${martingaleState.currentStake.toFixed(2)} (Step {martingaleState.currentStep}/3)
                  </span>
                </span>
                <span className="text-slate-600 hidden sm:inline">•</span>
                <span className="text-slate-300 flex items-center gap-1">
                  <span>Win Filter Gate:</span>
                  <span className={`font-bold ${highestWinGate?.passed ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {highestWinGate?.passed ? `PASSED (${highestWinGate.winProbabilityScore}%)` : 'SELECTIVE'}
                  </span>
                </span>
              </div>

              {!isLiveMode && balance < 2.0 && (
                <button
                  type="button"
                  onClick={handleReplenishVirtualAnchor}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold hover:bg-amber-500/30 transition-all animate-pulse"
                >
                  Replenish Anchor ($10)
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
              {/* Left Column: Interactive Canvas Chart & Active Positions */}
              <div className="lg:col-span-8 flex flex-col gap-4 sm:gap-5">
              <InteractiveChart
                candles={candles}
                currentPrice={currentPrice}
                openTrades={openTrades}
                closedTrades={closedTrades}
                indicators={indicators}
                granularity={granularity}
                onGranularityChange={(g) => setGranularity(g)}
                onRefresh={() => {
                  derivWS.fetchCandles(selectedSymbol, granularity, 120);
                  triggerAIScan();
                }}
                symbol={selectedSymbol}
                aiPrediction={aiPrediction}
                onExecuteTrade={(dir) => executeTrade(dir, stake, duration, 'MANUAL', durationUnit, undefined, trailingStopConfig)}
                stake={stake}
                onStakeChange={setStake}
                isExecuting={isExecuting}
                currency={currency}
                algorithmicDecision={algorithmicDecision}
                regime={regime}
                agents={agents}
                sniperSetup={sniperSetup}
              />

              <PositionsDrawer
                openTrades={openTrades}
                closedTrades={closedTrades}
                currentPrice={currentPrice}
                onEarlyExit={handleEarlyExit}
                onOpenCritiqueModal={(trade) => setSelectedCritiqueTrade(trade)}
              />
            </div>

            {/* Right Column: Trade Execution Deck & AI Intelligence Card */}
            <div className="lg:col-span-4 flex flex-col gap-5">
              <TradeControls
                stake={stake}
                onStakeChange={setStake}
                duration={duration}
                durationUnit={durationUnit}
                onDurationChange={(dur, unit) => {
                  setDuration(dur);
                  if (unit) setDurationUnit(unit);
                }}
                direction={direction}
                onDirectionChange={setDirection}
                onExecuteTrade={(customTSL) =>
                  executeTrade(direction, stake, duration, 'MANUAL', durationUnit, undefined, customTSL ?? trailingStopConfig)
                }
                isExecuting={isExecuting}
                aiPrediction={aiPrediction}
                algorithmicDecision={algorithmicDecision}
                currency={currency}
                isLiveMode={isLiveMode}
                sizingMode={sizingMode}
                onSizingModeChange={setSizingMode}
                riskMetrics={coreRiskMetrics}
                recommendedKellyStake={dynamicStake}
                sniperSetup={sniperSetup}
                currentPrice={currentPrice}
                trailingStopConfig={trailingStopConfig}
                onTrailingStopConfigChange={(cfg) => {
                  setTrailingStopConfig(cfg);
                  updateTrailingStop(cfg);
                }}
                onExecuteSniperTrade={(dir, s, dur, unit, sniperTSL) => {
                  executeTrade(
                    dir,
                    s,
                    dur,
                    'MANUAL',
                    unit,
                    {
                      isSniperTrade: true,
                      confluenceScore: sniperSetup?.score || 85,
                      entryTarget: sniperSetup?.optimalEntryPrice || currentPrice,
                      takeProfitTarget: sniperSetup?.takeProfitPrice,
                      stopLossTarget: sniperSetup?.stopLossPrice,
                    },
                    sniperTSL ?? trailingStopConfig
                  );
                }}
                isSniperTriggerArmed={isSniperTriggerArmed}
                onToggleSniperTrigger={() => {
                  setIsSniperTriggerArmed(!isSniperTriggerArmed);
                  sound.play('toggle');
                }}
              />

              <AIPredictionCard
                prediction={aiPrediction}
                isLoading={isLoadingAI}
                onRefresh={triggerAIScan}
                symbol={selectedSymbol}
              />
            </div>
          </div>
        </div>
      )}

        {/* View 2: Multi-Agent & Mathematical Analytics */}
        {activeTab === 'analytics' && (
          <div className="flex flex-col gap-6">
            {/* D3-based Daily Cumulative P&L Historical Curve & Ledger */}
            <DailyCumulativePnLChart
              closedTrades={closedTrades}
              currency={currency}
              currentBalance={balance}
            />

            <MultiAgentMatrix agents={agents} decision={algorithmicDecision} />
            <TechnicalAnalyticsView
              indicators={indicators}
              regime={regime}
              symbol={selectedSymbol}
              candlesCount={candles.length}
              onOpenGoogleDocsModal={() => setIsGoogleDocsModalOpen(true)}
            />
            <BotAutoTrader
              botState={botState}
              onUpdateBotState={(updates) => setBotState((prev) => ({ ...prev, ...updates }))}
              logs={botLogs}
              onClearLogs={() => setBotLogs([])}
              martingaleState={martingaleState}
              onUpdateMartingaleState={(updates) => setMartingaleState((prev) => ({ ...prev, ...updates }))}
              highestWinGate={highestWinGate}
              marketStability={marketStability}
            />
          </div>
        )}

        {/* View 3: Gemini Co-Pilot Chat */}
        {activeTab === 'copilot' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8">
              <AICopilotChat
                symbol={selectedSymbol}
                currentPrice={currentPrice}
                regime={regime}
                indicators={indicators}
                botEnabled={botState.enabled}
                pnl={closedTrades.reduce((acc, t) => acc + (t.profit || 0), 0)}
                winRate={coreRiskMetrics.winRate}
                maxDrawdown={coreRiskMetrics.maxDrawdownPercent}
                profitFactor={coreRiskMetrics.profitFactor}
                currentStake={coreRiskMetrics.recommendedKellyStake ?? stake}
                balance={balance}
                onExpandFullscreen={() => setIsFullscreenWorkspaceOpen(true)}
              />
            </div>
            <div className="lg:col-span-4 flex flex-col gap-5">
              <AIPredictionCard
                prediction={aiPrediction}
                isLoading={isLoadingAI}
                onRefresh={triggerAIScan}
                symbol={selectedSymbol}
              />
              <MultiAgentMatrix agents={agents} decision={algorithmicDecision} />
            </div>
          </div>
        )}

        {/* View 4: Market Win/Loss Matrix & Manual Rotation Decision Hub */}
        {activeTab === 'markets' && (
          <div className="flex flex-col gap-6">
            <SymbolPerformanceMatrix
              allowedSymbols={botState.allowedRotationSymbols}
              closedTrades={closedTrades}
              selectedSymbol={selectedSymbol}
              onSelectSymbol={(sym) => {
                setSelectedSymbol(sym);
                derivWS.fetchCandles(sym, granularity, 120);
                sound.play('click');
              }}
              currency={currency}
              regime={regime}
              onOpenAutoRotationConfig={() => {
                setSettingsCategory('sbagent');
                setIsSettingsDrawerOpen(true);
              }}
            />
          </div>
        )}

        {/* View 5: Autonomous Intelligence Hub (Blackbox) */}
        {activeTab === 'blackbox' && (
          <BlackboxHubView
            symbol={selectedSymbol}
            currentPrice={currentPrice}
            regime={regime}
            indicators={indicators}
            agents={agents}
            decision={algorithmicDecision}
            sniperSetup={sniperSetup}
            highestWinGate={highestWinGate}
            marketStability={marketStability}
            martingaleState={martingaleState}
            onUpdateMartingaleState={(updates) => setMartingaleState((prev) => ({ ...prev, ...updates }))}
            trailingStopConfig={trailingStopConfig}
            onUpdateTrailingStopConfig={setTrailingStopConfig}
            botEnabled={botState.enabled}
            onToggleBot={() => {
              sound.play('toggle');
              setBotState((prev) => ({ ...prev, enabled: !prev.enabled }));
            }}
            balance={balance}
            onReplenishVirtualAnchor={handleReplenishVirtualAnchor}
            onSelectSymbol={(sym) => {
              setSelectedSymbol(sym);
              derivWS.fetchCandles(sym, granularity, 120);
              derivWS.subscribeTicks(sym);
            }}
          />
        )}
      </main>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      <SubAgentEditorModal
        isOpen={isSubAgentModalOpen}
        onClose={() => setIsSubAgentModalOpen(false)}
        onRunAutonomousStep={runSubAgentStep}
        isAutonomousRunning={isAutonomousRunning}
        lastAutonomousDecision={lastSubagentDecision}
        onToggleAutonomous={() => {
          setIsAutonomousRunning(!isAutonomousRunning);
          sound.play('toggle');
        }}
      />

      <AgentEvolutionModal
        isOpen={isEvolutionModalOpen}
        onClose={() => setIsEvolutionModalOpen(false)}
        agents={agents}
        evolutionLogs={evolutionLogs}
        onTriggerEvolution={triggerAgentEvolution}
        isEvolving={isEvolving}
      />

      <AccountTokenModal
        isOpen={isTokenModalOpen}
        onClose={() => setIsTokenModalOpen(false)}
        isLiveMode={isLiveMode}
        onToggleLiveMode={(val) => {
          // Handled via AccountModeSwitcher
        }}
      />

      <TradeCritiqueModal
        trade={selectedCritiqueTrade}
        isOpen={!!selectedCritiqueTrade}
        onClose={() => setSelectedCritiqueTrade(null)}
      />

      <PlatformHelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
      />

      <GoogleDocsModal
        isOpen={isGoogleDocsModalOpen}
        onClose={() => setIsGoogleDocsModalOpen(false)}
        reportData={{
          symbol: selectedSymbol,
          currentPrice,
          granularity,
          indicators,
          decision: algorithmicDecision,
          aiPrediction,
          openTrades,
          tradeHistory: closedTrades,
          accountMode: isLiveMode ? 'REAL' : 'DEMO',
          balance,
          currency,
          riskMetrics: coreRiskMetrics,
        }}
      />

      {/* Google Keep Trading Notes & Checklists Modal */}
      <GoogleKeepNotesModal
        isOpen={isKeepModalOpen}
        onClose={() => setIsKeepModalOpen(false)}
        currentSymbol={selectedSymbol}
        currentRegime={regime.type}
        currentPrice={currentPrice}
      />

      {/* SBAgent Brain Anatomy & Cognitive Graph Modal */}
      <BrainAnatomyModal
        isOpen={isBrainModalOpen}
        onClose={() => setIsBrainModalOpen(false)}
        symbol={selectedSymbol}
        currentPrice={currentPrice}
        indicators={indicators}
        regime={regime}
        riskMetrics={coreRiskMetrics}
      />

      {/* Advanced Algorithmic Alerts Modal */}
      <AdvancedAlertsModal
        isOpen={isAlertsModalOpen}
        onClose={() => setIsAlertsModalOpen(false)}
        rules={alertRules}
        onUpdateRules={handleUpdateAlertRules}
        triggeredHistory={triggeredAlerts}
        onClearHistory={handleClearAlertHistory}
        currentSymbol={selectedSymbol}
        currentPrice={currentPrice}
      />

      {/* Floating Triggered Alert Toast Notification */}
      {activeToastAlert && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounceIn flex items-start gap-3 p-4 bg-slate-900 border border-amber-500/60 rounded-2xl shadow-2xl backdrop-blur-md max-w-md">
          <div
            className={`p-2 rounded-xl shrink-0 ${
              activeToastAlert.severity === 'critical'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                : activeToastAlert.severity === 'warning'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
            }`}
          >
            <Bell className="w-5 h-5 animate-pulse" />
          </div>
          <div className="flex-1 flex flex-col gap-0.5 font-mono">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-xs text-slate-100">{activeToastAlert.title}</span>
              <span className="text-[10px] text-amber-400 font-semibold">TRIGGERED</span>
            </div>
            <p className="text-xs text-slate-300 font-sans">{activeToastAlert.message}</p>
          </div>
          <button
            onClick={() => setActiveToastAlert(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sticky Mobile Execution Bar (Mobile-first, touch-optimized) */}
      <MobileExecutionBar
        stake={stake}
        onStakeChange={setStake}
        duration={duration}
        onDurationChange={setDuration}
        onExecute={(dir) => executeTrade(dir, stake, duration, 'MANUAL')}
        isExecuting={isExecuting}
        botActive={botState.enabled}
        isAutonomousRunning={isAutonomousRunning}
        currency={currency}
        isLiveMode={isLiveMode}
      />

      {/* System Copilot Persistent FAB & Bottom-Sheet */}
      <SystemCopilotBottomSheet
        symbol={selectedSymbol}
        currentPrice={currentPrice}
        timeframe={`${Math.round(granularity / 60)}m`}
        candles={candles}
        indicators={indicators}
        regime={regime}
        aiPrediction={aiPrediction}
        openTrades={openTrades}
        closedTrades={closedTrades}
        balance={balance}
        stake={stake}
        botState={botState}
        isLiveMode={isLiveMode}
        currency={currency}
        latencyMs={derivWS.getLastLatency()}
      />

      {/* Slide-in Mobile Settings Drawer */}
      <SettingsDrawer
        isOpen={isSettingsDrawerOpen}
        onClose={() => setIsSettingsDrawerOpen(false)}
        stake={stake}
        onStakeChange={setStake}
        duration={duration}
        onDurationChange={setDuration}
        isLiveMode={isLiveMode}
        onToggleLiveMode={() => handleToggleLiveMode(!isLiveMode)}
        botState={botState}
        onUpdateBotState={(updates) => setBotState((prev) => ({ ...prev, ...updates }))}
        selectedSymbol={selectedSymbol}
        onSymbolChange={setSelectedSymbol}
        granularity={granularity}
        onGranularityChange={setGranularity}
        onOpenTokenModal={() => setIsTokenModalOpen(true)}
        latencyMs={derivWS.getLastLatency()}
        onRefreshBalance={handleRefreshBalance}
        closedTradesCount={closedTrades.length}
        closedTrades={closedTrades}
        currency={currency}
        initialCategory={settingsCategory}
        onClearHistory={() => setClosedTrades([])}
        indicators={indicators}
        currentPrice={currentPrice}
        regime={regime}
        riskMetrics={coreRiskMetrics}
        isAutonomousRunning={isAutonomousRunning}
        onToggleAutonomous={() => setIsAutonomousRunning(!isAutonomousRunning)}
        onOpenSubAgentModal={() => setIsSubAgentModalOpen(true)}
        trailingStopConfig={trailingStopConfig}
        onTrailingStopConfigChange={setTrailingStopConfig}
        onReplenishVirtualAnchor={handleReplenishVirtualAnchor}
      />

      {/* Fullscreen High-Density Trading Workspace Expansion */}
      <FullscreenWorkspace
        isOpen={isFullscreenWorkspaceOpen}
        onClose={() => setIsFullscreenWorkspaceOpen(false)}
        symbol={selectedSymbol}
        candles={candles}
        indicators={indicators}
        currentPrice={currentPrice}
        openTrades={openTrades}
        closedTrades={closedTrades}
        granularity={granularity}
        onGranularityChange={(g) => setGranularity(g)}
        onRefresh={() => {
          derivWS.fetchCandles(selectedSymbol, granularity, 120);
          triggerAIScan();
        }}
        regime={regime}
        botEnabled={botState.enabled}
        totalPnL={closedTrades.reduce((acc, t) => acc + (t.profit || 0), 0)}
        winRate={coreRiskMetrics.winRate}
        coreRiskMetrics={coreRiskMetrics}
        aiPrediction={aiPrediction}
        stake={stake}
        onStakeChange={setStake}
        onExecuteTrade={(dir) => executeTrade(dir, stake, duration, 'MANUAL', durationUnit, undefined, trailingStopConfig)}
        isExecuting={isExecuting}
        currency={currency}
        balance={balance}
      />

      {/* Interactive Hands-Free Voice Command Execution HUD */}
      <VoiceCommandHUD
        onExecuteTrade={(dir) => {
          executeTrade(dir, stake, duration, 'MANUAL', durationUnit, undefined, trailingStopConfig);
        }}
        onDurationChange={(dur, unit) => {
          setDuration(dur);
          if (unit) setDurationUnit(unit);
        }}
        onStakeChange={(newStake) => {
          setStake(newStake);
        }}
        onToggleBot={() => {
          sound.play('toggle');
          setBotState((prev) => ({ ...prev, enabled: !prev.enabled }));
        }}
        onToggleSniper={() => {
          sound.play('toggle');
          setIsSniperTriggerArmed((prev) => !prev);
        }}
        onReplenishAnchor={handleReplenishVirtualAnchor}
        onSelectSymbol={(sym) => {
          setSelectedSymbol(sym);
          derivWS.fetchCandles(sym, granularity, 120);
          derivWS.subscribeTicks(sym);
        }}
        currentStake={stake}
        currentDuration={duration}
        currentDurationUnit={durationUnit}
        botEnabled={botState.enabled}
        isSniperArmed={isSniperTriggerArmed}
        currency={currency}
      />

      {/* Global AI Voice Engine Waveform & Talking Indicator Broadcast Banner */}
      <VoiceBroadcastBanner
        onOpenSettings={() => {
          setSettingsCategory('voice');
          setIsSettingsDrawerOpen(true);
        }}
      />
    </div>
  );
}
