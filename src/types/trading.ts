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
  takeProfitAmount?: number;
  takeProfitEnabled?: boolean;
  targetPrice?: number;
  stopPrice?: number;
  adjustments?: string[];
  aiPrediction?: AIPredictionResult | null;
  aiBlocked?: boolean;
}

export interface AIPredictionResult {
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence_score: number;
  ai_predicted_win_probability: number;
  suggested_duration: number;
  regime_verdict: string;
  primary_catalyst: string;
  risk_factors: string[];
  reason: string;
  support_level?: number;
  resistance_level?: number;
  timestamp?: string;
  parsed_ok?: boolean;
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
  mode: 'SIMULATION' | 'LIVE';
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
  durationUnit?: 'ticks' | 'seconds' | 'minutes';
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
  indicators?: any;
  aiCritique?: AICritiqueResult | null;
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

export interface DerivLinkedAccount {
  account: string; // e.g. CR123456 or VRTC987654
  token: string;
  currency: string;
  isVirtual?: boolean;
  balance?: number;
}

export interface DerivAuthSession {
  isAuthorized: boolean;
  token?: string;
  appId?: string;
  loginid?: string;
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


