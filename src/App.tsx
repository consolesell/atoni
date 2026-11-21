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
  BalanceSnapshot,
  ExecutionSource,
} from './types/trading';
import { derivWS, DEFAULT_DERIV_APP_ID } from './lib/derivWS';
import { balanceManager } from './lib/balanceManager';
import { portfolioReconciler } from './lib/portfolioReconciler';
import { tradeReadinessGuard } from './lib/readinessGuard';
import { autonomyManager } from './lib/autonomyManager';
import { executionController } from './lib/executionController';
import { earlySellingEngine } from './lib/earlySellingEngine';
import { intelligenceManager } from './lib/intelligenceManager';
import { aiActionRegistry } from './lib/aiActionRegistry';
import { strategyEvolutionManager } from './lib/strategyEvolutionManager';
import { memoryManager } from './lib/memoryManager';
import { sessionManager, SessionRecoveryPlan } from './lib/sessionManager';
import { firebaseSyncManager } from './lib/firebaseSyncManager';
import { configurationManager, DEFAULT_EARLY_EXIT_POLICY } from './lib/configurationManager';
import { isDemoAccount } from './lib/derivAccounts';
import { DERIV_SYMBOLS, getSymbolDetails } from './lib/derivSymbols';
import {
  analyzeAllIndicators,
} from './lib/indicators';
import {
  DEFAULT_AGENTS,
  runAlgorithmicDecisionEngine,
} from './lib/decisionEngine';
import { getAIRequestHeaders } from './lib/aiClientConfig';
import { useIndicatorWorker } from './hooks/useIndicatorWorker';
import { sound } from './lib/soundEngine';
import { voice } from './lib/voiceEngine';
import { notifyHostReady, hostHaptic, hostKeepScreenOn, hostToast, hostSpeak } from './lib/nativeHost';
import { calculateCoreRiskMetrics, calculateDynamicStake, validateDerivDuration } from './lib/riskEngine';
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
import { calculateDerivRealtimePnL } from './lib/derivPnL';
import { useConfigStore } from './features/config/configStore';

// Components
import { Navbar } from './components/Navbar';
import { LivePriceHeader } from './components/LivePriceHeader';
import { TerminalView } from './components/TerminalView';
import { AIPredictionCard } from './components/AIPredictionCard';
import { MultiAgentMatrix } from './components/MultiAgentMatrix';
import { BotAutoTrader } from './components/BotAutoTrader';
import { TechnicalAnalyticsView } from './components/TechnicalAnalyticsView';
import { AICopilotChat } from './components/AICopilotChat';
import { BlackboxSkeleton } from './components/BlackboxSkeleton';
import { AccountTokenModal } from './components/AccountTokenModal';

