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
  sizingMode: 'FIXED' | 'KELLY_HALF' | 'KELLY_QUARTER';
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
  derivAppId: string; // default: '1089'
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
    derivAppId: '1089',
    keepAlivePingSeconds: 20,
    reconnectBackoffMs: 4000,
    latencyWarningThresholdMs: 150,
    fallbackSimulationAllowed: true,
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
