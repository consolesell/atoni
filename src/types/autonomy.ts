import { MarketRegimeType } from './trading';

export type AutonomyMode = 'OFF' | 'ARMED' | 'RUNNING';

export interface AutonomyRiskCeilings {
  maxStake: number;                 // e.g. $5.00
  sessionDrawdownCap: number;       // e.g. 5.0%
  maxExposure: number;              // e.g. $15.00
  maxConsecutiveLosses: number;     // e.g. 3
  sizingMode: 'HALF_KELLY' | 'CONSERVATIVE_KELLY' | 'BASE_FLAT';
}

export interface AutonomyPreset {
  id: string;
  name: string;
  risk: AutonomyRiskCeilings;
  allowedSymbols: string[];
  strategyProfile: string;          // e.g. 'sbagent.md-v4.1'
  minConsensusAgreement: number;    // e.g. 0.62 (or 3 of 4 agents)
  rotationCooldownSeconds: number;  // e.g. 60
}

export interface AutonomySessionContext {
  symbol: string;
  balance: number;
  accountMode: 'DEMO' | 'REAL';
  regime: MarketRegimeType | string;
  openExposure: number;
  risk: AutonomyRiskCeilings;
  allowedSymbols: string[];
  strategyRef: string;
}

export interface AppliedAutonomySettings {
  strategyName: string;
  symbol: string;
  calibratedStake: number;
  calibratedDuration: number;
  calibratedDurationUnit: 'ticks' | 'seconds' | 'minutes';
  regime: MarketRegimeType | string;
  agentWeights: Record<string, number>;
  consensusThreshold: number;
  sessionDrawdownCap: number;
  maxExposure: number;
  holdRules: {
    bbWidthTooTight: boolean;
    mtfConflict: boolean;
    consecutiveLossLimit: number;
  };
  circuitBreakerArmed: boolean;
  timestamp: number;
}

export interface AutonomyConfigResult {
  ok: boolean;
  appliedSettings?: AppliedAutonomySettings;
  blockers?: string[];
}

export const DEFAULT_SBAGENT_PRESET: AutonomyPreset = {
  id: 'preset_sbagent_core',
  name: 'SBAgent Quantitative Core',
  risk: {
    maxStake: 5.0,
    sessionDrawdownCap: 5.0,
    maxExposure: 15.0,
    maxConsecutiveLosses: 3,
    sizingMode: 'HALF_KELLY',
  },
  allowedSymbols: [
    '1HZ10V',
    '1HZ25V',
    '1HZ50V',
    '1HZ75V',
    '1HZ100V',
    'R_10',
    'R_25',
    'R_50',
    'R_75',
    'R_100',
  ],
  strategyProfile: 'sbagent.md-v4.1',
  minConsensusAgreement: 0.62,
  rotationCooldownSeconds: 60,
};
