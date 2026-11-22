export interface Candle {
  epoch: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface Tick {
  epoch: number;
  quote: number;
  symbol?: string;
}

export type MarketRegimeType =
  | 'STRONG_UPTREND'
  | 'UPTREND'
  | 'STRONG_DOWNTREND'
  | 'DOWNTREND'
  | 'HIGH_VOLATILITY'
  | 'CONSOLIDATION'
  | 'SIDEWAYS'
  | 'NEUTRAL'
  | 'INSUFFICIENT_DATA'
  | 'UNKNOWN';

export interface MarketRegime {
  type: MarketRegimeType;
  state?: MarketRegimeType | string;
  volatility?: number;
  trend?: number;
  confidence: number;
  atr?: number | null;
}

export interface CandlestickPatternResult {
  pattern: string;
  strength: number;
  signal: 'BULLISH' | 'STRONG_BULLISH' | 'BEARISH' | 'STRONG_BEARISH' | 'REVERSAL_PENDING' | 'NEUTRAL';
}

export interface MicroStructureResult {
  momentum: number;
  volatility: number;
  prediction: string;
  confidence: number;
}

export interface MultiTimeframeAnalysis {
  strength: number;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  consistency: number;
  shortTrend?: number;
  medTrend?: number;
  longTrend?: number;
}

export interface VWAPAnalysis {
  vwap: number;
  deviation: number;
  signal: 'ABOVE_VWAP' | 'BELOW_VWAP' | 'NEUTRAL';
  currentPrice?: number;
}

export interface MarketMoodResult {
  mood: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  strength: number;
  ratio: number;
}

export interface TechnicalIndicators {
  ma14: (number | null)[];
  ma50: (number | null)[];
  rsi: (number | null)[];
  bb: { upper: number | null; middle: number | null; lower: number | null }[];
  macd: { macdLine: (number | null)[]; signalLine: (number | null)[]; histogram: (number | null)[] };
  atr: (number | null)[];
  volatility: number;
  ma14Now: number | null;
  ma50Now: number | null;
  rsiNow: number | null;
  bbNow: { upper: number | null; middle: number | null; lower: number | null } | null;
  macdNow: number | null;
  atrNow: number | null;
  currentPrice: number;
  pattern: CandlestickPatternResult;
  microAnalysis: MicroStructureResult | null;
  mtfAnalysis: MultiTimeframeAnalysis | null;
  vwapAnalysis: VWAPAnalysis | null;
  mood: MarketMoodResult | null;
  regime: MarketRegime;
}

export interface TradingAgent {
  name: string;
  displayName: string;
  description: string;
  weights: {
    ma: number;
    momentum: number;
    rsi: number;
    bb: number;
  };
  wins: number;
  trades: number;
  winRate: number;
  currentSignal?: number;
  recommendedAction?: 'BUY' | 'SELL' | 'HOLD';
}

export interface AgentConsensusResult {
  buyVotes: number;
  sellVotes: number;
  holdVotes: number;
  totalAgents: number;
  agreementRatio: number; // e.g. 0.75 for 3/4
  weightedAgreement: number; // e.g. 0.65
  hasConsensus: boolean; // >= 3/4 or weighted >= 0.62
  consensusDirection: 'BUY' | 'SELL' | 'HOLD';
  thresholdRequired: number; // 0.62
  rationale: string;
}

export type DurationUnit = 'ticks' | 'seconds' | 'minutes' | 'hours' | 'days';
export type DerivDurationUnitCode = 't' | 's' | 'm' | 'h' | 'd';

export type DurationRecommendationSource =
  | 'ACDE'
  | 'MANUAL'
  | 'GEMINI_AI'
  | 'LOCAL_AI'
  | 'SUBAGENT_MD'
  | 'COPILOT'
  | 'SNIPER'
  | 'STRATEGY_AUTOMATION'
  | 'FALLBACK';

export interface DurationRecommendation {
  value: number;
  unit: DurationUnit;
  confidence: number; // 0..100 or 0..1 normalized cleanly
  strategyId: string;
  strategyVersion: string;
  symbol: string;
  marketRegime: string;
  signalTimestamp: number;
  timeframeContext: string;
  expectedHoldingWindow: string;
  validUntil: number;
  rationale: string;
  source: DurationRecommendationSource;
}

export type DurationGovernanceMode = 'MANUAL_OVERRIDE' | 'ADAPTIVE_AUTO';

export interface DurationBounds {
  minSeconds?: number;
  maxSeconds?: number;
  minTicks?: number;
  maxTicks?: number;
  allowedUnits?: DurationUnit[];
}

export interface DurationGovernancePolicy {
  mode: DurationGovernanceMode;
  globalMinSeconds: number;
  globalMaxSeconds: number;
  globalMinTicks: number;
  globalMaxTicks: number;
  allowedUnits: DurationUnit[];
  confidenceThreshold: number; // 0..100 (e.g. 55)
  fallbackBehavior: 'HOLD' | 'SAFE_BASELINE';
  recalibrationPolicy: {
    minSampleCount: number;
    outOfSampleRatio: number; // e.g. 0.30
    neverLengthenAfterLoss: boolean;
  };
  perSymbolBounds?: Record<string, DurationBounds>;
  perStrategyBounds?: Record<string, DurationBounds>;
}

export interface BrokerContractDurationBounds {
  symbol: string;
  contractType: 'CALL' | 'PUT';
  supportedUnits: DurationUnit[];
  minTickDuration?: number;
  maxTickDuration?: number;
  minTimeSeconds?: number;
  maxTimeSeconds?: number;
  rawMinContractDuration?: string;
  rawMaxContractDuration?: string;
  source: 'DERIV_CONTRACTS_FOR' | 'SYMBOL_DEFAULT';
  fetchedAt: number;
}

export interface BrokerDurationVerification {
  verified: boolean;
  requestedDuration: number;
  requestedDurationUnit: DurationUnit;
  brokerDurationUnit?: DerivDurationUnitCode;
  brokerConfirmedStartMs?: number;
  brokerConfirmedExpiryMs?: number;
  observedHorizonSeconds?: number;
  expectedHorizonSeconds?: number;
  toleranceSeconds?: number;
  note: string;
}

export interface SymbolVolatilityProfile {
  symbol: string;
  currentAtr: number | null;
  medianHistoricalAtr: number | null;
  relativeAtrRatio: number; // currentAtr / medianHistoricalAtr
  realizedVolatility: number;
  baselineRealizedVolatility: number;
  volatilityAcceleration: number; // >1 accelerating, <1 calming
  sampleCount: number;
}

export interface DurationPerformanceBucket {
  bucketKey: string;
  symbol: string;
  strategyId: string;
  strategyVersion: string;
  marketRegime: string;
  direction: string;
  duration: number;
  durationUnit: DurationUnit;
  chartTimeframeSeconds?: number;
  earlyExitCount: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netProfit: number;
  avgPnL: number;
  maxDrawdownPercent: number;
  expectancy: number;
  uncalibrated: boolean;
  outOfSampleTrades?: number;
  outOfSampleWinRate?: number;
  outOfSampleExpectancy?: number;
}

export interface ACDEResult {
  action: 'SELECT' | 'HOLD';
  duration: number;
  unit: DurationUnit;
  originalDuration: number;
  originalUnit: DurationUnit;
  wasAdjusted: boolean;
  adjustmentReason?: string;
  holdReason?: string;
  recommendation: DurationRecommendation | null;
  volatilityProfile: SymbolVolatilityProfile;
  calibration: {
    uncalibrated: boolean;
    sampleCount: number;
    bestBucketKey?: string;
    reason: string;
  };
  chartTimeframeSeconds?: number;
  signalDecaySeconds?: number;
  evaluatedAt: number;
}

export interface DecisionResult {
  action: 'BUY' | 'SELL' | 'HOLD' | 'STRONG BUY' | 'STRONG SELL';
  reason: string;
  confidence: number;
  compositeSignal: number;
  indicators: Partial<TechnicalIndicators>;
  regime: MarketRegime;
  mood?: MarketMoodResult;
  agent: string;
  duration: number;
  durationUnit?: DurationUnit;
  durationRecommendation?: DurationRecommendation | null;
  acdeResult?: ACDEResult | null;
  takeProfitAmount?: number;
  takeProfitEnabled?: boolean;
  targetPrice?: number;
  stopPrice?: number;
  adjustments?: string[];
  aiPrediction?: AIPredictionResult | null;
  aiBlocked?: boolean;
  consensus?: AgentConsensusResult;
}

export interface AIPredictionResult {
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence_score: number;
  ai_predicted_win_probability: number;
  suggested_duration?: number;
  suggested_duration_unit?: DurationUnit;
  duration_recommendation?: Partial<DurationRecommendation> | null;
  regime_verdict: string;
  primary_catalyst: string;
  risk_factors: string[];
  reason: string;
  support_level?: number;
  resistance_level?: number;
  timestamp?: string;
  parsed_ok?: boolean;
  is_algorithmic_fallback?: boolean;
  context?: PredictionContext;
}

export interface TrailingStopConfig {
  enabled: boolean;
  distanceType: 'ATR' | 'PERCENT' | 'POINTS';
  distanceValue: number;
  activationThreshold?: number;
  profitLockEnabled?: boolean;
  profitLockThresholdPercent?: number; // e.g. 50% of expected profit
  profitLockSecuredPercent?: number;   // portion secured into balance
}

export interface TradeRecord {
  id: string;
  timestamp: string;
  mode: 'DEMO' | 'REAL' | 'LIVE' | 'SIMULATION';
  symbol: string;
  amount: number;
  decision: 'BUY' | 'SELL' | 'CALL' | 'PUT' | 'STRONG BUY' | 'STRONG SELL' | string;
  result: 'WIN' | 'LOSS' | 'PENDING' | 'SOLD';
  profit: number;
  payout?: number;
  confidence: number;
  compositeSignal?: number;
  agent: string;
  regime: string;
  duration: number;
  durationUnit?: DurationUnit;
  requestedDuration?: number;
  requestedDurationUnit?: DurationUnit;
  originalRequestedDuration?: number;
  originalRequestedDurationUnit?: DurationUnit;
  durationAdjustmentReason?: string;
  chartTimeframeSeconds?: number;
  brokerConfirmedStartMs?: number;
  brokerConfirmedExpiryMs?: number;
  brokerDurationVerified?: boolean;
  brokerVerificationNote?: string;
  actualHoldingMs?: number;
  actualSaleTime?: number;
  earlyExited?: boolean;
  durationRecommendation?: DurationRecommendation | null;
  isSniperTrade?: boolean;
  confluenceScore?: number;
  entryPrice: number;
  exitPrice?: number;
  targetPrice?: number;
  stopPrice?: number;
  exitReason?: string;
  holdMs?: number;
  takeProfitEnabled?: boolean;
  takeProfitAmount?: number;
  trailingStopEnabled?: boolean;
  trailingStopDistanceType?: 'ATR' | 'PERCENT' | 'POINTS';
  trailingStopDistance?: number;
  highestFavorablePrice?: number;
  lowestFavorablePrice?: number;
  currentTrailingStopPrice?: number;
  initialStopPrice?: number;
  lockedInProfit?: number;
  peakProfit?: number;
  // Profit Lock Automation
  profitLockEnabled?: boolean;
  profitLockThresholdPercent?: number;
  profitLockTriggered?: boolean;
  profitLockSecuredAmount?: number;
  profitLockTriggerTime?: string;
  contract_id?: string | number;
  proposalId?: string;
  profitPercentage?: number;
  bidPrice?: number;
  currentSpot?: number;
  barrier?: number | string;
  isDerivRealTime?: boolean;
  dateExpiry?: number;
  dateStart?: number;
  isValidToSell?: boolean;
  status?: string;
  indicators?: any;
  aiCritique?: AICritiqueResult | null;
  strategyVersion?: string;
  executionSource?: ExecutionSource;
  earlyExitDecision?: EarlyExitDecision;
  earlyExitReason?: string;
  earlyExitPolicyTriggered?: string;
  earlyExitEvaluatedAt?: number;
}

export interface AICritiqueResult {
  execution_rating: number;
  trade_summary: string;
  what_went_right?: string;
  what_went_wrong?: string;
  strategic_takeaway: string;
  next_setup_advice: string;
}

export interface BotState {
  enabled: boolean;
  isPaused: boolean;
  pauseReason: string | null;
  symbol: string;
  granularity: number;
  stake: number;
  minConfidence: number;
  adaptiveConfidenceEnabled: boolean;
  aiDirectionMatchRequired: boolean;
  maxDailyLoss: number;
  maxConsecutiveLosses: number;
  maxDailyTrades: number;
  tradesToday: number;
  dailyTradeCount?: number;
  dailyProfit: number;
  currentDailyLoss?: number;
  cooldownUntil?: number;
  consecutiveLosses: number;
  maxSessionDrawdownPercent?: number;
  preset: 'ultra_safe' | 'balanced' | 'aggressive_scalper';
  autonomousSymbolChange?: boolean;
  allowedRotationSymbols?: string[];
  rotationCooldownSeconds?: number;
  lastSymbolRotationTime?: number;
  lastRotationReason?: string;
  autoRotationEvaluationInterval?: number;
}

export interface DerivSymbol {
  symbol: string;
  displayName: string;
  market: string;
  submarket: string;
  decimals: number;
  minDuration: number;
  maxDuration: number;
  defaultBasePrice?: number;
}

export type ConnectionState =
  | 'OFFLINE'
  | 'CONNECTING'
  | 'ONLINE'
  | 'RECONNECTING'
  | 'AUTH_REQUIRED';

export type BalanceFreshness =
  | 'SYNCING'
  | 'LIVE'
  | 'STALE'
  | 'UNAVAILABLE'
  | 'RECONCILIATION_PENDING';

export type BalanceSource =
  | 'DISCOVERY'
  | 'SUBSCRIPTION'
  | 'AUTHORIZE'
  | 'SETTLEMENT'
  | 'NONE';

export type DerivAuthMethod = 'oauth2_pkce' | 'pat' | 'legacy_token';

export interface BalanceSnapshot {
  account_id: string | null;
  login_id: string | null;
  account_type: 'demo' | 'real' | null;
  currency: string;
  amount: number;
  last_updated: number;
  source: BalanceSource;
  connection_state: ConnectionState;
  freshness: BalanceFreshness;
  session_generation?: number;
  connection_id?: string | null;
}

export type TradeReadinessFlag =
  | 'VALID_AUTHENTICATION'
  | 'VALID_SELECTED_ACCOUNT'
  | 'ACCOUNT_IDENTITY_CONFIRMED'
  | 'AUTHENTICATED_SESSION'
  | 'FRESH_BALANCE'
  | 'REQUIRED_SUBSCRIPTIONS_ACTIVE'
  | 'NO_UNRESOLVED_PURCHASE_TIMEOUT'
  | 'NO_PENDING_RECONCILIATION'
  | 'RISK_ENGINE_APPROVAL'
  | 'EMERGENCY_STOP_INACTIVE';

export interface TradeReadinessResult {
  ready: boolean;
  flags: Record<TradeReadinessFlag, boolean>;
  blockers: string[];
  snapshotTimestamp: number;
}

export interface PortfolioPnLSummary {
  realizedPnL: number;
  liveDerivPnL: number;
  estimatedPnL: number;
  openContractsCount: number;
  pendingReconciliationCount: number;
}

export interface PendingPurchaseIntent {
  intentId: string;
  clientOrderKey: string;
  symbol: string;
  contractType: 'CALL' | 'PUT';
  amount: number;
  duration: number;
  durationUnit: DurationUnit;
  accountId: string;
  status: 'SUBMITTED' | 'CONFIRMED' | 'RECONCILIATION_PENDING' | 'FAILED';
  createdAt: number;
  contractId?: string | number;
  proposalId?: string;
}

export interface DerivLinkedAccount {
  account: string; // e.g. CR123456 or VRTC987654 or account_id
  account_id?: string;
  token?: string; // Never persisted to Firestore or localStorage for OAuth sessions
  currency: string;
  isVirtual?: boolean;
  account_type?: 'demo' | 'real';
  balance?: number;
  isProvisionalBalance?: boolean;
}

export interface DerivAuthSession {
  isAuthorized: boolean;
  authMethod?: DerivAuthMethod;
  expiresAt?: number;
  appId?: string;
  loginid?: string;
  accountId?: string;
  accountType?: 'demo' | 'real';
  currency?: string;
  balance?: number;
  email?: string;
  fullname?: string;
  isVirtual?: boolean;
  accounts?: DerivLinkedAccount[];
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  accountMode: 'DEMO' | 'REAL';
  demoBalance: number;
  realBalance: number;
  derivApiToken?: string;
  derivAppId?: string;
  derivAccounts?: DerivLinkedAccount[];
  derivActiveAccount?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SubAgentDefinition {
  id: string;
  name: string;
  author: string;
  version: string;
  status: 'ACTIVE' | 'PAUSED' | 'TESTING';
  systemPrompt: string;
  rulesMarkdown: string;
  executionIntervalSeconds: number;
  allowedSymbols: string[];
  maxStake: number;
  riskTolerance: 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE';
  evolutionScore: number;
  learningHistory: {
    timestamp: string;
    tradeId?: string;
    learningNote: string;
    weightAdjustment: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentEvolutionLog {
  id: string;
  agentName: string;
  timestamp: string;
  trigger: 'TRADE_LOSS' | 'TRADE_WIN' | 'REGIME_SHIFT' | 'AI_OPTIMIZER';
  previousWeights: { ma: number; momentum: number; rsi: number; bb: number };
  newWeights: { ma: number; momentum: number; rsi: number; bb: number };
  reason: string;
  improvementMetric: string;
}

export type PositionSizingMode = 'FIXED' | 'KELLY_HALF' | 'KELLY_QUARTER' | 'EQUITY_PERCENT';

export interface AgenticMartingaleState {
  enabled: boolean;
  baseStake: number; // Anchor: $1.00 USD
  currentStake: number;
  multiplier: number; // e.g. 1.8x - 2.0x controlled
  maxSteps: number; // e.g. 3 steps maximum safe cap
  currentStep: number;
  cumulativeLoss: number;
  consecutiveLosses: number;
  recoveryMode: 'DEFENSIVE' | 'AGGRESSIVE_RECOVERY' | 'EQUILIBRIUM';
  lastLossRecoveryTimestamp?: string;
  recoveredDrawdownAmount: number;
  activeTacticalDeepening: boolean; // Increased tactical analysis on loss
  minRecoveryConfluence: number; // Rises to 80% on loss
}

export interface HighestWinGateResult {
  passed: boolean;
  winProbabilityScore: number; // 0 to 100
  qualityGrade: 'A+' | 'A' | 'B+' | 'B' | 'REJECT';
  isGambleSetup: boolean;
  blockReason?: string;
  metrics: {
    trendQuality: number;
    volatilityNoise: number;
    indicatorConvergence: number;
    confluenceRank: number;
    regimeViability: number;
  };
  recommendation: 'EXECUTE' | 'FILTER_OUT' | 'STAND_ASIDE';
}

export interface MarketStabilityMetrics {
  symbol: string;
  stabilityIndex: number; // 0 to 100 (100 = perfectly stable, <45 = volatile noise)
  noiseRatio: number;
  isStable: boolean;
  regime: MarketRegimeType;
  atrPercent: number;
  switchRecommended: boolean;
  targetStableSymbol?: string;
  switchReason?: string;
}

export interface BlackboxHubState {
  dataStreamStatus: 'OPTIMAL' | 'DEGRADED' | 'DISCONNECTED';
  dataTickThroughput: number;
  strategyReasoningActive: boolean;
  activeAgentsCount: number;
  agenticDecisionsCount: number;
  highestWinFilterPassed: boolean;
  lastFilterQuality: string;
  martingaleStep: number;
  marketStabilityIndex: number;
  executionStatus: 'STANDBY' | 'ARMED' | 'EXECUTING' | 'COOLING_DOWN';
  activePipelines: string[];
}

export interface CoreRiskMetrics {
  profitFactor: number;
  grossProfits: number;
  grossLosses: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  tradeExpectancy: number;
  riskRewardRatio: number;
  winRate: number;
  lossRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  averageWin: number;
  averageLoss: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  peakBalance: number;
  troughBalance: number;
  recommendedKellyStake: number;
  kellyFraction: number;
}

// ── Stage 1 + Stage 2 Unified Architecture Types ──

export type AutonomyLifecycleState =
  | 'OFF'
  | 'STARTING'
  | 'ACTIVE'
  | 'PAUSED'
  | 'STOPPING'
  | 'ERROR';

export interface AutonomyPermissions {
  allowAutoBot: boolean;
  allowSubagent: boolean;
  allowAiTriggers: boolean;
  allowEarlySelling: boolean;
  allowSymbolRotation: boolean;
}

export type ExecutionSource =
  | 'MANUAL'
  | 'AUTO_BOT'
  | 'SUBAGENT_MD'
  | 'GEMINI_AI'
  | 'LOCAL_AI'
  | 'COPILOT'
  | 'STRATEGY_AUTOMATION'
  | 'EARLY_SELLING';

export type ExecutionModeSetting = 'MANUAL_ONLY' | 'SUPERVISED_AUTO' | 'FULL_AUTONOMOUS';

export interface PredictionContext {
  requestId: string;
  symbol: string;
  granularity: number;
  snapshotTimestamp: number;
  requestTimestamp: number;
  responseTimestamp: number;
  strategyVersion: string;
  expiresAt: number;
  provider?: string;
  model?: string;
  autonomyGeneration?: number;
  configRevision?: number;
}

export interface ExecutionRequest {
  source: ExecutionSource;
  symbol: string;
  contractType: 'CALL' | 'PUT';
  stake: number;
  duration: number;
  durationUnit: DurationUnit;
  originalDuration?: number;
  originalDurationUnit?: DurationUnit;
  durationAdjustmentReason?: string;
  chartTimeframeSeconds?: number;
  durationRecommendation?: DurationRecommendation | null;
  durationGovernanceMode?: DurationGovernanceMode;
  confidence?: number;
  compositeSignal?: number;
  agent?: string;
  regime?: string;
  strategyVersion?: string;
  reasoning?: string;
  isSniperTrade?: boolean;
  confluenceScore?: number;
  trailingStopEnabled?: boolean;
  trailingStopConfig?: TrailingStopConfig;
  autonomyGeneration?: number;
  predictionContext?: PredictionContext;
  aiPrediction?: AIPredictionResult | null;
  indicators?: Partial<TechnicalIndicators>;
  takeProfitEnabled?: boolean;
  takeProfitAmount?: number;
  targetPrice?: number;
  stopPrice?: number;
}

export interface ExecutionResult {
  executed: boolean;
  status: 'EXECUTED' | 'BLOCKED' | 'RECONCILIATION_PENDING' | 'FAILED';
  contractId?: string | number;
  proposalId?: string;
  buyPrice?: number;
  payout?: number;
  blockers: string[];
  reason: string;
  tradeRecord?: TradeRecord;
  reconciliationPending?: boolean;
  timestamp: number;
}

export type EarlyExitDecision = 'HOLD' | 'PROTECT' | 'SELL' | 'MONITOR';

export interface EarlyExitPolicyConfig {
  enabled: boolean;
  autoExecute: boolean;
  profitTargetEnabled: boolean;
  profitTargetPercent: number; // % of stake, e.g. 55
  profitProtectionEnabled: boolean;
  profitLockTriggerPercent: number; // peak % return before drawdown protection arms, e.g. 35
  profitProtectionDrawdownPercent: number; // allowable drop from peak % return, e.g. 40% of peak
  trailingStopEnabled: boolean;
  reversalExitEnabled: boolean;
  reversalConfidenceThreshold: number; // 0-100, e.g. 72
  signalDeteriorationEnabled: boolean;
  maxLossExitEnabled: boolean;
  maxLossPercent: number; // % of stake lost allowed before early cut if valid to sell, e.g. 45
  timeDecayExitEnabled: boolean;
  minRemainingSeconds: number; // don't force time-decay exit inside final Ns unless danger
  strategyOverrides?: Record<string, Partial<EarlyExitPolicyConfig>>;
}

export interface EarlyExitEvaluation {
  contractId: string | number;
  symbol: string;
  decision: EarlyExitDecision;
  shouldSellNow: boolean;
  isValidToSell: boolean;
  reason: string;
  policyTriggered: string | null;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  expectedPnL: number;
  expectedReturnPercent: number;
  peakReturnPercent: number;
  remainingSeconds: number | null;
  bidPrice: number | null;
  evaluatedAt: number;
}

export type ActionStatus =
  | 'SUCCESS'
  | 'REJECTED'
  | 'REQUIRES_CONFIRMATION'
  | 'UNAUTHORIZED'
  | 'UNAVAILABLE'
  | 'FAILED';

export interface ActionResult<T = any> {
  status: ActionStatus;
  action: string;
  message: string;
  data?: T;
  timestamp: number;
}

export interface StrategyPerformanceMetrics {
  tradesCount: number;
  wins: number;
  losses: number;
  earlyExits: number;
  winRate: number;
  netProfit: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdownPercent: number;
  aiAlignmentWinRate: number;
  regimeBreakdown: Record<string, { trades: number; wins: number; netProfit: number }>;
  symbolBreakdown: Record<string, { trades: number; wins: number; netProfit: number }>;
  durationBreakdown?: Record<string, DurationPerformanceBucket>;
}

export interface StrategyParameters {
  minConfidence: number; // 0.35 - 0.90
  consensusThreshold: number; // 0.50 - 0.85
  kellyFractionScale: number; // 0.25 - 0.50
  maxStakePercent: number; // 0.01 - 0.08
  rsiOverbought: number; // 65 - 85
  rsiOversold: number; // 15 - 35
  earlyExit: Pick<
    EarlyExitPolicyConfig,
    'profitTargetPercent' | 'profitLockTriggerPercent' | 'profitProtectionDrawdownPercent' | 'maxLossPercent'
  >;
}

export type StrategyRolloutMode = 'MANUAL_APPROVAL' | 'AUTO_PROMOTE_SAFE';

export interface StrategyVersionRecord {
  version: string;
  parentVersion: string | null;
  createdAt: string;
  activatedAt?: string;
  retiredAt?: string;
  status: 'BASELINE' | 'CANDIDATE' | 'ACTIVE' | 'ROLLED_BACK' | 'RETIRED';
  rationale: string;
  parameters: StrategyParameters;
  metrics: StrategyPerformanceMetrics;
  rollbackReason?: string;
}

export interface StrategyEvolutionProposal {
  id: string;
  candidateVersion: string;
  baseVersion: string;
  createdAt: number;
  rationale: string;
  proposedParameters: StrategyParameters;
  expectedWinRateDelta: number;
  expectedProfitFactor: number;
  simulatedMaxDrawdownPercent: number;
  riskCheckPassed: boolean;
  riskRejectionReasons: string[];
  approved?: boolean;
}

export type MemoryCategory = 'SESSION' | 'STRATEGY' | 'AGENT' | 'OPERATIONAL';

export type MemoryTrustSource =
  | 'VERIFIED_FACT'
  | 'USER_DECISION'
  | 'AI_OBSERVATION'
  | 'HYPOTHESIS'
  | 'RECOMMENDATION';

export interface MemoryRecord {
  id: string;
  category: MemoryCategory;
  trustSource: MemoryTrustSource;
  verified: boolean;
  key: string;
  title: string;
  summary: string;
  symbol?: string;
  strategyVersion?: string;
  regime?: string;
  tags: string[];
  relevanceScore: number;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  version: number;
  metadata?: Record<string, any>;
}

export type SyncStatus = 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_FAILED';

export interface SessionStateSnapshot {
  sessionId: string;
  version: number;
  startTime: number;
  lastSavedAt: number;
  accountRef: {
    accountId: string | null;
    loginId: string | null;
    accountType: 'demo' | 'real' | null;
    currency: string;
  } | null;
  symbol: string;
  granularity: number;
  activeStrategyVersion: string;
  executionMode: ExecutionModeSetting;
  autonomyLifecycle: AutonomyLifecycleState;
  autonomyPermissions: AutonomyPermissions;
  openContractRefs: Array<{
    contractId: string | number;
    symbol: string;
    buyPrice: number;
    decision: string;
    dateStart?: number;
    dateExpiry?: number;
    strategyVersion?: string;
    requestedDuration?: number;
    requestedDurationUnit?: DurationUnit;
    chartTimeframeSeconds?: number;
    brokerConfirmedExpiryMs?: number;
  }>;
  pendingIntentIds: string[];
  interruptedCleanly: boolean;
  recoverySummary?: string;
}

// ── Autonomous Symbol Intelligence & Rotation Engine (ASIRE) Types ──

export type SymbolEligibilityStatus =
  | 'ELIGIBLE'
  | 'DISALLOWED_UNIVERSE'
  | 'UNAVAILABLE_BROKER'
  | 'CONTRACT_UNSUPPORTED'
  | 'STALE_DATA'
  | 'DATA_UNAVAILABLE'
  | 'QUARANTINED'
  | 'UNVERIFIED';

export type CorrelationStatus = 'LOW' | 'MODERATE' | 'HIGH' | 'UNKNOWN';

export interface CorrelationResult {
  pair: [string, string];
  status: CorrelationStatus;
  pearsonCorrelation: number | null;
  volatilityAdjustedCorrelation: number | null;
  overlappingSamples: number;
  confidence: number; // 0..1 based on synchronized bar sample count
  computedAt: number;
  reason: string;
}

export interface SymbolRankingWeights {
  signalQuality: number;
  directionalAgreement: number;
  stabilityScore: number;
  volatilitySuitability: number;
  strategyCompatibility: number;
  historicalExpectancy: number;
  recentPerformance: number;
  dataFreshness: number;
  riskExposure: number;
  regimeCompatibility: number;
  durationCompatibility: number;
}

export interface SymbolRankingBreakdown {
  signalQuality: number; // 0..1
  directionalAgreement: number; // 0..1
  stabilityScore: number; // 0..1
  volatilitySuitability: number; // 0..1
  strategyCompatibility: number; // 0..1
  historicalExpectancy: number; // 0..1
  recentPerformance: number; // 0..1
  dataFreshness: number; // 0..1
  riskExposure: number; // 0..1
  regimeCompatibility: number; // 0..1
  durationCompatibility: number; // 0..1
  evidenceScore: number; // 0..1
  historicalSamples: number;
}

export type RotationDecisionAction = 'STAY' | 'SWITCH' | 'HOLD' | 'BLOCKED';

export type RotationTransitionState =
  | 'IDLE'
  | 'PENDING_VERIFICATION'
  | 'FAILED'
  | 'ROLLED_BACK';

export type RotationRequestSource =
  | 'SCANNER'
  | 'MARKET_STABILITY'
  | 'SUBAGENT_MD'
  | 'GEMINI_AI'
  | 'LOCAL_AI'
  | 'COPILOT'
  | 'MANUAL';

export type ASIRESensitivity = 'CONSERVATIVE' | 'BALANCED' | 'RESPONSIVE';

export interface SymbolQuarantineState {
  symbol: string;
  quarantined: boolean;
  failureCount: number;
  quarantinedAt: number | null;
  recoverAt: number | null;
  lastFailureAt?: number;
  reason?: string;
}

export interface SymbolMarketSnapshot {
  symbol: string;
  displayName: string;
  latestPrice: number;
  tickTimestamp: number;
  candleTimestamp: number;
  candleCount: number;
  dataFreshnessMs: number;
  isDataFresh: boolean;
  realizedVolatility: number;
  baselineVolatility: number;
  volatilityAcceleration: number;
  marketRegime: MarketRegime;
  trendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trendStrength: number; // 0..1
  momentumPersistence: number; // 0..1
  rsiNow: number | null;
  bollingerBandwidth: number;
  supportLevel: number | null;
  resistanceLevel: number | null;
  supportProximity: number | null;
  resistanceProximity: number | null;
  candlePattern: CandlestickPatternResult;
  priceActionQuality: number; // 0..1
  signalStability: number; // 0..1
  directionalConsistency: number; // 0..1
  mtfAgreement: number; // 0..1
  strategyConfidence: number; // 0..1
  recommendedAction: 'BUY' | 'SELL' | 'HOLD';
  spreadQuality: number | null;
  connectionHealthy: boolean;
  dataAvailable: boolean;
  stabilityIndex: number; // 0..100
  acdeResult?: ACDEResult | null;
  correlationWithActive?: CorrelationResult | null;
}

export interface SymbolCandidateEvaluation {
  symbol: string;
  eligibilityStatus: SymbolEligibilityStatus;
  eligible: boolean;
  rejectionReasons: string[];
  ranking: SymbolRankingBreakdown;
  overallScore: number; // 0..100
  recommendedAction: 'BUY' | 'SELL' | 'HOLD';
  acdeDuration: {
    value: number;
    unit: DurationUnit;
    approved: boolean;
  } | null;
  quarantine: SymbolQuarantineState | null;
  snapshot: SymbolMarketSnapshot | null;
  evaluatedAt: number;
}

export interface RotationDecisionResult {
  action: RotationDecisionAction;
  currentSymbol: string;
  targetSymbol: string | null;
  currentScore: number;
  targetScore: number | null;
  scoreDelta: number;
  confirmationsCount: number;
  confirmationsRequired: number;
  cooldownRemainingSeconds: number;
  rotationsThisSession: number;
  maxRotationsPerSession: number;
  reason: string;
  blockers: string[];
  correlation?: CorrelationResult | null;
  evaluatedAt: number;
}

export interface RotationLearningRecord {
  id: string;
  timestamp: number;
  source: RotationRequestSource;
  previousSymbol: string;
  nextSymbol: string;
  previousScore: number;
  nextScore: number;
  scoreDelta: number;
  reason: string;
  regime: string;
  strategyVersion: string;
  durationRecommendation: DurationRecommendation | null;
  confidence: number;
  followedByTrade: boolean;
  tradeId?: string;
  contractOutcome?: 'WIN' | 'LOSS' | 'SOLD' | null;
  actualHoldingMs?: number;
  pnl?: number;
  outcomeDelta?: number;
  correlationAtSwitch?: CorrelationResult | null;
}

export interface ASIREPolicyConfig {
  enabled: boolean;
  sensitivity: ASIRESensitivity;
  cooldownSeconds: number;
  minScoreImprovement: number;
  confirmationEvaluations: number;
  minDataQualityThreshold: number; // 0..1
  maxRotationsPerSession: number;
  repeatedFailureCooldownSeconds: number;
  quarantineFailureThreshold: number;
  quarantineDurationMs: number;
  maxDataAgeMs: number;
  minCorrelationSamples: number;
  minHistoricalSamplesForTrust: number;
  weights: SymbolRankingWeights;
}

export interface ASIRESnapshot {
  enabled: boolean;
  transitionState: RotationTransitionState;
  pendingTargetSymbol: string | null;
  activeSymbol: string;
  lastDecision: RotationDecisionResult | null;
  candidates: SymbolCandidateEvaluation[];
  quarantinedSymbols: Record<string, SymbolQuarantineState>;
  rotationsThisSession: number;
  cooldownRemainingSeconds: number;
  lastRotationAt: number;
  lastRotationReason: string | null;
  lastEvaluatedAt: number;
  policy: ASIREPolicyConfig;
  learningSummary: {
    totalRotations: number;
    followedTrades: number;
    winRateAfterRotation: number;
    netPnLAfterRotation: number;
  };
}




