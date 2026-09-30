export type TradeDurationUnit = 'ticks' | 'seconds' | 'minutes';

export interface EnhancedTradeDuration {
  value: number;
  unit: TradeDurationUnit;
  seconds: number;
  label: string;
  category: 'ultra_fast' | 'scalp' | 'standard' | 'swing';
  recommendedBy?: string;
  rationale?: string;
}

export interface SniperFactor {
  id: string;
  name: string;
  weight: number;
  score: number; // 0 to 1
  isMet: boolean;
  verdict: string;
  detail: string;
}

export interface SniperConfluenceResult {
  score: number; // 0 to 100
  isPrimed: boolean; // true if score >= 75
  readinessLevel: 'BUILDING' | 'MONITORING' | 'ARMED' | 'SNIPER_PRIMED' | 'EXECUTE_NOW';
  direction: 'CALL' | 'PUT' | 'NEUTRAL';
  factors: SniperFactor[];
  optimalEntryPrice: number;
  entryZoneMin: number;
  entryZoneMax: number;
  distanceToOptimal: number; // price delta
  distancePercent: number; // percent distance to optimal entry
  takeProfitPrice: number;
  stopLossPrice: number;
  riskRewardRatio: number;
  recommendedDuration: EnhancedTradeDuration;
  sniperTriggerArmed: boolean;
  triggerCondition: string;
  summaryReason: string;
  suggestedStakeMultiplier: number;
}

export interface AgentChartToolsConfig {
  enabled: boolean;
  showSupportResistance: boolean;
  showTrendlines: boolean;
  showFibonacci: boolean;
  showOrderBlocks: boolean;
  showSniperTargets: boolean;
  autoRefresh: boolean;
}

export const DEFAULT_AGENT_CHART_CONFIG: AgentChartToolsConfig = {
  enabled: true,
  showSupportResistance: true,
  showTrendlines: true,
  showFibonacci: true,
  showOrderBlocks: true,
  showSniperTargets: true,
  autoRefresh: true,
};
