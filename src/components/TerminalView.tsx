import React from 'react';
import {
  Candle,
  TechnicalIndicators,
  MarketRegime,
  DecisionResult,
  AIPredictionResult,
  TradeRecord,
  TradingAgent,
  CoreRiskMetrics,
  PositionSizingMode,
  TrailingStopConfig,
} from '../types/trading';
import { TradeDurationUnit, SniperConfluenceResult } from '../types/sniper';
import { AutonomyMode, AutonomyPreset, AppliedAutonomySettings } from '../types/autonomy';
import { ChartErrorBoundary } from './ChartErrorBoundary';
import { InteractiveChart } from './InteractiveChart';
import { PositionsDrawer } from './PositionsDrawer';
import { AutonomyCard } from './AutonomyCard';
import { TradeControls } from './TradeControls';
import { AIPredictionCard } from './AIPredictionCard';
import { sound } from '../lib/soundEngine';

export interface TerminalViewProps {
  // Chart & Feed
  candles: Candle[];
  currentPrice: number;
  indicators: TechnicalIndicators | null;
  granularity: number;
  onGranularityChange: (g: number) => void;
  onRefreshChart: () => void;
  symbol: string;
  decimals: number;
  currency: string;
  isLiveMode: boolean;

  // Predictions & Decisions
  aiPrediction: AIPredictionResult | null;
  isLoadingAI: boolean;
  onRefreshAI: () => void;
  algorithmicDecision: DecisionResult | null;
  regime: MarketRegime;
  agents: TradingAgent[];
  sniperSetup: SniperConfluenceResult | null;

  // Trade Execution & Management
  stake: number;
  onStakeChange: (s: number) => void;
  duration: number;
  durationUnit: TradeDurationUnit;
  onDurationChange: (dur: number, unit?: TradeDurationUnit) => void;
  direction: 'CALL' | 'PUT';
  onDirectionChange: (dir: 'CALL' | 'PUT') => void;
  isExecuting: boolean;
  onExecuteTrade: (
    direction: 'CALL' | 'PUT',
    stake: number,
    duration: number,
    source?: 'MANUAL' | 'AUTO_BOT' | 'SUBAGENT_MD',
    unit?: TradeDurationUnit,
    sniperData?: any,
    customTSL?: TrailingStopConfig
  ) => void;
  openTrades: TradeRecord[];
  closedTrades: TradeRecord[];
  onEarlyExit: (tradeId: string) => void;
  onOpenCritiqueModal: (trade: TradeRecord) => void;

  // Risk & Sizing
  sizingMode: PositionSizingMode;
  onSizingModeChange: (mode: PositionSizingMode) => void;
  coreRiskMetrics: CoreRiskMetrics;
  dynamicStake: number;
  trailingStopConfig: TrailingStopConfig;
  onTrailingStopConfigChange: (cfg: TrailingStopConfig) => void;

  // Sniper
  isSniperTriggerArmed: boolean;
  onToggleSniperTrigger: () => void;

  // Autonomy
  autonomyMode: AutonomyMode;
  sbagentAutonomyGrant: boolean;
  autonomyPreset: AutonomyPreset;
  appliedSettings?: AppliedAutonomySettings | null;
  lastError: string[] | string | null;
  onRunAutonomously: () => void;
  onStopAutonomy: (source?: string) => void;
  onConfigureAutonomy: () => void;
  balance: number;
  handleReplenishVirtualAnchor: () => void;
  setIsQuickSettingsOpen: (open: boolean) => void;
}

