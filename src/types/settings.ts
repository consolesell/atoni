import { EarlyExitPolicyConfig, ExecutionModeSetting } from './trading';

export interface GeneralSettings {
  defaultStake: number; // default: 1.00
  defaultDuration: number; // default: 15
  defaultDurationUnit: 'ticks' | 'seconds' | 'minutes'; // default: 'minutes'
  defaultDirection: 'CALL' | 'PUT'; // default: 'CALL'
  defaultSymbol: string; // default: '1HZ10V'
  autoRefreshIntervalSeconds: number; // default: 30
}

export interface RiskSettings {
  maxDailyLoss: number; // default: 50 ($)
  maxDailyTrades: number; // default: 100
  maxConsecutiveLosses: number; // default: 3
  sizingMode: 'FIXED' | 'KELLY_HALF' | 'KELLY_QUARTER' | 'EQUITY_PERCENT';
  maxStakePercent?: number; // default: 0.05
  minStake?: number; // default: 0.35
  maxOpenExposure?: number; // default: 25
  maxConcurrentContracts?: number; // default: 4
  maxSessionDrawdownPercent?: number; // default: 5.0
  virtualAnchorBalance: number; // default: 10.00 ($)
  autoReplenishThreshold: number; // default: 1.00 ($)
  strictDurationCompliance: boolean; // default: true
}

export interface TrailingStopSettings {
  enabled: boolean;
  distanceType: 'ATR' | 'PERCENT' | 'POINTS';
  distanceValue: number; // default: 1.5
  profitLockEnabled: boolean; // default: true
  profitLockThresholdPercent: number; // default: 50 (%)
  profitLockSecuredPercent: number; // default: 50 (%)
}

export interface IndicatorSettings {
  rsiPeriod: number; // default: 14
  rsiOverbought: number; // default: 70
  rsiOversold: number; // default: 30
  bbPeriod: number; // default: 20
  bbStdDev: number; // default: 2.0
  fastMaPeriod: number; // default: 14
  slowMaPeriod: number; // default: 50
  atrPeriod: number; // default: 14
}

export interface AISettings {
  minConfidence: number; // default: 0.65 (65%)
  aiDirectionMatchRequired: boolean; // default: false
  autonomousSymbolChange: boolean; // default: true
  rotationCooldownSeconds: number; // default: 60
  reasoningDeepeningOnLoss: boolean; // default: true
  maxMartingaleRecoverySteps: number; // default: 3
  martingaleMultiplier: number; // default: 1.85
  geminiApiKeys: string[];
  selectedModel: string;
}

export interface AudioSettings {
  soundEnabled: boolean; // default: true
  soundVolume: number; // 0 to 100, default: 80
  voiceEnabled: boolean; // default: true
  voicePersona: string; // default: 'sbagent_core'
  voiceRate: number; // default: 1.0
  voicePitch: number; // default: 1.0
  speakTradeSignals: boolean; // default: true
  speakProfitLock: boolean; // default: true
  speakAutoReplenish: boolean; // default: true
  kokoroVoice?: string; // 'af_heart' | 'af_bella'
  useNeuralTTS?: boolean; // default: true
}

export interface ConnectionSettings {
  derivAppId: string; // default: '33zsnNh6YJ2HWm30oZZJR'
  derivRedirectUrl: string; // default: 'https://deriv-ai-trader-pro.ai.studio/'
  keepAlivePingSeconds: number; // default: 20
  reconnectBackoffMs: number; // default: 4000
  latencyWarningThresholdMs: number; // default: 150
  fallbackSimulationAllowed: boolean; // default: true
}

export interface InterfaceSettings {
  compactMode: boolean; // default: false
  showTickTape: boolean; // default: true
  showConfluencePill: boolean; // default: true
  highContrastCharts: boolean; // default: false
  visibleCandlesCount: number; // default: 120
  animationsEnabled: boolean; // default: true
}

export interface TerminalSettings {
  version: number;
  general: GeneralSettings;
  risk: RiskSettings;
  trailingStop: TrailingStopSettings;
  earlyExit?: EarlyExitPolicyConfig;
  executionMode?: ExecutionModeSetting;
  indicators: IndicatorSettings;
  ai: AISettings;
  audio: AudioSettings;
  connection: ConnectionSettings;
  interface: InterfaceSettings;
  updatedAt: string;
}

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  version: 4,
  general: {
    defaultStake: 1.0,
    defaultDuration: 15,
    defaultDurationUnit: 'minutes',
    defaultDirection: 'CALL',
    defaultSymbol: '1HZ10V',
    autoRefreshIntervalSeconds: 30,
  },
  risk: {
    maxDailyLoss: 50.0,
    maxDailyTrades: 100,
    maxConsecutiveLosses: 3,
    sizingMode: 'KELLY_HALF',
    maxStakePercent: 0.05,
    minStake: 0.35,
    maxOpenExposure: 25.0,
    maxConcurrentContracts: 4,
    maxSessionDrawdownPercent: 5.0,
    virtualAnchorBalance: 10.0,
    autoReplenishThreshold: 1.0,
    strictDurationCompliance: true,
  },
  trailingStop: {
    enabled: true,
    distanceType: 'ATR',
    distanceValue: 1.5,
    profitLockEnabled: true,
    profitLockThresholdPercent: 50,
    profitLockSecuredPercent: 50,
  },
  executionMode: 'SUPERVISED_AUTO',
  earlyExit: {
    enabled: true,
    autoExecute: true,
    profitTargetEnabled: true,
    profitTargetPercent: 60,
    profitProtectionEnabled: true,
    profitLockTriggerPercent: 35,
    profitProtectionDrawdownPercent: 40,
    trailingStopEnabled: true,
    reversalExitEnabled: true,
    reversalConfidenceThreshold: 72,
    signalDeteriorationEnabled: true,
    maxLossExitEnabled: false,
    maxLossPercent: 50,
    timeDecayExitEnabled: false,
    minRemainingSeconds: 20,
  },
  indicators: {
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
    bbPeriod: 20,
    bbStdDev: 2.0,
    fastMaPeriod: 14,
    slowMaPeriod: 50,
    atrPeriod: 14,
  },
  ai: {
    minConfidence: 0.45,
    aiDirectionMatchRequired: false,
    autonomousSymbolChange: true,
    rotationCooldownSeconds: 60,
    reasoningDeepeningOnLoss: true,
    maxMartingaleRecoverySteps: 3,
    martingaleMultiplier: 1.85,
    geminiApiKeys: [],
    selectedModel: 'auto',
  },
  audio: {
    soundEnabled: true,
    soundVolume: 80,
    voiceEnabled: true,
    voicePersona: 'sbagent_core',
    voiceRate: 1.0,
    voicePitch: 1.0,
    speakTradeSignals: true,
    speakProfitLock: true,
    speakAutoReplenish: true,
    kokoroVoice: 'af_heart',
    useNeuralTTS: true,
  },
  connection: {
    derivAppId: '33zsnNh6YJ2HWm30oZZJR',
    derivRedirectUrl: 'https://deriv-ai-trader-pro.ai.studio/',
    keepAlivePingSeconds: 20,
    reconnectBackoffMs: 4000,
    latencyWarningThresholdMs: 150,
    fallbackSimulationAllowed: false,
  },
  interface: {
    compactMode: false,
    showTickTape: true,
    showConfluencePill: true,
    highContrastCharts: false,
    visibleCandlesCount: 120,
    animationsEnabled: true,
  },
  updatedAt: new Date().toISOString(),
};