// Lazy-loaded heavy 3D visualizations
const BlackboxHubView = React.lazy(() =>
  import('./components/BlackboxHubView').then((m) => ({ default: m.BlackboxHubView }))
);
import { TradeCritiqueModal } from './components/TradeCritiqueModal';
import { PlatformHelpModal } from './components/PlatformHelpModal';
import { AuthModal } from './components/AuthModal';
import { SubAgentEditorModal } from './components/SubAgentEditorModal';
import { AgentEvolutionModal } from './components/AgentEvolutionModal';
import { StrategyEvolutionModal, StrategyMutationProposal } from './components/StrategyEvolutionModal';
import { GoogleDocsModal } from './components/GoogleDocsModal';
import { GoogleKeepNotesModal } from './components/GoogleKeepNotesModal';
import { QuickSettingsModal } from './components/QuickSettingsModal';
import { autoSyncEngine } from './lib/autoSyncEngine';
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
import { AuditLogModal } from './components/AuditLogModal';
import { OnboardingTourModal } from './components/OnboardingTourModal';
import { AutonomyConfigModal } from './components/AutonomyConfigModal';
import {
  AutonomyMode,
  AutonomyPreset,
  AppliedAutonomySettings,
  AutonomySessionContext,
} from './types/autonomy';
import {
  SBAgent,
  loadAutonomyPreset,
  saveAutonomyPreset,
  validateAutonomyPrerequisites,
} from './lib/sbagentAutonomyEngine';
import { auditLogger } from './lib/auditLogger';
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
  const { user, userProfile, updateBalances, updateAccountMode, signInWithDerivOAuth, googleAccessToken } = useAuth();
  const { settings, updateTrailingStop } = useTerminalSettings();

  // Navigation & Views
  const [activeTab, setActiveTab] = useState<'terminal' | 'analytics' | 'copilot' | 'markets' | 'blackbox'>('terminal');
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>('overview');

  // Startup session recovery plan (restores UI & open-contract monitoring safely without auto-starting autonomy)
  const [sessionRecoveryPlan] = useState<SessionRecoveryPlan>(() => sessionManager.buildStartupRecoveryPlan());
  const [recoveryBannerDismissed, setRecoveryBannerDismissed] = useState<boolean>(false);
  const restoredContractsSubscribedRef = useRef<boolean>(false);

  // Asset & Market State
  const [selectedSymbol, setSelectedSymbol] = useState<string>(() =>
    sessionRecoveryPlan.restoreUiConfig && sessionRecoveryPlan.snapshot?.symbol
      ? sessionRecoveryPlan.snapshot.symbol
      : settings.general.defaultSymbol || '1HZ10V'
  );
  const symbolDetails = useMemo(() => getSymbolDetails(selectedSymbol), [selectedSymbol]);
  const decimals = symbolDetails.decimals ?? 2;
  const [granularity, setGranularity] = useState<number>(() =>
    sessionRecoveryPlan.restoreUiConfig && sessionRecoveryPlan.snapshot?.granularity
      ? sessionRecoveryPlan.snapshot.granularity
      : 60
  );
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [prevPrice, setPrevPrice] = useState<number>(0);
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

  // Trade Execution Deck State
  const [stake, setStake] = useState<number>(() => settings.general.defaultStake ?? 1.0);
  const [sizingMode, setSizingMode] = useState<PositionSizingMode>(() => settings.risk.sizingMode ?? 'KELLY_HALF');
  const [duration, setDuration] = useState<number>(() => settings.general.defaultDuration ?? 15);
  const [durationUnit, setDurationUnit] = useState<TradeDurationUnit>(() => settings.general.defaultDurationUnit ?? 'minutes');
  const [direction, setDirection] = useState<'CALL' | 'PUT'>(() => settings.general.defaultDirection ?? 'CALL');
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const isExecutingRef = useRef<boolean>(false);
  const [isSniperTriggerArmed, setIsSniperTriggerArmed] = useState<boolean>(false);

  // Positions & Balance (Driven strictly by live Deriv authorize & BalanceManager stream)
  const [openTrades, setOpenTrades] = useState<TradeRecord[]>([]);
  const [closedTrades, setClosedTrades] = useState<TradeRecord[]>([]);
  const [balanceSnapshot, setBalanceSnapshot] = useState<BalanceSnapshot>(() => balanceManager.getSnapshot());
  const [balance, setBalance] = useState<number>(() => balanceManager.getSnapshot().amount);
  const [currency, setCurrency] = useState<string>(() => balanceManager.getSnapshot().currency || 'USD');
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [loginid, setLoginid] = useState<string | null>(null);
  const [emergencyStopActive, setEmergencyStopActive] = useState<boolean>(false);

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
      confidence: algorithmicDecision?.confidence ?? 0.62,
      symbol: selectedSymbol,
      regime,
      closedTrades,
      mode: sizingMode,
      fixedStake: 1.0,
      minStake: 1.0,
    });
    return res.recommendedStake;
  }, [sizingMode, balance, aiPrediction?.ai_predicted_win_probability, algorithmicDecision?.confidence, selectedSymbol, regime, closedTrades, martingaleState.enabled, martingaleState.currentStake]);

  // Keep stake synchronized with dynamic Kelly / Martingale stake when not in manual fixed mode
  useEffect(() => {
    if (sizingMode !== 'FIXED') {
      setStake(dynamicStake);
    }
  }, [sizingMode, dynamicStake]);

  // Determine current active mode (DEMO vs REAL from profile or default)
  const [localLiveMode, setLocalLiveMode] = useState<boolean>(false);
  const isLiveMode = userProfile ? userProfile.accountMode === 'REAL' : localLiveMode;

  // Subscribe to centralized BalanceManager snapshots and keep staleness reactive
  useEffect(() => {
    setBalanceSnapshot(balanceManager.getSnapshot());
    const unsub = balanceManager.subscribe((snap) => {
      setBalanceSnapshot(snap);
      if (snap.connection_state === 'ONLINE' || snap.freshness === 'LIVE' || snap.freshness === 'SYNCING') {
        setBalance(snap.amount);
        if (snap.currency) setCurrency(snap.currency);
      } else if (snap.connection_state === 'OFFLINE' || snap.freshness === 'UNAVAILABLE') {
        setBalance(0);
      }
    });
    const staleCheckInterval = setInterval(() => {
      balanceManager.refreshStaleness();
    }, 5000);
    return () => {
      clearInterval(staleCheckInterval);
      unsub();
    };
  }, []);

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

  // Unified Autonomy Control, Strategy Evolution & SBAgent Auto-Grant State
  const [autonomySnapshot, setAutonomySnapshot] = useState(() => autonomyManager.getSnapshot());
  const [strategyState, setStrategyState] = useState(() => strategyEvolutionManager.getState());
  const [autonomyMode, setAutonomyMode] = useState<AutonomyMode>('OFF');
  const [sbagentAutonomyGrant, setSbagentAutonomyGrant] = useState<boolean>(false);
  const [autonomyPreset, setAutonomyPreset] = useState<AutonomyPreset>(() => loadAutonomyPreset());
  const [appliedAutonomySettings, setAppliedAutonomySettings] = useState<AppliedAutonomySettings | null>(null);
  const [lastAutonomyError, setLastAutonomyError] = useState<string[] | string | null>(null);
  const [isAutonomyConfigOpen, setIsAutonomyConfigOpen] = useState<boolean>(false);
  const [isStrategyEvolutionOpen, setIsStrategyEvolutionOpen] = useState<boolean>(false);
  const [activeStrategyProposal, setActiveStrategyProposal] = useState<StrategyMutationProposal | null>(null);

  // Modals
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSubAgentModalOpen, setIsSubAgentModalOpen] = useState(false);
  const [isEvolutionModalOpen, setIsEvolutionModalOpen] = useState(false);
  const [isGoogleDocsModalOpen, setIsGoogleDocsModalOpen] = useState(false);
  const [isKeepModalOpen, setIsKeepModalOpen] = useState(false);
  const [isQuickSettingsOpen, setIsQuickSettingsOpen] = useState(false);
  const [lastAutoSyncTime, setLastAutoSyncTime] = useState<number | null>(null);
  const [isBrainModalOpen, setIsBrainModalOpen] = useState(false);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isFullscreenWorkspaceOpen, setIsFullscreenWorkspaceOpen] = useState(false);
  const [isAuditLogOpen, setIsAuditLogOpen] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
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
  const openTradesRef = useRef<TradeRecord[]>(openTrades);
  const userRef = useRef(user);
  const userProfileRef = useRef(userProfile);
  const updateBalancesRef = useRef(updateBalances);
  const updateAccountModeRef = useRef(updateAccountMode);
  const indicatorsRef = useRef(indicators);
  const loginidRef = useRef<string | null>(loginid);
  const isLiveModeRef = useRef<boolean>(isLiveMode);
  const addLogRef = useRef<((message: string, type?: 'info' | 'success' | 'warn' | 'error') => void) | null>(null);
  const settledContractIdsRef = useRef<Set<number | string>>(new Set());
  const closingContractIdsRef = useRef<Set<number | string>>(new Set());
  const tslSellRequestedRef = useRef<Set<number | string>>(new Set());

  // Keep refs synchronized for async/WS callbacks
  useEffect(() => {
    currentPriceRef.current = currentPrice;
  }, [currentPrice]);
  useEffect(() => {
    openTradesRef.current = openTrades;
  }, [openTrades]);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    userProfileRef.current = userProfile;
  }, [userProfile]);
  useEffect(() => {
    updateBalancesRef.current = updateBalances;
  }, [updateBalances]);
  useEffect(() => {
    updateAccountModeRef.current = updateAccountMode;
  }, [updateAccountMode]);
  useEffect(() => {
    indicatorsRef.current = indicators;
  }, [indicators]);
  useEffect(() => {
    loginidRef.current = loginid;
  }, [loginid]);
  useEffect(() => {
    isLiveModeRef.current = isLiveMode;
  }, [isLiveMode]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      tradeTimeoutsRef.current.forEach((timer) => clearTimeout(timer));
      tradeTimeoutsRef.current.clear();
    };
  }, []);

  // Subscribe to centralized AutonomyManager, StrategyEvolutionManager & ExecutionController portfolio context
  useEffect(() => {
    const unsubAutonomy = autonomyManager.subscribe((snap) => {
      setAutonomySnapshot(snap);
      if (snap.lifecycle === 'OFF' || snap.lifecycle === 'STOPPING' || snap.lifecycle === 'ERROR') {
        setIsAutonomousRunning(false);
        setSbagentAutonomyGrant(false);
        setAutonomyMode('OFF');
        setBotState((b) => (b.enabled ? { ...b, enabled: false } : b));
      } else if (snap.lifecycle === 'PAUSED') {
        setIsAutonomousRunning(false);
        setSbagentAutonomyGrant(false);
        setAutonomyMode('ARMED');
        setBotState((b) => (b.enabled ? { ...b, enabled: false } : b));
      }
    });
    const unsubStrategy = strategyEvolutionManager.subscribe((next) => {
      setStrategyState(next);
      configurationManager.update(
        () => ({ activeStrategyVersion: next.activeVersion }),
        false
      );
    });
    return () => {
      unsubAutonomy();
      unsubStrategy();
    };
  }, []);

  const botStateRef = useRef(botState);
  useEffect(() => {
    botStateRef.current = botState;
  }, [botState]);

  const coreRiskMetricsRef = useRef(coreRiskMetrics);
  useEffect(() => {
    coreRiskMetricsRef.current = coreRiskMetrics;
  }, [coreRiskMetrics]);

  useEffect(() => {
    executionController.setPortfolioProvider({
      getOpenTrades: () => openTradesRef.current,
      getDailyLoss: () => botStateRef.current.currentDailyLoss ?? 0,
      getDrawdownPercent: () => coreRiskMetricsRef.current.maxDrawdownPercent,
      getConsecutiveLosses: () => botStateRef.current.consecutiveLosses ?? 0,
      getDailyTradesCount: () => botStateRef.current.dailyTradeCount ?? 0,
    });
  }, []);

  // Invalidate cached/active AI prediction whenever symbol, granularity, or strategy version changes
  useEffect(() => {
    intelligenceManager.invalidateCurrentPrediction('market_context_changed');
    setAiPrediction(null);
  }, [selectedSymbol, granularity, strategyState.activeVersion]);

  // Persist sanitized session state (never storing secrets/tokens) & queue cloud session sync
  useEffect(() => {
    const selectedAcct = derivWS.getSelectedAccount();
    const snap = sessionManager.saveSession({
      accountRef: loginid
        ? {
            accountId: selectedAcct?.account_id || loginid,
            loginId: loginid,
            accountType: isLiveMode ? 'real' : 'demo',
            currency,
          }
        : null,
      symbol: selectedSymbol,
      granularity,
      activeStrategyVersion: strategyState.activeVersion,
      executionMode: autonomySnapshot.executionMode,
      autonomyLifecycle: autonomySnapshot.lifecycle,
      autonomyPermissions: autonomySnapshot.permissions,
      openTrades,
      pendingIntentIds: portfolioReconciler.getPendingIntents().map((p) => p.intentId),
      interruptedCleanly: autonomySnapshot.lifecycle === 'OFF',
    });
    if (user?.uid) {
      void firebaseSyncManager
        .enqueueSync({
          uid: user.uid,
          collectionName: 'sessions',
          docId: 'active_session',
          data: snap,
          version: snap.version,
          updatedAt: snap.lastSavedAt,
          flushImmediately: false,
        })
        .catch(() => {});
    }
  }, [
    user?.uid,
    loginid,
    isLiveMode,
    currency,
    selectedSymbol,
    granularity,
    strategyState.activeVersion,
    autonomySnapshot.executionMode,
    autonomySnapshot.lifecycle,
    autonomySnapshot.permissions,
    openTrades,
  ]);

  // Recover open-contract monitoring once authorized without auto-starting autonomous purchasing
  useEffect(() => {
    if (!isAuthorized || restoredContractsSubscribedRef.current) return;
    restoredContractsSubscribedRef.current = true;
    const refs = sessionRecoveryPlan.snapshot?.openContractRefs || [];
    if (refs.length > 0 || sessionRecoveryPlan.requiresReconciliation) {
      refs.forEach((c) => {
        derivWS.subscribeProposalOpenContract(c.contractId);
      });
      void derivWS
        .requestReconciliationSnapshot()
        .then(({ openContracts, settledTransactions, portfolioVerified, statementVerified }) => {
          portfolioReconciler.reconcile({
            openTrades: openTradesRef.current,
            broker: {
              openPortfolioContracts: openContracts,
              settledTransactions,
              portfolioChecked: portfolioVerified,
              statementChecked: statementVerified,
            },
          });
          if (Array.isArray(openContracts) && openContracts.length > 0) {
            openContracts.forEach((oc: any) => {
              if (oc?.contract_id) {
                derivWS.subscribeProposalOpenContract(oc.contract_id);
              }
            });
            addLogRef.current?.(
              `Resumed monitoring ${openContracts.length} open Deriv contract(s) safely after startup.`,
              'info'
            );
          }
        })
        .catch(() => {});
    }
  }, [isAuthorized, sessionRecoveryPlan]);

  // 10-Minute Intelligent Auto-Sync payload registration & listener
  useEffect(() => {
    autoSyncEngine.registerPayloadGetter(() => ({
      uid: user?.uid,
      symbol: selectedSymbol,
      currentPrice: currentPriceRef.current,
      regime,
      balance,
      currency,
      isLiveMode,
      botState,
      agents,
      aiPrediction,
      algorithmicDecision,
      openTrades,
      closedTrades,
      riskMetrics: coreRiskMetrics,
      googleAccessToken,
      workspaceUrls: {
        appUrl: typeof window !== 'undefined' ? window.location.origin : '',
        googleKeepUrl: 'https://keep.google.com/',
      },
    }));

    const unsub = autoSyncEngine.subscribe((st) => {
      setLastAutoSyncTime(st.lastSyncTime);
    });

    return () => unsub();
  }, [
    user,
    selectedSymbol,
    regime,
    balance,
    currency,
    isLiveMode,
    botState,
    agents,
    aiPrediction,
    algorithmicDecision,
    openTrades,
    closedTrades,
    coreRiskMetrics,
    googleAccessToken,
  ]);

  // Append log to bot stream
  const addLog = useCallback(
    (message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
      const time = new Date().toLocaleTimeString();
      setBotLogs((prev) => [{ time, message, type }, ...prev.slice(0, 99)]);
    },
    []
  );

  useEffect(() => {
    addLogRef.current = addLog;
  }, [addLog]);

  // Fallback speech dispatcher: uses Web TTS when enabled; falls back to native host speak if web voice is off/unavailable
  const speakWithHostFallback = useCallback((text: string, personaStyle: any = 'tactical') => {
    if (voice.getEnabled()) {
      voice.speak(text, personaStyle);
    } else {
      hostSpeak(text);
    }
  }, []);

  // Signal boot readiness to native Android host (dismisses native bootloader curtain once interactive)
  useEffect(() => {
    notifyHostReady();
  }, []);

  // Native Host Screen Wake Lock: Keep screen on in Android host while Autonomy or Bot is active
  useEffect(() => {
    const isAutonomyActive = autonomyMode === 'RUNNING' || botState.enabled || isAutonomousRunning;
    hostKeepScreenOn(isAutonomyActive);

    return () => {
      hostKeepScreenOn(false);
    };
  }, [autonomyMode, botState.enabled, isAutonomousRunning]);

  // Handle OAuth 2.0 PKCE ?code=...&state=... redirect directly to root URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) return;

    window.history.replaceState({}, document.title, window.location.pathname);

    (async () => {
      try {
        const savedAccountId = localStorage.getItem('deriv_active_loginid');
        const res = await fetch('/api/auth/deriv/exchange', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state, savedAccountId }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const appId = localStorage.getItem('deriv_app_id') || DEFAULT_DERIV_APP_ID;
          await derivWS.completeServerSession(data);
          await signInWithDerivOAuth(
            data.accounts || [],
            '',
            data.selectedAccountId || data.accounts?.[0]?.account || '',
            appId
          );
          addLog(`Connected via Deriv OAuth 2.0 PKCE: ${data.selectedAccountId || 'Deriv Account'}`, 'success');
        } else {
          addLog(`Deriv OAuth PKCE exchange failed: ${data.error || 'Unknown error'}`, 'error');
        }
      } catch (e: any) {
        addLog(`Deriv OAuth callback error: ${e?.message || 'Unknown error'}`, 'error');
      }
    })();
  }, [addLog, signInWithDerivOAuth]);

  // Deriv contract live settlement handler for proposal_open_contract / sell events
  const handleDerivContractSettled = useCallback((poc: any) => {
    const contractId = poc.contract_id;
    if (!contractId || settledContractIdsRef.current.has(contractId)) return;

    const trade =
      openTradesRef.current.find((t) => t.contract_id === contractId || t.id === String(contractId)) ||
      (openTradesRef.current.length === 1 && !openTradesRef.current[0].contract_id ? openTradesRef.current[0] : undefined);

    if (!trade) return;

    settledContractIdsRef.current.add(contractId);
    closingContractIdsRef.current.delete(contractId);
    tslSellRequestedRef.current.delete(contractId);

    openTradesRef.current = openTradesRef.current.filter(
      (t) => t.id !== trade.id && t.contract_id !== contractId && t.id !== String(contractId)
    );
    setOpenTrades((currOpen) =>
      currOpen.filter((t) => t.id !== trade.id && t.contract_id !== contractId && t.id !== String(contractId))
    );

    const timer = tradeTimeoutsRef.current.get(trade.id);
    if (timer) {
      clearTimeout(timer);
      tradeTimeoutsRef.current.delete(trade.id);
    }

    const profit =
      typeof poc.profit === 'number'
        ? Number(poc.profit.toFixed(2))
        : typeof poc.sell_price === 'number'
        ? Number((poc.sell_price - trade.amount).toFixed(2))
        : typeof poc.bid_price === 'number'
        ? Number((poc.bid_price - trade.amount).toFixed(2))
        : 0;
    const won = poc.status ? poc.status === 'won' || profit > 0 : profit > 0;
    const exitPrice =
      typeof poc.exit_tick === 'number'
        ? poc.exit_tick
        : typeof poc.exit_tick_value === 'number'
        ? poc.exit_tick_value
        : typeof poc.sell_spot === 'number'
        ? poc.sell_spot
        : poc.current_spot ?? currentPriceRef.current;

    // Authoritative balance reconciliation directly from Deriv settlement response
    if (typeof poc.balance_after === 'number') {
      const exactBal = Number(poc.balance_after.toFixed(2));
      setBalance(exactBal);
      const isVirt = Boolean(loginidRef.current?.startsWith('VRTC') || !isLiveModeRef.current);
      updateBalancesRef.current?.(isVirt ? exactBal : undefined, !isVirt ? exactBal : undefined);
    }

    if (derivWS.hasRealToken()) {
      derivWS.refreshBalance();
    }

    const settled: TradeRecord = {
      ...trade,
      contract_id: contractId,
      profit,
      profitPercentage:
        typeof poc.profit_percentage === 'number'
          ? Number(poc.profit_percentage.toFixed(1))
          : Number(((profit / Math.max(trade.amount, 0.01)) * 100).toFixed(1)),
      exitPrice,
      exitReason:
        poc.exit_reason ||
        (poc.status === 'sold' ? 'Sold at Deriv Market Bid' : won ? 'Deriv Expiry Win' : 'Deriv Expiry Loss'),
      result: won ? 'WIN' : 'LOSS',
      holdMs: Math.max(1000, Date.now() - new Date(trade.timestamp).getTime()),
      status: poc.status || (won ? 'won' : 'lost'),
      isDerivRealTime: true,
    };

    const currentUser = userRef.current;
    if (currentUser) {
      setDoc(doc(db, 'trades', trade.id), {
        ...settled,
        uid: currentUser.uid,
      }).catch((err) => console.warn('Firestore settle persist note:', err));
      void firebaseSyncManager
        .enqueueSync({
          uid: currentUser.uid,
          collectionName: 'tradingHistory',
          docId: settled.id,
          data: settled,
          updatedAt: Date.now(),
        })
        .catch(() => {});
    }

    // Attribute settled outcome to StrategyEvolutionManager & check degradation rollback
    const stratResult = strategyEvolutionManager.recordCompletedTrade(settled, Boolean(settled.isSniperTrade));
    if (stratResult.rollbackTriggered && stratResult.rollbackReason) {
      addLogRef.current?.(`⚠️ [STRATEGY ROLLBACK] ${stratResult.rollbackReason}`, 'warn');
      hostToast('Strategy auto-rolled back to stable parent');
    }

    // Persist verified trade outcome into Persistent MemoryManager
    const memRes = memoryManager.upsert({
      category: 'OPERATIONAL',
      trustSource: 'VERIFIED_FACT',
      key: `trade_${contractId}`,
      title: `${settled.symbol} ${settled.decision} ${settled.result}`,
      summary: `Contract #${contractId} settled ${settled.result} (${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}) under ${settled.strategyVersion || 'v4.1.0-baseline'}.`,
      symbol: settled.symbol,
      strategyVersion: settled.strategyVersion || strategyEvolutionManager.getActiveVersion().version,
      regime: settled.regime,
      relevanceScore: 90,
    });
    if (currentUser && memRes.stored) {
      void firebaseSyncManager
        .enqueueSync({
          uid: currentUser.uid,
          collectionName: 'agentMemory',
          docId: memRes.record.id,
          data: memRes.record,
          version: memRes.record.version,
          updatedAt: memRes.record.updatedAt,
          flushImmediately: false,
        })
        .catch(() => {});
    }

    setClosedTrades((currClosed) => [settled, ...currClosed.filter((t) => t.id !== trade.id)]);

    auditLogger.record({
      type: 'AUTONOMOUS_TRADE',
      symbol: trade.symbol,
      action: won ? 'DERIV_CONTRACT_WIN' : 'DERIV_CONTRACT_LOSS',
      reason: `Deriv contract #${contractId} settled (${trade.duration}${
        trade.durationUnit === 'ticks' ? 't' : trade.durationUnit === 'seconds' ? 's' : 'm'
      }) at ${exitPrice}`,
      pnlImpact: profit,
      metadata: {
        contractId,
        stake: trade.amount,
        exitPrice,
        mode: trade.mode,
      },
    });

    if (indicatorsRef.current?.pattern?.pattern) {
      recordPatternOutcome(indicatorsRef.current.pattern.pattern, won);
    }

    if (martingaleStateRef.current.enabled && typeof poc.balance_after === 'number') {
      const outcome = processMartingaleTradeOutcome(
        martingaleStateRef.current,
        won,
        trade.amount,
        profit,
        Number(poc.balance_after.toFixed(2))
      );
      setMartingaleState(outcome.nextState);
      martingaleStateRef.current = outcome.nextState;
      setStake(outcome.nextState.currentStake);
      addLogRef.current?.(outcome.actionMessage, won ? 'success' : 'warn');
      addLogRef.current?.(`🧠 ${outcome.tacticalDirective}`, 'info');
    }

    setAgents((prevAgents) =>
      prevAgents.map((ag) => {
        if (ag.name === trade.agent || trade.agent.includes(ag.displayName)) {
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

    setBotState((prev) => ({
      ...prev,
      dailyTradeCount: (prev.dailyTradeCount ?? 0) + 1,
      tradesToday: (prev.tradesToday ?? 0) + 1,
      dailyProfit: Number(((prev.dailyProfit ?? 0) + profit).toFixed(2)),
      currentDailyLoss: won
        ? Math.max(0, (prev.currentDailyLoss ?? 0) - profit)
        : (prev.currentDailyLoss ?? 0) + Math.abs(profit),
      consecutiveLosses: won ? 0 : prev.consecutiveLosses + 1,
    }));

    sound.play(won ? 'win' : 'loss');
    hostHaptic(won ? 'success' : 'error');
    addLogRef.current?.(
      `Deriv contract #${contractId} settled: ${
        won ? 'WIN (+$' + profit.toFixed(2) + ')' : 'LOSS (-$' + Math.abs(profit).toFixed(2) + ')'
      } (Exit: ${exitPrice})`,
      won ? 'success' : 'error'
    );
  }, []);

  // 1. Live Deriv Market Stream & Account Synchronization
  useEffect(() => {
    setTickBuffer([]);
    setCandles([]);
    setCurrentPrice(0);
    setPrevPrice(0);

    derivWS.connect();
    derivWS.fetchCandles(selectedSymbol, granularity, 120);
    derivWS.subscribeTicks(selectedSymbol);

    const unsubscribe = derivWS.subscribe((data: any) => {
      if (data.msg_type === 'tick' && data.tick) {
        const tick = data.tick;
        const tickSymbol = tick.symbol || data.echo_req?.ticks;
        if (tickSymbol && tickSymbol !== selectedSymbol) {
          return;
        }

        const rawQuote = tick.quote ?? tick.price;
        if (typeof rawQuote !== 'number' || isNaN(rawQuote)) return;
        const newQuote = Number(rawQuote.toFixed(decimals));

        setPrevPrice(currentPriceRef.current || newQuote);
        setCurrentPrice(newQuote);

        // Update live spot reference on open positions without overwriting Deriv POC P/L
        setOpenTrades((prev) => {
          if (prev.length === 0) return prev;
          let changed = false;
          const next = prev.map((t) => {
            if (!t.isDerivRealTime && t.currentSpot !== newQuote) {
              changed = true;
              return { ...t, currentSpot: newQuote };
            }
            return t;
          });
          return changed ? next : prev;
        });

        setTickBuffer((prev) => [
          ...prev.slice(-40),
          { epoch: tick.epoch || Math.floor(Date.now() / 1000), quote: newQuote, symbol: selectedSymbol },
        ]);

        const tickTime = Math.floor(tick.epoch || Date.now() / 1000);
        const candlePeriod = Math.floor(tickTime / granularity) * granularity;

        setCandles((prevCandles) => {
          if (prevCandles.length === 0) {
            return [
              {
                epoch: candlePeriod,
                open: newQuote,
                high: newQuote,
                low: newQuote,
                close: newQuote,
                volume: 1,
              },
            ];
          }

          const last = prevCandles[prevCandles.length - 1];
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
        const activeId = data.authorize.loginid || data.authorize.account_id || null;
        const hasRealTok = derivWS.hasRealToken() && Boolean(activeId);
        setIsAuthorized(hasRealTok);
        setLoginid(activeId);
        loginidRef.current = activeId;

        const isVirtual = Boolean(
          data.authorize.is_virtual || isDemoAccount({ account: activeId || '' })
        );
        setLocalLiveMode(!isVirtual);
        isLiveModeRef.current = !isVirtual;

        if (hasRealTok) {
          updateAccountModeRef.current?.(!isVirtual ? 'REAL' : 'DEMO');
        }
        if (typeof data.authorize.balance === 'number') {
          const liveBal = Number(data.authorize.balance);
          setBalance(liveBal);
          if (hasRealTok) {
            updateBalancesRef.current?.(isVirtual ? liveBal : undefined, !isVirtual ? liveBal : undefined);
          }
        }
        if (data.authorize.currency) {
          setCurrency(data.authorize.currency);
        }
      } else if (data.msg_type === 'connection_state') {
        if (data.state === 'ONLINE' && portfolioReconciler.hasPendingReconciliation()) {
          derivWS.requestReconciliationSnapshot().then(({ openContracts, settledTransactions, portfolioVerified, statementVerified }) => {
            const rec = portfolioReconciler.reconcile({
              openTrades: openTradesRef.current,
              broker: {
                openPortfolioContracts: openContracts,
                settledTransactions,
                portfolioChecked: portfolioVerified,
                statementChecked: statementVerified,
              },
            });
            openTradesRef.current = rec.updatedOpenTrades;
            setOpenTrades(rec.updatedOpenTrades);
            if (!rec.stillPendingReconciliation) {
              balanceManager.clearReconciliationPending();
              addLogRef.current?.('Portfolio & statement reconciliation complete against Deriv broker snapshot.', 'info');
            }
          }).catch(() => {});
        }
      } else if (data.msg_type === 'portfolio' && data.portfolio) {
        if (portfolioReconciler.hasPendingReconciliation() && Array.isArray(data.portfolio.contracts)) {
          const rec = portfolioReconciler.reconcile({
            openTrades: openTradesRef.current,
            broker: { openPortfolioContracts: data.portfolio.contracts },
          });
          openTradesRef.current = rec.updatedOpenTrades;
          setOpenTrades(rec.updatedOpenTrades);
          if (!rec.stillPendingReconciliation) {
            balanceManager.clearReconciliationPending();
          }
        }
      } else if (data.msg_type === 'balance' && data.balance) {
        const bal = data.balance;
        const activeLoginId = loginidRef.current;
        const incomingId = bal.loginid || bal.account_id || null;
        const isPrimaryMatch = !incomingId || !activeLoginId || incomingId === activeLoginId;

        if (isPrimaryMatch && typeof bal.balance === 'number') {
          const liveBal = Number(bal.balance);
          setBalance(liveBal);
          if (derivWS.hasRealToken()) {
            const targetLoginId = incomingId || activeLoginId;
            const isVirtualAcct = targetLoginId ? isDemoAccount({ account: targetLoginId }) : !isLiveModeRef.current;
            updateBalancesRef.current?.(isVirtualAcct ? liveBal : undefined, !isVirtualAcct ? liveBal : undefined);
          }
        }
        if (isPrimaryMatch && bal.currency) {
          setCurrency(bal.currency);
        }
        setIsRefreshingBalance(false);
      } else if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract) {
        const poc = data.proposal_open_contract;
        const contractId = poc.contract_id;

        if (contractId) {
          openTradesRef.current = openTradesRef.current.map((trade) => {
            const isMatch =
              trade.contract_id === contractId ||
              trade.id === String(contractId) ||
              (openTradesRef.current.length === 1 && !trade.contract_id);
            if (isMatch) {
              return {
                ...trade,
                contract_id: contractId,
                amount: typeof poc.buy_price === 'number' ? Number(poc.buy_price.toFixed(2)) : trade.amount,
                payout: typeof poc.payout === 'number' ? Number(poc.payout.toFixed(2)) : trade.payout,
                profit: typeof poc.profit === 'number' ? Number(poc.profit.toFixed(2)) : trade.profit,
                profitPercentage:
                  typeof poc.profit_percentage === 'number'
                    ? Number(poc.profit_percentage.toFixed(1))
                    : trade.profitPercentage,
                bidPrice: typeof poc.bid_price === 'number' ? poc.bid_price : trade.bidPrice,
                currentSpot: typeof poc.current_spot === 'number' ? poc.current_spot : trade.currentSpot,
                barrier: poc.barrier ?? trade.barrier,
                isDerivRealTime: true,
                isValidToSell:
                  poc.is_sold !== 1 && (poc.is_valid_to_sell === 1 || poc.is_valid_to_sell === true),
                status: poc.status,
                dateExpiry: poc.date_expiry,
                dateStart: poc.date_start,
              };
            }
            return trade;
          });
        }

        setOpenTrades((prev) => {
          let matched = false;
          const next = prev.map((trade) => {
            const isMatch =
              trade.contract_id === contractId ||
              trade.id === String(contractId) ||
              (prev.length === 1 && !trade.contract_id);
            if (isMatch) {
              matched = true;
              return {
                ...trade,
                contract_id: contractId,
                amount: typeof poc.buy_price === 'number' ? Number(poc.buy_price.toFixed(2)) : trade.amount,
                payout: typeof poc.payout === 'number' ? Number(poc.payout.toFixed(2)) : trade.payout,
                profit: typeof poc.profit === 'number' ? Number(poc.profit.toFixed(2)) : trade.profit,
                profitPercentage:
                  typeof poc.profit_percentage === 'number'
                    ? Number(poc.profit_percentage.toFixed(1))
                    : trade.profitPercentage,
                bidPrice: typeof poc.bid_price === 'number' ? poc.bid_price : trade.bidPrice,
                currentSpot: typeof poc.current_spot === 'number' ? poc.current_spot : trade.currentSpot,
                barrier: poc.barrier ?? trade.barrier,
                isDerivRealTime: true,
                isValidToSell:
                  poc.is_sold !== 1 && (poc.is_valid_to_sell === 1 || poc.is_valid_to_sell === true),
                status: poc.status,
                dateExpiry: poc.date_expiry,
                dateStart: poc.date_start,
              };
            }
            return trade;
          });
          return matched ? next : prev;
        });

        if (poc.is_sold === 1 || poc.status === 'won' || poc.status === 'lost' || poc.status === 'sold') {
          handleDerivContractSettled(poc);
        }
      } else if (data.msg_type === 'buy' && data.buy) {
        const buyData = data.buy;
        const contractId = buyData.contract_id;
        if (typeof buyData.balance_after === 'number') {
          const nextBal = Number(buyData.balance_after.toFixed(2));
          setBalance(nextBal);
          const isVirt = Boolean(loginidRef.current?.startsWith('VRTC') || !isLiveModeRef.current);
          updateBalancesRef.current?.(isVirt ? nextBal : undefined, !isVirt ? nextBal : undefined);
        }
        if (contractId) {
          const alreadyLinked = openTradesRef.current.some((t) => t.contract_id === contractId);
          if (!alreadyLinked) {
            let linkedRef = false;
            openTradesRef.current = openTradesRef.current.map((t) => {
              if (!linkedRef && !t.contract_id) {
                linkedRef = true;
                const pendingTimer = tradeTimeoutsRef.current.get(t.id);
                if (pendingTimer) {
                  clearTimeout(pendingTimer);
                  tradeTimeoutsRef.current.delete(t.id);
                }
                portfolioReconciler.markIntentConfirmed(t.id, contractId);
                return {
                  ...t,
                  contract_id: contractId,
                  amount: typeof buyData.buy_price === 'number' ? Number(buyData.buy_price.toFixed(2)) : t.amount,
                  payout: typeof buyData.payout === 'number' ? Number(buyData.payout.toFixed(2)) : t.payout,
                  isDerivRealTime: true,
                };
              }
              return t;
            });
            setOpenTrades((prev) => {
              if (prev.some((t) => t.contract_id === contractId)) return prev;
              let linked = false;
              return prev.map((t) => {
                if (!linked && !t.contract_id) {
                  linked = true;
                  return {
                    ...t,
                    contract_id: contractId,
                    amount: typeof buyData.buy_price === 'number' ? Number(buyData.buy_price.toFixed(2)) : t.amount,
                    payout: typeof buyData.payout === 'number' ? Number(buyData.payout.toFixed(2)) : t.payout,
                    isDerivRealTime: true,
                  };
                }
                return t;
              });
            });
            derivWS.subscribeProposalOpenContract(contractId);
            addLogRef.current?.(`Deriv contract #${contractId} confirmed. Streaming live real-time P/L.`, 'info');
          }
        }
        isExecutingRef.current = false;
        setIsExecuting(false);
      } else if (data.msg_type === 'sell' && data.sell) {
        const sellData = data.sell;
        const soldContractId = sellData.contract_id ?? data.echo_req?.sell;
        if (typeof sellData.balance_after === 'number') {
          const exactBal = Number(sellData.balance_after.toFixed(2));
          setBalance(exactBal);
          const isVirt = Boolean(loginidRef.current?.startsWith('VRTC') || !isLiveModeRef.current);
          updateBalancesRef.current?.(isVirt ? exactBal : undefined, !isVirt ? exactBal : undefined);
        }
        if (soldContractId && !settledContractIdsRef.current.has(soldContractId)) {
          const matchedTrade = openTradesRef.current.find(
            (t) => t.contract_id === soldContractId || t.id === String(soldContractId)
          );
          const realProfit =
            typeof sellData.sold_for === 'number' && matchedTrade
              ? Number((sellData.sold_for - matchedTrade.amount).toFixed(2))
              : undefined;
          handleDerivContractSettled({
            contract_id: soldContractId,
            profit: realProfit,
            sell_price: sellData.sold_for,
            balance_after: sellData.balance_after,
            status: 'sold',
            current_spot: currentPriceRef.current,
          });
        }
      } else if (data.error && (data.msg_type === 'sell' || data.echo_req?.sell)) {
        const sellContractId = data.echo_req?.sell;
        if (sellContractId) {
          closingContractIdsRef.current.delete(sellContractId);
          tslSellRequestedRef.current.delete(sellContractId);
        }
        sound.play('alert');
        addLogRef.current?.(
          `Deriv early resale notice for #${sellContractId || ''}: ${data.error.message || 'Resale not permitted at this time'}`,
          'warn'
        );
      } else if (data.error && (data.msg_type === 'buy' || data.echo_req?.buy)) {
        const failedPending = openTradesRef.current.find((t) => !t.contract_id);
        if (failedPending) {
          const timer = tradeTimeoutsRef.current.get(failedPending.id);
          if (timer) {
            clearTimeout(timer);
            tradeTimeoutsRef.current.delete(failedPending.id);
          }
          portfolioReconciler.markIntentFailed(failedPending.id);
          openTradesRef.current = openTradesRef.current.filter((t) => t.id !== failedPending.id);
          setOpenTrades((prev) => prev.filter((t) => t.id !== failedPending.id));
        }
        if (derivWS.hasRealToken()) {
          derivWS.refreshBalance();
        }
        isExecutingRef.current = false;
        setIsExecuting(false);
        sound.play('alert');
        addLogRef.current?.(`Deriv contract execution rejected: ${data.error.message || 'Unknown error'}`, 'error');
      } else if (data.msg_type === 'authorize_error' || data.msg_type === 'switch_account_error') {
        sound.play('alert');
        const errMsg = data.error?.message || 'Deriv authentication failed.';
        addLogRef.current?.(errMsg, 'error');
        hostToast(errMsg);
      } else if (data.msg_type === 'auth_required' || data.msg_type === 'deriv_logout') {
        settledContractIdsRef.current.clear();
        closingContractIdsRef.current.clear();
        tslSellRequestedRef.current.clear();
        setIsAuthorized(false);
        setLoginid(null);
        loginidRef.current = null;
        setBalance(0);
        setCurrency('USD');
        setLocalLiveMode(false);
        isLiveModeRef.current = false;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [selectedSymbol, granularity, decimals, handleDerivContractSettled]);

  // 2. Technical Indicators, Candlestick Pattern Recognition, & Multi-Agent Deliberation
  // Offloaded to dedicated Web Worker to maintain silky 60fps UI thread performance during high-frequency tick streams
  const {
    indicators: workerIndicators,
    decision: workerDecision,
    regime: workerRegime,
    workerStats,
  } = useIndicatorWorker({
    candles,
    tickBuffer,
    indicatorConfig: settings.indicators,
    agents,
    minConfidence: botState.minConfidence ?? 0.38,
    consecutiveLosses: botState.consecutiveLosses ?? 0,
    symbol: selectedSymbol,
  });

  useEffect(() => {
    if (workerIndicators) {
      setIndicators(workerIndicators);
    }
  }, [workerIndicators]);

  useEffect(() => {
    if (workerDecision) {
      setAlgorithmicDecision(workerDecision);
    }
  }, [workerDecision]);

  useEffect(() => {
    if (workerRegime) {
      setRegime(workerRegime);
    }
  }, [workerRegime]);

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

  // Unified Autonomy Handlers
  const handleConfigureAutonomy = useCallback(() => {
    sound.play('click');
    setIsAutonomyConfigOpen(true);
  }, []);

  const handleSaveAutonomyPreset = useCallback((updated: AutonomyPreset) => {
    setAutonomyPreset(updated);
    saveAutonomyPreset(updated);
    setAutonomyMode('ARMED');
    setSbagentAutonomyGrant(false);
    setLastAutonomyError(null);
    addLog(`⚙️ Autonomy bounds updated: Max stake $${updated.risk.maxStake.toFixed(2)}, Max Drawdown ${updated.risk.sessionDrawdownCap.toFixed(1)}%. State armed.`, 'info');
  }, [addLog]);

  const handleStopAutonomy = useCallback((reason = 'user') => {
    const stopRes = autonomyManager.stopAll(reason);
    intelligenceManager.invalidateCurrentPrediction(`stop:${reason}`);
    setIsAutonomousRunning(false);
    setBotState((b) => ({ ...b, enabled: false }));
    setSbagentAutonomyGrant(false);
    setAutonomyMode('OFF');
    setAppliedAutonomySettings(null);
    sound.play('click');
    hostHaptic('light');
    hostToast('Autonomy stopped');
    addLog(
      `⏹️ Autonomy stopped (${reason}). Severed all autonomous loops (${stopRes.abortedCount} pending AI cycle(s) aborted); open-contract monitoring preserved.`,
      'info'
    );
    speakWithHostFallback('Autonomy stopped.', 'tactical');
    memoryManager.upsert({
      category: 'SESSION',
      trustSource: 'USER_DECISION',
      key: 'last_global_stop',
      title: 'Global Autonomy Stopped',
      summary: `Operator/circuit-breaker halted autonomy (${reason}).`,
      symbol: selectedSymbol,
      strategyVersion: strategyEvolutionManager.getActiveVersion().version,
      relevanceScore: 85,
    });
    auditLogger.record({
      type: 'RISK_SHIELD',
      symbol: selectedSymbol,
      action: 'AUTONOMY_REVOKED',
      reason: `Autonomy revoked by ${reason}.`,
    });
  }, [selectedSymbol, addLog, speakWithHostFallback]);

  const handleRunAutonomously = useCallback(() => {
    setLastAutonomyError(null);

    // A) Prerequisites (hard gates — requires live Deriv WS + authorized account)
    const blockers = validateAutonomyPrerequisites({
      isDerivConnected: derivWS.isConnected(),
      isDerivAuthorized: isAuthorized && derivWS.hasRealToken(),
      symbol: selectedSymbol,
      balance,
      preset: autonomyPreset,
    });

    if (blockers.length > 0) {
      setLastAutonomyError(blockers);
      sound.play('alert');
      hostHaptic('error');
      hostToast('Autonomy prerequisites unmet');
      addLog(`❌ Autonomy prerequisites unmet: ${blockers.join(' | ')}`, 'error');
      return;
    }

    // B) Build live session context for SBAgent
    const openExposure = openTrades.reduce((sum, t) => sum + (t.amount || 0), 0);
    const sessionContext: AutonomySessionContext = {
      symbol: selectedSymbol,
      balance,
      accountMode: isLiveMode ? 'REAL' : 'DEMO',
      regime: regime.type || 'NEUTRAL',
      openExposure,
      risk: autonomyPreset.risk,
      allowedSymbols: autonomyPreset.allowedSymbols,
      strategyRef: strategyState.activeVersion || autonomyPreset.strategyProfile || 'sbagent.md-v4.1',
    };

    // C) GRANT unified autonomy through AutonomyManager before SBAgent self-configures
    const startResult = autonomyManager.start({
      permissions: {
        allowAutoBot: true,
        allowSubagent: true,
        allowAiTriggers: true,
        allowEarlySelling: true,
        allowSymbolRotation: botState.autonomousSymbolChange ?? true,
      },
      sbagentContext: sessionContext,
      reason: 'user_run_autonomously',
    });

    if (!startResult.ok) {
      setLastAutonomyError([startResult.reason]);
      sound.play('alert');
      hostHaptic('error');
      hostToast(startResult.reason);
      addLog(`🛑 Autonomy start blocked: ${startResult.reason}`, 'warn');
      return;
    }

    setSbagentAutonomyGrant(true);
    setAutonomyMode('RUNNING');

    // D) SBAgent intelligent self-configuration (before any order)
    const configResult = SBAgent.configureForAutonomy(sessionContext);

    if (!configResult.ok || !configResult.appliedSettings) {
      autonomyManager.pause('sbagent_config_failed');
      setSbagentAutonomyGrant(false);
      setAutonomyMode('ARMED');
      setBotState((b) => ({ ...b, enabled: false }));
      const blockErrors = configResult.blockers || ['SBAgent could not complete configuration.'];
      setLastAutonomyError(blockErrors);
      hostHaptic('error');
      hostToast('Autonomy configuration failed');
      auditLogger.record({
        type: 'RISK_SHIELD',
        symbol: selectedSymbol,
        action: 'AUTONOMY_CONFIG_FAILED',
        reason: blockErrors.join('; '),
      });
      addLog(`⚠️ SBAgent configuration blockers: ${blockErrors.join(', ')}`, 'warn');
      return;
    }

    const applied = configResult.appliedSettings;
    setAppliedAutonomySettings(applied);

    // Apply runtime settings
    setStake(applied.calibratedStake);
    setDuration(applied.calibratedDuration);
    setDurationUnit(applied.calibratedDurationUnit);
    setBotState((prev) => ({
      ...prev,
      enabled: true,
      stake: applied.calibratedStake,
      maxSessionDrawdownPercent: applied.sessionDrawdownCap,
      maxConsecutiveLosses: applied.holdRules.consecutiveLossLimit,
      allowedRotationSymbols: autonomyPreset.allowedSymbols,
    }));

    // E) Feedback + audit
    sound.play('trade');
    hostHaptic('success');
    hostToast('Autonomy active · SBAgent granted');
    addLog(`🚀 Autonomy granted (gen ${startResult.generation}) — SBAgent calibrated stake $${applied.calibratedStake.toFixed(2)}, ${applied.calibratedDuration}${applied.calibratedDurationUnit.charAt(0)}. Auto-trading active.`, 'success');
    speakWithHostFallback('Autonomy granted. SBAgent is configuring and starting trading.', 'tactical');
    memoryManager.upsert({
      category: 'SESSION',
      trustSource: 'USER_DECISION',
      key: 'last_autonomy_grant',
      title: `Autonomy Started (${selectedSymbol})`,
      summary: `Stake $${applied.calibratedStake.toFixed(2)}, Strategy ${strategyState.activeVersion}, Mode ${autonomySnapshot.executionMode}.`,
      symbol: selectedSymbol,
      strategyVersion: strategyState.activeVersion,
      relevanceScore: 80,
    });
    auditLogger.record({
      type: 'AUTONOMOUS_TRADE',
      symbol: sessionContext.symbol,
      action: 'AUTONOMY_GRANTED',
      reason: `SBAgent self-configured and granted execution for ${sessionContext.symbol}.`,
      metadata: {
        stake: applied.calibratedStake,
        duration: applied.calibratedDuration,
        regime: sessionContext.regime,
      },
    });
  }, [
    isAuthorized,
    selectedSymbol,
    balance,
    autonomyPreset,
    isLiveMode,
    regime.type,
    openTrades,
    botState.autonomousSymbolChange,
    strategyState.activeVersion,
    autonomySnapshot.executionMode,
    addLog,
    speakWithHostFallback,
  ]);

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
    if (
      !isSniperTriggerArmed ||
      !sniperSetup ||
      !sniperSetup.isPrimed ||
      sniperSetup.direction === 'NEUTRAL' ||
      isExecuting ||
      coreRiskMetrics.maxDrawdownPercent >= 5.0 ||
      sniperSetup.holdReason
    ) {
      return;
    }
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

  // 3. Gemini AI Scan (context-bound & cancellation-safe via IntelligenceManager)
  const triggerAIScan = useCallback(async () => {
    if (!indicators || isLoadingAI) return;
    const now = Date.now();
    if (now - lastAiScanTimeRef.current < 8000) return;
    lastAiScanTimeRef.current = now;

    const { context, abortController } = intelligenceManager.beginPredictionRequest({
      symbol: selectedSymbol,
      granularity,
      strategyVersion: strategyState.activeVersion,
      snapshotTimestamp: candles[candles.length - 1]?.epoch ? candles[candles.length - 1].epoch * 1000 : now,
    });

    setIsLoadingAI(true);
    try {
      const response = await fetch('/api/ai/predict', {
        method: 'POST',
        signal: abortController.signal,
        headers: { 'Content-Type': 'application/json', ...getAIRequestHeaders() },
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
          granularity,
          strategyVersion: strategyState.activeVersion,
          predictionContext: context,
          memorySummary: memoryManager.selectCompactContext({
            symbol: selectedSymbol,
            strategyVersion: strategyState.activeVersion,
            regime: regime.type,
            maxItems: 4,
          }),
        }),
      });

      const data = await response.json();
      if (data.success) {
        const accepted = intelligenceManager.completePrediction(context, data, {
          symbol: selectedSymbol,
          granularity,
          strategyVersion: strategyState.activeVersion,
          autonomyGeneration: autonomyManager.getGeneration(),
          configRevision: configurationManager.getRevision(),
        });
        if (accepted.accepted && accepted.prediction) {
          setAiPrediction(accepted.prediction);
        } else if (accepted.reason) {
          addLogRef.current?.(`Discarded stale AI prediction: ${accepted.reason}`, 'info');
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('AI Scan trigger note:', err);
      }
    } finally {
      autonomyManager.releaseAbortController('ai_predict');
      setIsLoadingAI(false);
    }
  }, [indicators, isLoadingAI, selectedSymbol, regime.type, granularity, strategyState.activeVersion, candles]);

  // Trigger AI Agent Evolution Cycle (Reinforcement Learning)
  const triggerAgentEvolution = useCallback(async () => {
    setIsEvolving(true);
    try {
      const res = await fetch('/api/ai/evolve-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAIRequestHeaders() },
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

  // 4. Unified Authoritative Execution Pipeline (Manual, Auto-Bot, Subagent, Copilot, or Sniper)
  const executeTrade = useCallback(
    async (
      tradeDirection: 'CALL' | 'PUT',
      tradeStake: number,
      tradeDuration: number,
      source: ExecutionSource = 'MANUAL',
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
      if (isExecuting || isExecutingRef.current) return;

      const entrySpot = currentPriceRef.current;
      if (!entrySpot || entrySpot <= 0) {
        hostHaptic('error');
        hostToast('Awaiting live market quote...');
        addLog('Execution blocked: Live Deriv market quote not yet received.', 'warn');
        return;
      }

      const validated = validateDerivDuration(selectedSymbol, tradeDuration, tradeDurationUnit);
      if (validated.isAdjusted) {
        addLog(`⏱️ Duration calibrated to legal Deriv bound: ${tradeDuration} → ${validated.exactLegalString}`, 'info');
      }

      isExecutingRef.current = true;
      setIsExecuting(true);
      hostHaptic('medium');

      try {
        const result = await executionController.executePurchase({
          source,
          symbol: selectedSymbol,
          contractType: tradeDirection,
          stake: tradeStake,
          duration: validated.duration,
          durationUnit: validated.unit,
          confidence: sniperData?.confluenceScore
            ? sniperData.confluenceScore / 100
            : algorithmicDecision?.confidence || 0.62,
          agent: sniperData?.isSniperTrade
            ? 'Sniper Confluence Pro'
            : source === 'SUBAGENT_MD'
            ? 'sbagent (sbagent.md)'
            : algorithmicDecision?.agent || 'Consensus',
          regime: regime.type,
          isSniperTrade: sniperData?.isSniperTrade,
          confluenceScore: sniperData?.confluenceScore,
          trailingStopEnabled: Boolean(trailingStopOptions?.enabled),
          strategyVersion: strategyState.activeVersion,
          autonomyGeneration: source === 'MANUAL' ? undefined : autonomyManager.getGeneration(),
          predictionContext: aiPrediction?.context,
        });

        if (user?.uid) {
          void firebaseSyncManager
            .enqueueSync({
              uid: user.uid,
              collectionName: 'executionEvents',
              docId: `exec_${result.timestamp}`,
              data: {
                source,
                symbol: selectedSymbol,
                status: result.status,
                reason: result.reason,
                contractId: result.contractId,
                proposalId: result.proposalId,
                amount: result.buyPrice ?? tradeStake,
                strategyVersion: strategyState.activeVersion,
              },
              updatedAt: result.timestamp,
              flushImmediately: false,
            })
            .catch(() => {});
        }

        if (!result.executed || !result.tradeRecord) {
          hostHaptic('error');
          const primaryBlocker = result.blockers[0] || result.reason || 'Trade execution blocked.';
          hostToast(primaryBlocker);
          addLog(`🛑 [${result.status}] ${primaryBlocker}`, 'warn');
          sound.play('alert');
          if (!derivWS.hasRealToken() || derivWS.isTokenExpired()) {
            setIsTokenModalOpen(true);
          }
          if (result.reconciliationPending) {
            balanceManager.markReconciliationPending();
          }
          return;
        }

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

        const enrichedTrade: TradeRecord = {
          ...result.tradeRecord,
          entryPrice: result.tradeRecord.entryPrice || entrySpot,
          ...tslProps,
        };

        if (!openTradesRef.current.some((t) => t.contract_id === enrichedTrade.contract_id || t.id === enrichedTrade.id)) {
          openTradesRef.current = [enrichedTrade, ...openTradesRef.current];
          setOpenTrades((prev) =>
            prev.some((t) => t.contract_id === enrichedTrade.contract_id || t.id === enrichedTrade.id)
              ? prev
              : [enrichedTrade, ...prev]
          );
        }

        const unitSuffix = validated.unit === 'ticks' ? 't' : validated.unit === 'seconds' ? 's' : 'm';
        const sniperTag = sniperData?.isSniperTrade ? ` [SNIPER ${sniperData.confluenceScore}%]` : '';
        const tslTag = trailingStopOptions?.enabled && tslProps.currentTrailingStopPrice
          ? ` [TSL Stop: ${tslProps.currentTrailingStopPrice.toFixed(decimals)}]`
          : '';

        addLog(
          `[${source}${sniperTag}${tslTag}] Purchased ${isLiveMode ? 'REAL' : 'DEMO'} Deriv ${
            tradeDirection === 'CALL' ? 'RISE' : 'FALL'
          } contract #${enrichedTrade.contract_id} on ${selectedSymbol} via proposal ${enrichedTrade.proposalId} ($${enrichedTrade.amount.toFixed(2)}, ${validated.duration}${unitSuffix})`,
          'success'
        );
      } finally {
        isExecutingRef.current = false;
        setIsExecuting(false);
      }
    },
    [
      isExecuting,
      isLiveMode,
      selectedSymbol,
      algorithmicDecision,
      regime.type,
      strategyState.activeVersion,
      aiPrediction?.context,
      user?.uid,
      candles,
      indicators,
      decimals,
      addLog,
    ]
  );

  // 5. Autonomous Subagent (sbagent.md) Execution Loop (bound to AutonomyManager generation & AbortController)
  const runSubAgentStep = useCallback(async () => {
    if (!indicators || openTrades.length > 0) return;
    if (autonomyManager.getLifecycle() !== 'ACTIVE' || !autonomyManager.getSnapshot().permissions.allowSubagent) {
      return;
    }

    const { controller, generation } = autonomyManager.registerAbortController('subagent_step');
    try {
      const scriptRes = await fetch('/api/subagent/script', { signal: controller.signal });
      const scriptData = await scriptRes.json();
      if (!scriptData.success || !autonomyManager.isGenerationCurrent(generation)) return;

      const evalRes = await fetch('/api/subagent/execute-step', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...getAIRequestHeaders() },
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
      if (!autonomyManager.isGenerationCurrent(generation) || autonomyManager.getLifecycle() !== 'ACTIVE') {
        return;
      }

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
            const isDifferentSeries = nextSym.startsWith('1HZ') !== selectedSymbol.startsWith('1HZ');
            const estCorrelation = isDifferentSeries ? 0.32 : 0.68;
            addLog(
              `🔄 [Correlation-Aware Rotation] Switched from ${selectedSymbol} to ${nextSym} (Est. Correlation: ${estCorrelation.toFixed(2)} • ${
                isDifferentSeries ? 'Optimal Low-Correlation Hedge' : 'Intra-Regime Flow'
              }): ${evalData.symbol_rotation_reason || 'Volatility optimization'}`,
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
            voice.speak(`SBAgent rotated market to ${nextSym} prioritizing low correlation`, 'analytical');
            return;
          }
        }

        if (evalData.action === 'BUY' || evalData.action === 'SELL') {
          const consensus = algorithmicDecision?.consensus;
          if (consensus && !consensus.hasConsensus) {
            addLog(`🛡️ [CONSENSUS GATE] Subagent auto-fire blocked: ${consensus.rationale}`, 'warn');
            return;
          }

          const dir = evalData.action === 'BUY' ? 'CALL' : 'PUT';
          const dur = evalData.suggested_duration_mins || 15;
          addLog(`🤖 Subagent (sbagent.md) triggered: ${dir} (${evalData.rule_matched})`, 'success');
          void executeTrade(dir, stake, dur, 'SUBAGENT_MD');
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('Subagent execution step notice:', err);
      }
    } finally {
      autonomyManager.releaseAbortController('subagent_step');
    }
  }, [
    indicators,
    openTrades.length,
    selectedSymbol,
    regime,
    stake,
    granularity,
    algorithmicDecision?.consensus,
    botState.allowedRotationSymbols,
    botState.autonomousSymbolChange,
    botState.rotationCooldownSeconds,
    botState.lastSymbolRotationTime,
    addLog,
    executeTrade,
  ]);

  // Autonomous Subagent Timer (strictly obeys AutonomyManager ACTIVE lifecycle)
  useEffect(() => {
    if (!isAutonomousRunning || autonomySnapshot.lifecycle !== 'ACTIVE' || openTrades.length > 0) return;
    const interval = setInterval(() => {
      if (autonomyManager.getLifecycle() !== 'ACTIVE') return;
      const now = Date.now();
      if (now - lastSubagentRunTimeRef.current > 15000) {
        lastSubagentRunTimeRef.current = now;
        void runSubAgentStep();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [isAutonomousRunning, autonomySnapshot.lifecycle, openTrades.length, runSubAgentStep]);

  // 6. Automated Bot Deliberation Loop
  useEffect(() => {
    if (!botState.enabled || !algorithmicDecision || openTrades.length > 0) return;

    const now = Date.now();
    if (now - lastBotTradeTimeRef.current < 8000) return;

    // Hard Session Drawdown Circuit Breaker Enforcement (sbagent.md Section 2 & 4)
    const ddCap = appliedAutonomySettings?.sessionDrawdownCap || botState.maxSessionDrawdownPercent || 5.0;
    if (coreRiskMetrics.maxDrawdownPercent >= ddCap) {
      addLog(
        `🛑 [CIRCUIT BREAKER] ${ddCap.toFixed(1)}% Session Drawdown limit reached (${coreRiskMetrics.maxDrawdownPercent.toFixed(1)}%). Halting autonomy.`,
        'error'
      );
      handleStopAutonomy('circuit_breaker');
      return;
    }

    const currentLoss = botState.currentDailyLoss ?? 0;
    if (currentLoss >= botState.maxDailyLoss) {
      addLog(`Daily loss limit reached ($${currentLoss.toFixed(2)} / $${botState.maxDailyLoss}). Pausing bot.`, 'warn');
      handleStopAutonomy('daily_loss_limit');
      return;
    }

    const maxLossLimit = appliedAutonomySettings?.holdRules.consecutiveLossLimit || botState.maxConsecutiveLosses;
    if (botState.consecutiveLosses >= maxLossLimit) {
      addLog(`Consecutive loss limit reached (${botState.consecutiveLosses}/${maxLossLimit}). Pausing autonomy for cooldown.`, 'warn');
      handleStopAutonomy('consecutive_loss_limit');
      return;
    }

    // Evaluate SBAgent Intelligent Autonomy Gate if granted
    if (sbagentAutonomyGrant && autonomyMode === 'RUNNING') {
      const currentOpenExp = openTrades.reduce((sum, t) => sum + (t.amount || 0), 0);
      const snap = {
        symbol: selectedSymbol,
        currentPrice,
        candles,
        indicators,
        regime: regime.type,
        consecutiveLosses: botState.consecutiveLosses,
        openExposure: currentOpenExp,
        balance,
        consensusScore: algorithmicDecision?.consensus?.weightedAgreement ?? algorithmicDecision?.consensus?.agreementRatio ?? algorithmicDecision?.confidence ?? 0.65,
        consensusDirection: (algorithmicDecision?.consensus?.consensusDirection ?? (algorithmicDecision?.action?.includes('BUY') ? 'BUY' : algorithmicDecision?.action?.includes('SELL') ? 'SELL' : 'NEUTRAL')) as any,
        algorithmicConfidence: algorithmicDecision?.confidence ?? 0.65,
      };

      const autonomyDecision = SBAgent.decide(snap);
      if (autonomyDecision.action === 'HOLD') {
        auditLogger.record({
          type: 'HOLD_DECISION',
          symbol: selectedSymbol,
          action: 'HOLD',
          reason: autonomyDecision.reason,
        });
        addLog(`🛡️ [SBAGENT HOLD] ${autonomyDecision.reason}`, 'info');
        return;
      }
    }

    const { action, confidence, consensus } = algorithmicDecision;
    const minConf = botState.minConfidence ?? 0.38;

    // Check for high-confluence sniper opportunity as an autonomous trigger
    const hasSniperTrigger = sniperSetup?.isPrimed && sniperSetup.score >= 70 && sniperSetup.direction !== 'NEUTRAL';
    const hasAlgorithmicSignal = (action === 'BUY' || action === 'STRONG BUY' || action === 'SELL' || action === 'STRONG SELL') && confidence >= minConf;

    if (!hasAlgorithmicSignal && !hasSniperTrigger) {
      return;
    }

    // 1. Real Agent Consensus Gate: Require >= 3/4 BUY/SELL agreement OR weighted >= 0.62 (sbagent.md)
    if (consensus && !consensus.hasConsensus) {
      addLog(`🛡️ [CONSENSUS GATE] Auto-fire blocked: ${consensus.rationale}`, 'warn');
      return;
    }

    // 2. Wire HOLD Rules from sbagent.md: BB width < threshold, MTF conflict, consecutive losses
    if (action === 'HOLD') {
      return;
    }

    if (hasSniperTrigger && sniperSetup?.holdReason) {
      addLog(`🛡️ [HOLD RULE] Sniper auto-fire withheld: ${sniperSetup.holdReason}`, 'warn');
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
    const effectiveStake = appliedAutonomySettings?.calibratedStake
      ?? (martingaleState.enabled ? martingaleState.currentStake : (botState.stake || stake || 1.0));
    const effectiveDuration = appliedAutonomySettings?.calibratedDuration
      ?? (aiPrediction?.suggested_duration || algorithmicDecision.duration || 15);
    const effectiveDurationUnit = appliedAutonomySettings?.calibratedDurationUnit || 'minutes';

    auditLogger.record({
      type: 'AUTONOMOUS_TRADE',
      symbol: selectedSymbol,
      action: tradeDir,
      reason: `Autonomous trade executed: ${tradeDir} (Confidence: ${Math.round(confidence * 100)}%, Stake: $${effectiveStake.toFixed(2)})`,
      metadata: {
        stake: effectiveStake,
        duration: effectiveDuration,
        confidence,
        regime: regime.type,
      },
    });
    
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
      addLog(`Auto-Bot signal triggered: ${tradeDir} (Confidence: ${Math.round(confidence * 100)}%, Stake $${effectiveStake.toFixed(2)})`, 'info');
      executeTrade(tradeDir, effectiveStake, effectiveDuration, 'AUTO_BOT', effectiveDurationUnit, undefined, trailingStopConfig);
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

  // Early close position handler — dispatches through ExecutionController with duplicate lock & broker check
  const handleEarlyExit = useCallback(async (tradeId: string) => {
    const trade = openTradesRef.current.find((t) => t.id === tradeId);
    if (!trade) return;

    if (!trade.contract_id) {
      addLog(`Contract ${tradeId} is awaiting Deriv contract_id confirmation before resale.`, 'warn');
      return;
    }

    if (executionController.isSellPending(trade.contract_id)) {
      return;
    }

    const res = await executionController.executeSell({
      source: 'MANUAL',
      trade,
      minPrice: 0,
      reason: 'Manual operator early exit requested.',
    });

    if (res.sold) {
      addLog(`Deriv contract #${trade.contract_id} market resale executed (sold for $${res.soldFor?.toFixed(2)}).`, 'info');
    } else {
      sound.play('alert');
      addLog(`Early resale notice for #${trade.contract_id}: ${res.reason}`, 'warn');
    }
  }, [addLog]);

  // 4b. Intelligent Early-Selling & Trailing Stop-Loss Monitoring Loop (always active for open contracts even after Stop)
  useEffect(() => {
    if (openTrades.length === 0) return;

    const earlyPolicy = settings.earlyExit ?? DEFAULT_EARLY_EXIT_POLICY;
    const sellTriggers: {
      trade: TradeRecord;
      reason: string;
      policyTriggered: string | null;
    }[] = [];

    setOpenTrades((prevOpen) => {
      let stateChanged = false;
      const updatedList = prevOpen.map((trade) => {
        const evalOut = earlySellingEngine.evaluateContract({
          trade,
          policy: earlyPolicy,
          currentSpot: currentPrice > 0 ? currentPrice : trade.currentSpot,
          candles,
          indicators,
          aiPrediction,
          decimals,
        });

        if (evalOut.evaluation.shouldSellNow && earlyPolicy.autoExecute) {
          sellTriggers.push({
            trade: evalOut.updatedTrade,
            reason: evalOut.evaluation.reason,
            policyTriggered: evalOut.evaluation.policyTriggered,
          });
        }

        const t = evalOut.updatedTrade;
        if (
          t.currentTrailingStopPrice !== trade.currentTrailingStopPrice ||
          t.highestFavorablePrice !== trade.highestFavorablePrice ||
          t.lowestFavorablePrice !== trade.lowestFavorablePrice ||
          t.lockedInProfit !== trade.lockedInProfit ||
          t.peakProfit !== trade.peakProfit ||
          t.profitLockTriggered !== trade.profitLockTriggered ||
          t.earlyExitDecision !== trade.earlyExitDecision ||
          t.earlyExitReason !== trade.earlyExitReason
        ) {
          stateChanged = true;
          return t;
        }
        return trade;
      });

      return stateChanged ? updatedList : prevOpen;
    });

    if (sellTriggers.length > 0) {
      sellTriggers.forEach(({ trade, reason, policyTriggered }) => {
        if (!trade.contract_id || tslSellRequestedRef.current.has(trade.contract_id) || executionController.isSellPending(trade.contract_id)) {
          return;
        }
        if (!trade.isValidToSell) return;

        tslSellRequestedRef.current.add(trade.contract_id);
        void executionController
          .executeSell({
            source: 'EARLY_SELLING',
            trade,
            minPrice: 0,
            reason,
            policyTriggered,
          })
          .then((res) => {
            if (res.sold) {
              addLog(
                `🛡️ [EARLY SELLING • ${policyTriggered || 'POLICY'}] ${reason} — sold #${trade.contract_id} for $${res.soldFor?.toFixed(2)}.`,
                'info'
              );
            } else {
              tslSellRequestedRef.current.delete(trade.contract_id!);
              addLog(`Early-selling skipped/rejected on #${trade.contract_id}: ${res.reason}`, 'warn');
            }
          });
      });
    }
  }, [currentPrice, decimals, openTrades, settings.earlyExit, candles, indicators, aiPrediction, addLog]);

  // Balance Refresh Callback
  const handleRefreshBalance = useCallback(() => {
    setIsRefreshingBalance(true);
    derivWS.refreshBalance();
    sound.play('click');
    setTimeout(() => {
      setIsRefreshingBalance(false);
    }, 1000);
  }, []);

  // Switch strictly between linked Deriv Demo and Real accounts (token-free OTP / volatile switch)
  const handleToggleLiveMode = useCallback(
    async (targetReal: boolean) => {
      const linked = derivWS.getLinkedAccounts();
      const matchingAccount = linked.find(
        (acc) => isDemoAccount(acc) === !targetReal
      );

      if (matchingAccount) {
        addLog(
          `Switching Deriv account to ${matchingAccount.account} (${targetReal ? 'REAL' : 'DEMO'})...`,
          'info'
        );
        sound.play('toggle');
        const res = await derivWS.switchAccount(matchingAccount);
        if (!res.ok && res.error) {
          addLog(`Account switch failed: ${res.error}`, 'error');
          hostToast(res.error);
        }
        return;
      }

      const modeLabel = targetReal ? 'REAL' : 'DEMO (VRTC)';
      addLog(
        `No linked ${modeLabel} Deriv account found. Authorize via Deriv OAuth PKCE or paste a PAT for ${modeLabel}.`,
        'warn'
      );
      hostToast(`Connect a Deriv ${modeLabel} account to switch`);
      sound.play('alert');
      setIsTokenModalOpen(true);
    },
    [addLog]
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

  const exportTradingJournalCSV = useCallback(() => {
    if (closedTrades.length === 0) {
      addLog('No closed trades in journal to export.', 'info');
      return false;
    }
    const headers = ['ID', 'Timestamp', 'Symbol', 'Type', 'Stake', 'Profit', 'Result', 'Agent', 'Regime'];
    const rows = closedTrades.map((t) => [
      t.id,
      t.timestamp,
      t.symbol,
      t.decision,
      t.amount,
      t.profit,
      t.result,
      t.agent,
      t.regime,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `trade_journal_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog('📁 Exported trade journal history to CSV', 'success');
    return true;
  }, [closedTrades, addLog]);

  // Register unified AIActionRegistry runtime handlers across Chat, BottomSheet, Fullscreen, Gemini & SBAgent
  useEffect(() => {
    aiActionRegistry.registerHandlers({
      rotate_symbol: (args) => {
        const nextSym = String(args.symbol || '').trim();
        if (!nextSym) {
          return { status: 'REJECTED', action: 'rotate_symbol', message: 'Target symbol missing.', timestamp: Date.now() };
        }
        setSelectedSymbol(nextSym);
        derivWS.fetchCandles(nextSym, granularity, 120);
        derivWS.subscribeTicks(nextSym);
        addLog(`🔄 [AI ACTION] Rotated market symbol to ${nextSym}.`, 'info');
        return { status: 'SUCCESS', action: 'rotate_symbol', message: `Switched market to ${nextSym}.`, data: { symbol: nextSym }, timestamp: Date.now() };
      },
      change_timeframe: (args) => {
        const nextGran = Number(args.granularity || args.seconds || 60);
        if (!Number.isFinite(nextGran) || nextGran < 60) {
          return { status: 'REJECTED', action: 'change_timeframe', message: 'Invalid timeframe granularity.', timestamp: Date.now() };
        }
        setGranularity(nextGran);
        derivWS.fetchCandles(selectedSymbol, nextGran, 120);
        return { status: 'SUCCESS', action: 'change_timeframe', message: `Changed timeframe to ${nextGran}s.`, data: { granularity: nextGran }, timestamp: Date.now() };
      },
      adjust_stake_mode: (args) => {
        const nextStake = Number(args.stake);
        if (Number.isFinite(nextStake) && nextStake >= 0.35) {
          setStake(Number(nextStake.toFixed(2)));
        }
        if (args.mode && ['FIXED', 'EQUITY_PERCENT', 'KELLY_HALF', 'KELLY_QUARTER'].includes(String(args.mode))) {
          setSizingMode(String(args.mode) as PositionSizingMode);
        }
        return {
          status: 'SUCCESS',
          action: 'adjust_stake_mode',
          message: `Updated stake to $${Number.isFinite(nextStake) ? nextStake.toFixed(2) : stake.toFixed(2)}.`,
          timestamp: Date.now(),
        };
      },
      adjust_strategy: (args) => {
        const minConf = typeof args.minConfidence === 'number' ? args.minConfidence : undefined;
        if (minConf !== undefined) {
          setBotState((prev) => ({ ...prev, minConfidence: Math.max(0.35, Math.min(0.9, minConf)) }));
        }
        return {
          status: 'SUCCESS',
          action: 'adjust_strategy',
          message: `Strategy parameters calibrated (${strategyState.activeVersion}).`,
          timestamp: Date.now(),
        };
      },
      tighten_stop: (args) => {
        const dist = Number(args.distanceValue || 1.2);
        const nextTsl: TrailingStopConfig = {
          ...trailingStopConfig,
          enabled: true,
          distanceValue: Math.max(0.2, dist),
        };
        setTrailingStopConfig(nextTsl);
        updateTrailingStop(nextTsl);
        addLog(`🛡️ [AI ACTION] Tightened Trailing Stop distance to ${nextTsl.distanceValue}.`, 'info');
        return { status: 'SUCCESS', action: 'tighten_stop', message: `Trailing stop tightened to ${nextTsl.distanceValue}.`, timestamp: Date.now() };
      },
      request_market_analysis: async () => {
        await triggerAIScan();
        return { status: 'SUCCESS', action: 'request_market_analysis', message: `Triggered fresh Gemini analysis on ${selectedSymbol}.`, timestamp: Date.now() };
      },
      inspect_open_contracts: () => {
        return {
          status: 'SUCCESS',
          action: 'inspect_open_contracts',
          message: `${openTradesRef.current.length} open contract(s) tracked (${currency} ${balance.toFixed(2)}).`,
          data: openTradesRef.current.map((t) => ({
            id: t.contract_id ?? t.id,
            symbol: t.symbol,
            profit: t.profit,
            earlyExitDecision: t.earlyExitDecision,
            isValidToSell: t.isValidToSell,
          })),
          timestamp: Date.now(),
        };
      },
      request_early_selling_evaluation: () => {
        const evals = openTradesRef.current.map((trade) =>
          earlySellingEngine.evaluateContract({
            trade,
            policy: settings.earlyExit ?? DEFAULT_EARLY_EXIT_POLICY,
            currentSpot: currentPriceRef.current,
            candles,
            indicators,
            aiPrediction,
            decimals,
          }).evaluation
        );
        return {
          status: 'SUCCESS',
          action: 'request_early_selling_evaluation',
          message: `Evaluated ${evals.length} open contract(s) against early-selling rules.`,
          data: evals,
          timestamp: Date.now(),
        };
      },
      export_trading_journal: () => {
        const exported = exportTradingJournalCSV();
        return {
          status: exported ? 'SUCCESS' : 'REJECTED',
          action: 'export_trading_journal',
          message: exported ? 'Trading journal exported to CSV.' : 'No closed trades available to export.',
          timestamp: Date.now(),
        };
      },
      propose_strategy_updates: (args) => {
        const proposal: StrategyMutationProposal = {
          id: `PROP-${Date.now()}`,
          ruleCategory: String(args.ruleCategory || args.category || 'Entry & Risk'),
          proposedRule: String(args.proposedRule || args.rule || 'Tighten confidence & profit lock thresholds.'),
          rationale: String(args.rationale || 'AI Copilot empirical strategy optimization proposal.'),
          expectedEdge: String(args.expectedEdge || '+4% Profit Factor stability'),
          riskMitigation: String(args.riskMitigation || 'Preserves 5% session drawdown ceiling & Half-Kelly cap'),
          timestamp: Date.now(),
        };
        setActiveStrategyProposal(proposal);
        setIsStrategyEvolutionOpen(true);
        return {
          status: 'SUCCESS',
          action: 'propose_strategy_updates',
          message: 'Opened Strategy Evolution review modal with proposed mutation.',
          data: proposal,
          timestamp: Date.now(),
        };
      },
      request_manual_trade_confirmation: (args) => {
        const dir = String(args.direction || 'CALL').toUpperCase() === 'PUT' ? 'PUT' : 'CALL';
        setDirection(dir);
        hostToast(`Confirm ${dir} $${stake.toFixed(2)} on ${selectedSymbol}`);
        return {
          status: 'REQUIRES_CONFIRMATION',
          action: 'request_manual_trade_confirmation',
          message: `Prepared ${dir} order ($${stake.toFixed(2)} on ${selectedSymbol}); explicit operator confirmation required.`,
          timestamp: Date.now(),
        };
      },
      execute_authorized_trade: async (args, meta) => {
        const dir = String(args.direction || direction).toUpperCase() === 'PUT' ? 'PUT' : 'CALL';
        const tradeStakeVal = Number(args.stake || stake);
        const execSource: ExecutionSource = meta.source === 'SUBAGENT_MD' ? 'SUBAGENT_MD' : meta.source === 'GEMINI_AI' ? 'GEMINI_AI' : 'COPILOT';

        if (autonomyManager.getExecutionMode() === 'MANUAL_ONLY') {
          return {
            status: 'REQUIRES_CONFIRMATION',
            action: 'execute_authorized_trade',
            message: 'Execution mode is MANUAL_ONLY. Confirm trade manually in the terminal execution deck.',
            timestamp: Date.now(),
          };
        }

        const authRes = autonomyManager.authorizeExecution({ source: execSource, operation: 'PURCHASE' });
        if (!authRes.authorized) {
          return {
            status: 'UNAUTHORIZED',
            action: 'execute_authorized_trade',
            message: authRes.reason || 'Autonomous AI trade execution requires active Autonomy Mode.',
            timestamp: Date.now(),
          };
        }

        await executeTrade(dir, tradeStakeVal, duration, execSource, durationUnit, undefined, trailingStopConfig);
        return {
          status: 'SUCCESS',
          action: 'execute_authorized_trade',
          message: `Authorized ${dir} execution submitted via ExecutionController (${execSource}).`,
          timestamp: Date.now(),
        };
      },
    });
  }, [
    selectedSymbol,
    granularity,
    stake,
    duration,
    durationUnit,
    direction,
    balance,
    currency,
    strategyState.activeVersion,
    trailingStopConfig,
    settings.earlyExit,
    candles,
    indicators,
    aiPrediction,
    decimals,
    triggerAIScan,
    updateTrailingStop,
    exportTradingJournalCSV,
    executeTrade,
    addLog,
  ]);

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
          if (!botState.enabled) {
            handleRunAutonomously();
          } else {
            handleStopAutonomy('navbar');
          }
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
        onOpenQuickSettings={() => setIsQuickSettingsOpen(true)}
        onTriggerAutoSync={() => autoSyncEngine.triggerSync()}
        onOpenSettings={() => {
          setSettingsCategory('overview');
          setIsSettingsDrawerOpen(true);
        }}
        onOpenTheme={() => {
          setSettingsCategory('theme');
          setIsSettingsDrawerOpen(true);
        }}
        onOpenFullscreenWorkspace={() => setIsFullscreenWorkspaceOpen(true)}
        onOpenTourModal={() => setIsTourOpen(true)}
        onOpenAuditLogModal={() => setIsAuditLogOpen(true)}
      />

      {/* Main Body Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 lg:p-6 pb-36 sm:pb-32 lg:pb-8 flex flex-col gap-3.5 sm:gap-5">
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
          isAuthorized={isAuthorized}
          onToggleLiveMode={handleToggleLiveMode}
          balance={balance}
          currency={currency}
          loginid={loginid}
          onRefreshBalance={handleRefreshBalance}
          isRefreshingBalance={isRefreshingBalance}
          onOpenTokenModal={() => setIsTokenModalOpen(true)}
          latencyMs={derivWS.getLastLatency()}
          connectionState={balanceSnapshot.connection_state}
          balanceFreshness={balanceSnapshot.freshness}
          authMethod={derivWS.getAuthMethod()}
        />

        {/* Startup Session Recovery Banner (non-intrusive; never auto-starts autonomous trading) */}
        {sessionRecoveryPlan.hasRecoverableSession && !recoveryBannerDismissed && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-900/95 border border-cyan-500/35 rounded-xl text-xs font-mono">
            <div className="flex items-center gap-2 text-cyan-200">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>{sessionRecoveryPlan.summary}</span>
            </div>
            <div className="flex items-center gap-2">
              {sessionRecoveryPlan.requiresExplicitAutonomyResume && autonomySnapshot.lifecycle === 'OFF' && (
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryBannerDismissed(true);
                    handleRunAutonomously();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold hover:bg-emerald-500/30 transition-all"
                >
                  Resume Autonomy
                </button>
              )}
              <button
                type="button"
                onClick={() => setRecoveryBannerDismissed(true)}
                className="text-slate-400 hover:text-white p-1"
                title="Dismiss recovery notice"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* View 1: Main Trading Terminal (Persistently mounted to prevent chart canvas remount flash) */}
        <div className={`flex flex-col gap-4 ${activeTab === 'terminal' ? 'block tab-crossfade-enter' : 'hidden'}`}>
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
              <span className="text-slate-600 hidden sm:inline">•</span>
              <span className="text-slate-300 flex items-center gap-1.5" title="Web Worker background computation latency">
                <span className={`w-1.5 h-1.5 rounded-full ${workerStats.isWorkerActive ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className="text-slate-400">Worker:</span>
                <span className="text-emerald-400 font-bold">{workerStats.calculationTimeMs.toFixed(1)}ms</span>
              </span>
            </div>

          </div>

          <TerminalView
            candles={candles}
            currentPrice={currentPrice}
            indicators={indicators}
            granularity={granularity}
            onGranularityChange={(g) => setGranularity(g)}
            onRefreshChart={() => {
              derivWS.fetchCandles(selectedSymbol, granularity, 120);
              triggerAIScan();
            }}
            symbol={selectedSymbol}
            decimals={decimals}
            currency={currency}
            isLiveMode={isLiveMode}
            aiPrediction={aiPrediction}
            isLoadingAI={isLoadingAI}
            onRefreshAI={triggerAIScan}
            algorithmicDecision={algorithmicDecision}
            regime={regime}
            agents={agents}
            sniperSetup={sniperSetup}
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
            isExecuting={isExecuting}
            onExecuteTrade={executeTrade}
            openTrades={openTrades}
            closedTrades={closedTrades}
            onEarlyExit={handleEarlyExit}
            onOpenCritiqueModal={(trade) => setSelectedCritiqueTrade(trade)}
            sizingMode={sizingMode}
            onSizingModeChange={setSizingMode}
            coreRiskMetrics={coreRiskMetrics}
            dynamicStake={dynamicStake}
            trailingStopConfig={trailingStopConfig}
            onTrailingStopConfigChange={(cfg) => {
              setTrailingStopConfig(cfg);
              updateTrailingStop(cfg);
            }}
            isSniperTriggerArmed={isSniperTriggerArmed}
            onToggleSniperTrigger={() => setIsSniperTriggerArmed(!isSniperTriggerArmed)}
            autonomyMode={autonomyMode}
            lifecycleState={autonomySnapshot.lifecycle}
            executionMode={autonomySnapshot.executionMode}
            strategyVersion={strategyState.activeVersion}
            sbagentAutonomyGrant={sbagentAutonomyGrant}
            autonomyPreset={autonomyPreset}
            appliedSettings={appliedAutonomySettings}
            lastError={lastAutonomyError}
            onRunAutonomously={handleRunAutonomously}
            onStopAutonomy={handleStopAutonomy}
            onConfigureAutonomy={handleConfigureAutonomy}
            balance={balance}
            hasDerivToken={derivWS.hasRealToken()}
            setIsQuickSettingsOpen={setIsQuickSettingsOpen}
          />
        </div>

        {/* View 2: Multi-Agent & Mathematical Analytics */}
        {activeTab === 'analytics' && (
          <div className="flex flex-col gap-6 tab-crossfade-enter">
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
              onUpdateBotState={(updates) => {
                if (typeof updates.enabled === 'boolean') {
                  if (updates.enabled) handleRunAutonomously();
                  else handleStopAutonomy('user_button');
                } else {
                  setBotState((prev) => ({ ...prev, ...updates }));
                }
              }}
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 tab-crossfade-enter">
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
                onRotateSymbol={(sym) => {
                  setSelectedSymbol(sym);
                  derivWS.fetchCandles(sym, granularity, 120);
                  derivWS.subscribeTicks(sym);
                }}
                onAdjustStake={(nextStake, mode) => {
                  setStake(nextStake);
                  if (mode && ['FIXED', 'EQUITY_PERCENT', 'KELLY_HALF', 'KELLY_QUARTER'].includes(mode)) {
                    setSizingMode(mode as PositionSizingMode);
                  }
                }}
                onExecuteTrade={(dir) => executeTrade(dir, stake, duration, 'COPILOT', durationUnit, undefined, trailingStopConfig)}
                onExportJournal={exportTradingJournalCSV}
                onProposeSbagentUpdate={(proposal) => {
                  setActiveStrategyProposal(proposal);
                  setIsStrategyEvolutionOpen(true);
                }}
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
          <div className="flex flex-col gap-6 tab-crossfade-enter">
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
          <div className="tab-crossfade-enter">
            <React.Suspense fallback={<BlackboxSkeleton />}>
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
                  if (botState.enabled) {
                    handleStopAutonomy('user_button');
                  } else {
                    handleRunAutonomously();
                  }
                }}
                balance={balance}
                onSelectSymbol={(sym) => {
                  setSelectedSymbol(sym);
                  derivWS.fetchCandles(sym, granularity, 120);
                  derivWS.subscribeTicks(sym);
                }}
              />
            </React.Suspense>
          </div>
        )}
      </main>

      {/* Modals */}
      <AutonomyConfigModal
        isOpen={isAutonomyConfigOpen}
        onClose={() => setIsAutonomyConfigOpen(false)}
        preset={autonomyPreset}
        onSavePreset={handleSaveAutonomyPreset}
      />

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
          const next = !isAutonomousRunning;
          setIsAutonomousRunning(next);
          if (next) {
            if (autonomyManager.getLifecycle() !== 'ACTIVE') {
              handleRunAutonomously();
            } else {
              autonomyManager.updatePermissions({ allowSubagent: true }, 'subagent_modal_enabled');
            }
          } else {
            autonomyManager.updatePermissions({ allowSubagent: false }, 'subagent_modal_disabled');
          }
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

      <StrategyEvolutionModal
        isOpen={isStrategyEvolutionOpen}
        onClose={() => setIsStrategyEvolutionOpen(false)}
        activeProposal={activeStrategyProposal}
        closedTrades={closedTrades}
        onApplyProposal={async (proposal) => {
          const validated = strategyEvolutionManager.validateCandidateProposal({
            proposedParameters: strategyEvolutionManager.getActiveVersion().parameters,
            rationale: `${proposal.ruleCategory}: ${proposal.proposedRule} — ${proposal.rationale}`,
            closedTrades,
          });
          if (validated.riskCheckPassed) {
            strategyEvolutionManager.promoteProposal(validated.id);
          }
          setActiveStrategyProposal(null);
        }}
        onRejectProposal={() => setActiveStrategyProposal(null)}
        onNotify={(msg) => addLog(msg, 'info')}
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

      {/* Quick Settings Fast Execution Modal */}
      <QuickSettingsModal
        isOpen={isQuickSettingsOpen}
        onClose={() => setIsQuickSettingsOpen(false)}
        stake={stake}
        onStakeChange={setStake}
        duration={duration}
        durationUnit={durationUnit}
        onDurationChange={(dur, unit) => {
          setDuration(dur);
          if (unit) setDurationUnit(unit);
        }}
        botState={botState}
        onUpdateBotState={(updates) => setBotState((prev) => ({ ...prev, ...updates }))}
        isLiveMode={isLiveMode}
        onOpenFullSettings={() => {
          setSettingsCategory('overview');
          setIsSettingsDrawerOpen(true);
        }}
        onTriggerAutoSync={() => autoSyncEngine.triggerSync()}
        lastSyncTime={lastAutoSyncTime}
        currency={currency}
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
        durationUnit={durationUnit}
        onDurationChange={setDuration}
        onExecute={(dir) => executeTrade(dir, stake, duration, 'MANUAL', durationUnit, undefined, trailingStopConfig)}
        isExecuting={isExecuting}
        botActive={botState.enabled}
        isAutonomousRunning={isAutonomousRunning}
        currency={currency}
        isLiveMode={isLiveMode}
        isHoldAdvised={algorithmicDecision?.action === 'HOLD'}
        holdReason={algorithmicDecision?.reason}
        autonomyMode={autonomyMode}
        sbagentAutonomyGrant={sbagentAutonomyGrant}
        onRunAutonomously={handleRunAutonomously}
        onStopAutonomy={handleStopAutonomy}
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
        onRotateSymbol={(sym) => {
          setSelectedSymbol(sym);
          derivWS.fetchCandles(sym, granularity, 120);
          derivWS.subscribeTicks(sym);
        }}
        onAdjustStake={(nextStake, mode) => {
          setStake(nextStake);
          if (mode && ['FIXED', 'EQUITY_PERCENT', 'KELLY_HALF', 'KELLY_QUARTER'].includes(mode)) {
            setSizingMode(mode as PositionSizingMode);
          }
        }}
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
          if (botState.enabled) {
            handleStopAutonomy('user_button');
          } else {
            handleRunAutonomously();
          }
        }}
        onRunAutonomously={handleRunAutonomously}
        onStopAutonomy={handleStopAutonomy}
        autonomyMode={autonomyMode}
        sbagentAutonomyGrant={sbagentAutonomyGrant}
        onToggleSniper={() => {
          sound.play('toggle');
          setIsSniperTriggerArmed((prev) => !prev);
        }}
        onSelectSymbol={(sym) => {
          setSelectedSymbol(sym);
          derivWS.fetchCandles(sym, granularity, 120);
          derivWS.subscribeTicks(sym);
        }}
        onTightenStop={(dist) => {
          addLog(`🛡️ [VOICE COMMAND] Tightened Trailing Stop-Loss by ${dist} ATR`, 'info');
          voice.speak(`Trailing stop tightened by ${dist} ATR`, 'tactical');
        }}
        onShowAgentVotes={() => {
          addLog('🧠 [VOICE COMMAND] Toggled agent consensus votes on chart candles', 'info');
          voice.speak('Agent votes displayed on chart candles', 'tactical');
        }}
        onExportJournal={() => {
          if (closedTrades.length === 0) {
            addLog('No closed trades in journal to export.', 'info');
            return;
          }
          const headers = ['ID', 'Timestamp', 'Symbol', 'Type', 'Stake', 'Profit', 'Result', 'Agent', 'Regime'];
          const rows = closedTrades.map((t) => [
            t.id,
            t.timestamp,
            t.symbol,
            t.decision,
            t.amount,
            t.profit,
            t.result,
            t.agent,
            t.regime,
          ]);
          const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `trade_journal_${new Date().toISOString().slice(0, 10)}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          addLog('📁 Exported trade journal history to CSV', 'success');
          voice.speak('Trade journal exported to CSV', 'tactical');
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

      {/* Interactive Onboarding Tour Modal */}
      <OnboardingTourModal
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
      />

      {/* Structured Autonomous Audit Logs Modal */}
      <AuditLogModal
        isOpen={isAuditLogOpen}
        onClose={() => setIsAuditLogOpen(false)}
      />
    </div>
  );
}
