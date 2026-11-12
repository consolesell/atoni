import { z } from 'zod';

export const TerminalConfigSchema = z.object({
  version: z.string().default('4.1.0'),

  // Consensus & Deliberation Engine Parameters
  consensus: z.object({
    minConfidence: z.number().default(0.38),
    highConfidenceThreshold: z.number().default(0.62),
    vetoConfidenceThreshold: z.number().default(0.75),
    agreementRatioRequired: z.number().default(0.60),
    adaptiveConfidenceEnabled: z.boolean().default(true),
  }).default({
    minConfidence: 0.38,
    highConfidenceThreshold: 0.62,
    vetoConfidenceThreshold: 0.75,
    agreementRatioRequired: 0.60,
    adaptiveConfidenceEnabled: true,
  }),

  // Risk Management & Capital Protection Parameters
  risk: z.object({
    maxSessionDrawdownPercent: z.number().default(5.0),
    maxPortfolioExposurePercent: z.number().default(0.06),
    minPortfolioExposureFloorUSD: z.number().default(15.0),
    maxConcurrentPositions: z.number().default(4),
    maxDailyLossUSD: z.number().default(10.0),
    maxConsecutiveLosses: z.number().default(3),
    maxDailyTrades: z.number().default(50),
    dynamicTighteningGainTier1Pct: z.number().default(20.0),
    dynamicTighteningDrawdown1Pct: z.number().default(3.8),
    dynamicTighteningGainTier2Pct: z.number().default(50.0),
    dynamicTighteningDrawdown2Pct: z.number().default(2.8),
    defaultKellyFraction: z.number().default(0.015),
  }).default({
    maxSessionDrawdownPercent: 5.0,
    maxPortfolioExposurePercent: 0.06,
    minPortfolioExposureFloorUSD: 15.0,
    maxConcurrentPositions: 4,
    maxDailyLossUSD: 10.0,
    maxConsecutiveLosses: 3,
    maxDailyTrades: 50,
    dynamicTighteningGainTier1Pct: 20.0,
    dynamicTighteningDrawdown1Pct: 3.8,
    dynamicTighteningGainTier2Pct: 50.0,
    dynamicTighteningDrawdown2Pct: 2.8,
    defaultKellyFraction: 0.015,
  }),

  // Market & Technical Filter Parameters
  market: z.object({
    bbWidthThreshold: z.number().default(0.0015),
    rsiOverbought: z.number().default(70),
    rsiOversold: z.number().default(30),
    volatilityCompressionThreshold: z.number().default(0.0003),
    candleHistoryLimit: z.number().default(150),
    tickBufferLimit: z.number().default(40),
  }).default({
    bbWidthThreshold: 0.0015,
    rsiOverbought: 70,
    rsiOversold: 30,
    volatilityCompressionThreshold: 0.0003,
    candleHistoryLimit: 150,
    tickBufferLimit: 40,
  }),

  // Autonomy & Symbol Rotation Parameters
  autonomy: z.object({
    allowedSymbols: z.array(z.string()).default([
      '1HZ100V',
      '1HZ75V',
      '1HZ50V',
      '1HZ25V',
      '1HZ10V',
      'R_100',
      'R_75',
      'R_50',
    ]),
    rotationCooldownSec: z.number().default(180),
    consecutiveLossRotationTrigger: z.number().default(2),
    minWinRateForPromotion: z.number().default(0.55),
  }).default({
    allowedSymbols: [
      '1HZ100V',
      '1HZ75V',
      '1HZ50V',
      '1HZ25V',
      '1HZ10V',
      'R_100',
      'R_75',
      'R_50',
    ],
    rotationCooldownSec: 180,
    consecutiveLossRotationTrigger: 2,
    minWinRateForPromotion: 0.55,
  }),

  // Deriv WebSocket Connection & Watchdog
  connectivity: z.object({
    appId: z.string().default('1089'),
    wsEndpoint: z.string().default('wss://ws.derivws.com/websockets/v3'),
    heartbeatIntervalMs: z.number().default(20000),
    heartbeatTimeoutMs: z.number().default(12000),
    reconnectBaseDelayMs: z.number().default(1500),
    reconnectMaxDelayMs: z.number().default(12000),
  }).default({
    appId: '1089',
    wsEndpoint: 'wss://ws.derivws.com/websockets/v3',
    heartbeatIntervalMs: 20000,
    heartbeatTimeoutMs: 12000,
    reconnectBaseDelayMs: 1500,
    reconnectMaxDelayMs: 12000,
  }),
});

export type TerminalConfig = z.infer<typeof TerminalConfigSchema>;

export const DEFAULT_TERMINAL_CONFIG: TerminalConfig = TerminalConfigSchema.parse({});

export function validateTerminalConfig(config: unknown): TerminalConfig {
  try {
    if (!config || typeof config !== 'object') {
      return DEFAULT_TERMINAL_CONFIG;
    }
    const merged = {
      ...DEFAULT_TERMINAL_CONFIG,
      ...(config as any),
      consensus: { ...DEFAULT_TERMINAL_CONFIG.consensus, ...((config as any).consensus || {}) },
      risk: { ...DEFAULT_TERMINAL_CONFIG.risk, ...((config as any).risk || {}) },
      market: { ...DEFAULT_TERMINAL_CONFIG.market, ...((config as any).market || {}) },
      autonomy: { ...DEFAULT_TERMINAL_CONFIG.autonomy, ...((config as any).autonomy || {}) },
      connectivity: { ...DEFAULT_TERMINAL_CONFIG.connectivity, ...((config as any).connectivity || {}) },
    };

    const result = TerminalConfigSchema.safeParse(merged);
    if (!result.success) {
      console.warn('[TerminalConfig] Validation fallback triggered:', result.error);
      return DEFAULT_TERMINAL_CONFIG;
    }
    return result.data;
  } catch (err) {
    console.warn('[TerminalConfig] Error parsing config, using defaults:', err);
    return DEFAULT_TERMINAL_CONFIG;
  }
}