export const TerminalView: React.FC<TerminalViewProps> = ({
  candles,
  currentPrice,
  indicators,
  granularity,
  onGranularityChange,
  onRefreshChart,
  symbol,
  decimals,
  currency,
  isLiveMode,

  aiPrediction,
  isLoadingAI,
  onRefreshAI,
  algorithmicDecision,
  regime,
  agents,
  sniperSetup,

  stake,
  onStakeChange,
  duration,
  durationUnit,
  onDurationChange,
  direction,
  onDirectionChange,
  isExecuting,
  onExecuteTrade,
  openTrades,
  closedTrades,
  onEarlyExit,
  onOpenCritiqueModal,

  sizingMode,
  onSizingModeChange,
  coreRiskMetrics,
  dynamicStake,
  trailingStopConfig,
  onTrailingStopConfigChange,

  isSniperTriggerArmed,
  onToggleSniperTrigger,

  autonomyMode,
  sbagentAutonomyGrant,
  autonomyPreset,
  appliedSettings,
  lastError,
  onRunAutonomously,
  onStopAutonomy,
  onConfigureAutonomy,
  balance,
  handleReplenishVirtualAnchor,
  setIsQuickSettingsOpen,
}) => {
  return (
    <div className="flex flex-col gap-4 sm:gap-6 tab-crossfade-enter">
      {/* Simulation Balance Recovery Banner */}
      {!isLiveMode && balance < 2.0 && (
        <div className="flex items-center justify-between p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-xs font-mono">
          <span className="text-amber-300">
            Virtual balance low (${balance.toFixed(2)} USD). Replenish to continue paper testing.
          </span>
          <button
            type="button"
            onClick={handleReplenishVirtualAnchor}
            className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/50 font-bold transition-all animate-pulse"
          >
            Replenish Anchor ($10.00)
          </button>
        </div>
      )}

      {/* Main Grid Viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* Left Column: Interactive Canvas Chart & Positions Drawer */}
        <div className="lg:col-span-8 flex flex-col gap-4 sm:gap-5">
          <ChartErrorBoundary
            fallbackSymbol={symbol}
            onReset={() => {
              onRefreshChart();
              onRefreshAI();
            }}
          >
            <InteractiveChart
              candles={candles}
              currentPrice={currentPrice}
              openTrades={openTrades}
              closedTrades={closedTrades}
              indicators={indicators}
              granularity={granularity}
              onGranularityChange={onGranularityChange}
              onRefresh={() => {
                onRefreshChart();
                onRefreshAI();
              }}
              symbol={symbol}
              aiPrediction={aiPrediction}
              onExecuteTrade={(dir) =>
                onExecuteTrade(dir, stake, duration, 'MANUAL', durationUnit, undefined, trailingStopConfig)
              }
              stake={stake}
              onStakeChange={onStakeChange}
              isExecuting={isExecuting}
              currency={currency}
              algorithmicDecision={algorithmicDecision}
              regime={regime}
              agents={agents}
              sniperSetup={sniperSetup}
              onOpenQuickSettings={() => setIsQuickSettingsOpen(true)}
            />
          </ChartErrorBoundary>

          <PositionsDrawer
            openTrades={openTrades}
            closedTrades={closedTrades}
            currentPrice={currentPrice}
            onEarlyExit={onEarlyExit}
            onOpenCritiqueModal={onOpenCritiqueModal}
            decimals={decimals}
            currency={currency}
          />
        </div>

        {/* Right Column: Autonomy Deck, Trade Controls & AI Prediction Card */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          <AutonomyCard
            autonomyMode={autonomyMode}
            sbagentAutonomyGrant={sbagentAutonomyGrant}
            autonomyPreset={autonomyPreset}
            appliedSettings={appliedSettings}
            lastError={lastError}
            onRunAutonomously={onRunAutonomously}
            onStopAutonomy={onStopAutonomy}
            onConfigure={onConfigureAutonomy}
            currentSymbol={symbol}
            balance={balance}
          />

          <TradeControls
            stake={stake}
            onStakeChange={onStakeChange}
            duration={duration}
            durationUnit={durationUnit}
            onDurationChange={onDurationChange}
            direction={direction}
            onDirectionChange={onDirectionChange}
            onExecuteTrade={(customTSL) =>
              onExecuteTrade(
                direction,
                stake,
                duration,
                'MANUAL',
                durationUnit,
                undefined,
                customTSL ?? trailingStopConfig
              )
            }
            isExecuting={isExecuting}
            aiPrediction={aiPrediction}
            algorithmicDecision={algorithmicDecision}
            currency={currency}
            isLiveMode={isLiveMode}
            sizingMode={sizingMode}
            onSizingModeChange={onSizingModeChange}
            riskMetrics={coreRiskMetrics}
            recommendedKellyStake={dynamicStake}
            sniperSetup={sniperSetup}
            currentPrice={currentPrice}
            trailingStopConfig={trailingStopConfig}
            onTrailingStopConfigChange={onTrailingStopConfigChange}
            onOpenQuickSettings={() => setIsQuickSettingsOpen(true)}
            onExecuteSniperTrade={(dir, s, dur, unit, sniperTSL) => {
              onExecuteTrade(
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
              onToggleSniperTrigger();
              sound.play('toggle');
            }}
          />

          <AIPredictionCard
            prediction={aiPrediction}
            isLoading={isLoadingAI}
            onRefresh={onRefreshAI}
            symbol={symbol}
          />
        </div>
      </div>
    </div>
  );
};
