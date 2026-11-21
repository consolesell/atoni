import {
  BalanceSnapshot,
  ConnectionState,
  DurationUnit,
  ExecutionRequest,
  ExecutionResult,
  PredictionContext,
  TradeRecord,
} from '../types/trading';
import { AutonomyManager, autonomyManager as defaultAutonomyManager } from './autonomyManager';
import { auditLogger as defaultAuditLogger } from './auditLogger';
import {
  ConfigurationManager,
  configurationManager as defaultConfigurationManager,
} from './configurationManager';
import { derivWS as defaultDerivWS } from './derivWS';
import { portfolioReconciler as defaultPortfolioReconciler, PortfolioReconciler } from './portfolioReconciler';
import { tradeReadinessGuard as defaultReadinessGuard, TradeReadinessGuard } from './readinessGuard';
import { TradeProposalQuote } from './riskEngine';
import { acde, toDerivDurationUnit } from './adaptiveDurationEngine';
import { sanitizeForPersistence } from './securitySanitizer';
import { balanceManager as defaultBalanceManager } from './balanceManager';
import { intelligenceManager as defaultIntelligenceManager } from './intelligenceManager';

export interface ExecutionBrokerAdapter {
  getConnectionState: () => ConnectionState;
  getAuthSession: () => {
    isAuthorized: boolean;
    loginid?: string;
    accountId?: string;
    currency?: string;
    expiresAt?: number;
    accountType?: 'demo' | 'real';
  };
  getSelectedAccountId: () => string | null;
  getBalanceSnapshot: () => BalanceSnapshot;
  areRequiredSubscriptionsActive: () => boolean;
  fetchContractsForSymbol?: (symbol: string, currency?: string) => Promise<boolean>;
  requestProposalQuote: (params: {
    symbol: string;
    amount: number;
    contract_type: 'CALL' | 'PUT';
    duration: number;
    duration_unit: DurationUnit;
    currency?: string;
  }) => Promise<TradeProposalQuote>;
  buyProposal: (
    proposalId: string,
    maxPrice: number,
    options?: {
      symbol?: string;
      contractType?: 'CALL' | 'PUT';
      duration?: number;
      durationUnit?: DurationUnit;
      currency?: string;
    }
  ) => Promise<{
    contract_id: string | number;
    buy_price: number;
    payout?: number;
    start_time?: number;
    longcode?: string;
  }>;
  sellContract: (
    contractId: string | number,
    minPrice?: number
  ) => Promise<{
    sold_for: number;
    transaction_id?: string | number;
  }>;
  subscribeOpenContract?: (contractId: string | number) => Promise<void>;
  reconcileBrokerState?: () => Promise<{
    openPortfolioContracts?: Array<any>;
    settledTransactions?: Array<any>;
  }>;
}

export interface ExecutionPortfolioContextProvider {
  getOpenTrades: () => TradeRecord[];
  getDailyLoss: () => number;
  getDrawdownPercent: () => number;
  getConsecutiveLosses: () => number;
  getDailyTradesCount: () => number;
}

export interface PredictionContextValidator {
  validatePredictionContext: (
    context: PredictionContext,
    expected: {
      symbol: string;
      granularity?: number;
      strategyVersion?: string;
      autonomyGeneration?: number;
      configRevision?: number;
      now?: number;
    }
  ) => { valid: boolean; reason?: string };
}

export interface SellExecutionRequest {
  source: 'MANUAL' | 'EARLY_SELLING';
  trade: TradeRecord;
  minPrice?: number;
  reason: string;
  policyTriggered?: string | null;
  now?: number;
}

export interface SellExecutionResult {
  sold: boolean;
  contractId: string | number;
  soldFor?: number;
  profit?: number;
  transactionId?: string | number;
  actualSaleTime?: number;
  actualHoldingMs?: number;
  reason: string;
  status: 'SOLD' | 'REJECTED' | 'IN_FLIGHT' | 'FAILED';
}

export interface ExecutionAuditEvent {
  id: string;
  timestamp: number;
  type: 'PURCHASE' | 'SELL';
  source: string;
  symbol: string;
  status: string;
  reason: string;
  contractId?: string | number;
  proposalId?: string;
  amount?: number;
}

function createDefaultBrokerAdapter(): ExecutionBrokerAdapter {
  return {
    getConnectionState: () => defaultDerivWS.getConnectionState(),
    getAuthSession: () => defaultDerivWS.getAuthSession(),
    getSelectedAccountId: () => defaultDerivWS.getSelectedAccountId(),
    getBalanceSnapshot: () => defaultBalanceManager.getSnapshot(),
    areRequiredSubscriptionsActive: () => defaultDerivWS.areRequiredSubscriptionsActive(),
    fetchContractsForSymbol: (symbol, currency) =>
      defaultDerivWS.fetchContractsForSymbol(symbol, currency),
    requestProposalQuote: (p) =>
      defaultDerivWS.requestProposalQuote({
        ...p,
        duration_unit: toDerivDurationUnit(p.duration_unit),
      }),
    buyProposal: async (proposalId, maxPrice) => {
      const res = await defaultDerivWS.buyProposal({
        proposalId,
        maxPrice,
        timeoutMs: 15_000,
      });
      return {
        contract_id: res.contractId,
        buy_price: res.buyPrice,
        payout: res.payout,
        start_time: res.startTime,
      };
    },
    sellContract: (contractId, price = 0) => defaultDerivWS.sellContractAsync(contractId, price),
    subscribeOpenContract: async (contractId) => {
      defaultDerivWS.subscribeProposalOpenContract(contractId);
    },
    reconcileBrokerState: async () => {
      const snap = await defaultDerivWS.requestReconciliationSnapshot();
      return {
        openPortfolioContracts: snap.openContracts,
        settledTransactions: snap.settledTransactions,
      };
    },
  };
}

export class ExecutionController {
  private broker: ExecutionBrokerAdapter;
  private autonomy: AutonomyManager;
  private configManager: ConfigurationManager;
  private readinessGuard: TradeReadinessGuard;
  private reconciler: PortfolioReconciler;
  private portfolioProvider: ExecutionPortfolioContextProvider;
  private predictionValidator?: PredictionContextValidator;
  private pendingSellContractIds: Set<string> = new Set();
  private executionInFlight = false;
  private eventLog: ExecutionAuditEvent[] = [];
  private listeners: Set<(events: ExecutionAuditEvent[]) => void> = new Set();

  constructor(deps?: {
    broker?: ExecutionBrokerAdapter;
    autonomy?: AutonomyManager;
    configManager?: ConfigurationManager;
    readinessGuard?: TradeReadinessGuard;
    reconciler?: PortfolioReconciler;
    portfolioProvider?: ExecutionPortfolioContextProvider;
    predictionValidator?: PredictionContextValidator;
  }) {
    this.broker = deps?.broker ?? createDefaultBrokerAdapter();
    this.autonomy = deps?.autonomy ?? defaultAutonomyManager;
    this.configManager = deps?.configManager ?? defaultConfigurationManager;
    this.readinessGuard = deps?.readinessGuard ?? defaultReadinessGuard;
    this.reconciler = deps?.reconciler ?? defaultPortfolioReconciler;
    this.portfolioProvider = deps?.portfolioProvider ?? {
      getOpenTrades: () => [],
      getDailyLoss: () => 0,
      getDrawdownPercent: () => 0,
      getConsecutiveLosses: () => 0,
      getDailyTradesCount: () => 0,
    };
    this.predictionValidator = deps?.predictionValidator ?? defaultIntelligenceManager;
  }

  public setPortfolioProvider(provider: ExecutionPortfolioContextProvider): void {
    this.portfolioProvider = provider;
  }

  public setPredictionValidator(validator: PredictionContextValidator): void {
    this.predictionValidator = validator;
  }

  public setBrokerAdapter(broker: ExecutionBrokerAdapter): void {
    this.broker = broker;
  }

  public getRecentEvents(): ExecutionAuditEvent[] {
    return [...this.eventLog];
  }

  public isPurchaseLocked(): boolean {
    return this.executionInFlight || this.reconciler.hasInFlightOrPendingIntent();
  }

  public isSellPending(contractId: string | number): boolean {
    return this.pendingSellContractIds.has(String(contractId));
  }

  public clearPendingSells(): void {
    this.pendingSellContractIds.clear();
  }

  public async executePurchase(request: ExecutionRequest): Promise<ExecutionResult> {
    const now = Date.now();
    const cfg = this.configManager.getSnapshot();

    // 1. Central Autonomy Authorization Check (skipped only for MANUAL)
    const authCheck = this.autonomy.authorizeExecution({
      source: request.source,
      requestGeneration: request.autonomyGeneration,
      operation: 'PURCHASE',
    });
    if (!authCheck.authorized) {
      const reason = authCheck.reason || `Execution source ${request.source} is unauthorized.`;
      this.recordEvent('PURCHASE', request.source, request.symbol, 'BLOCKED', reason, undefined, undefined, request.stake);
      return {
        executed: false,
        status: 'BLOCKED',
        blockers: [reason],
        reason,
        timestamp: now,
      };
    }

    // 2. Prediction freshness & market context check when autonomous/AI request attaches PredictionContext
    if (request.source !== 'MANUAL' && request.predictionContext && this.predictionValidator) {
      const predCheck = this.predictionValidator.validatePredictionContext(request.predictionContext, {
        symbol: request.symbol,
        strategyVersion: request.strategyVersion || cfg.activeStrategyVersion,
        autonomyGeneration: this.autonomy.getGeneration(),
        configRevision: cfg.revision,
        now,
      });
      if (!predCheck.valid) {
        const reason = predCheck.reason || 'AI prediction context is stale or mismatched.';
        this.recordEvent('PURCHASE', request.source, request.symbol, 'BLOCKED', reason, undefined, undefined, request.stake);
        return {
          executed: false,
          status: 'BLOCKED',
          blockers: [reason],
          reason,
          timestamp: now,
        };
      }
    }

    // 3. Single concurrent execution lock + daily trade cap check
    const dailyTradesCount = this.portfolioProvider.getDailyTradesCount();
    if (dailyTradesCount >= cfg.risk.maxDailyTrades) {
      const reason = `Daily trade ceiling reached (${dailyTradesCount}/${cfg.risk.maxDailyTrades}).`;
      this.recordEvent('PURCHASE', request.source, request.symbol, 'BLOCKED', reason, undefined, undefined, request.stake);
      return {
        executed: false,
        status: 'BLOCKED',
        blockers: [reason],
        reason,
        timestamp: now,
      };
    }

    if (this.executionInFlight) {
      const reason = 'Another purchase execution is already in flight; duplicate order prevented.';
      this.recordEvent('PURCHASE', request.source, request.symbol, 'BLOCKED', reason, undefined, undefined, request.stake);
      return {
        executed: false,
        status: 'BLOCKED',
        blockers: [reason],
        reason,
        timestamp: now,
      };
    }

    // 4. Authoritative ACDE duration validation & metadata check
    if (this.broker.fetchContractsForSymbol) {
      await this.broker.fetchContractsForSymbol(request.symbol).catch(() => false);
    }

    const effectiveGovernance = request.durationGovernanceMode
      ? { ...cfg.durationGovernance, mode: request.durationGovernanceMode }
      : cfg.durationGovernance;

    const attachedRecommendation =
      request.durationRecommendation ?? request.aiPrediction?.duration_recommendation ?? null;

    if (
      (request.source === 'GEMINI_AI' || request.source === 'LOCAL_AI') &&
      !attachedRecommendation
    ) {
      const reason =
        'AI-initiated trade rejected: structured DurationRecommendation with explicit unit and validUntil is required (bare numeric durations are never inferred as minutes).';
      this.recordEvent('PURCHASE', request.source, request.symbol, 'BLOCKED', reason, undefined, undefined, request.stake);
      return {
        executed: false,
        status: 'BLOCKED',
        blockers: [reason],
        reason,
        timestamp: now,
      };
    }

    const durationResolution = acde.resolveExecutionDuration({
      source: request.source,
      symbol: request.symbol,
      contractType: request.contractType,
      requestedDuration: request.duration,
      requestedUnit: request.durationUnit,
      governance: effectiveGovernance,
      recommendation: attachedRecommendation,
      strategyId: request.agent || request.source,
      now,
    });

    if (!durationResolution.approved) {
      const reason = durationResolution.rejectionReason || 'Contract duration rejected by ACDE governance.';
      this.recordEvent('PURCHASE', request.source, request.symbol, 'BLOCKED', reason, undefined, undefined, request.stake);
      return {
        executed: false,
        status: 'BLOCKED',
        blockers: [reason],
        reason,
        timestamp: now,
      };
    }

    const resolvedOrigDur = request.originalDuration ?? durationResolution.originalDuration;
    const resolvedOrigUnit = request.originalDurationUnit ?? durationResolution.originalUnit;
    const resolvedAdjustReason =
      [request.durationAdjustmentReason, durationResolution.adjustmentReason]
        .filter(Boolean)
        .join('; ') || undefined;

    const openTrades = this.portfolioProvider.getOpenTrades();
    const openExposure = openTrades.reduce((acc, t) => acc + (t.amount || 0), 0);
    const balanceSnapshot = this.broker.getBalanceSnapshot();
    const authSession = this.broker.getAuthSession();
    const selectedAccountId = this.broker.getSelectedAccountId();
    const connectionState = this.broker.getConnectionState();

    // 5. Register pending intent before touching broker
    const intentId = `intent_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const registration = this.reconciler.registerIntent({
      intentId,
      accountId: selectedAccountId || 'UNSELECTED',
      symbol: request.symbol,
      contractType: request.contractType,
      amount: request.stake,
      duration: durationResolution.duration,
      durationUnit: durationResolution.unit,
      now,
    });

    if (!registration.ok) {
      const reason = registration.reason || 'Duplicate or pending purchase intent active.';
      this.recordEvent('PURCHASE', request.source, request.symbol, 'BLOCKED', reason, undefined, undefined, request.stake);
      return {
        executed: false,
        status: 'BLOCKED',
        blockers: [reason],
        reason,
        timestamp: now,
      };
    }

    if (request.source !== 'MANUAL') {
      this.autonomy.registerAutonomousIntent(intentId);
    }

    this.executionInFlight = true;
    const preAuthGen = this.autonomy.getGeneration();

    try {
      // 6. Pre-proposal readiness guard (note duplicateIntentActive is evaluated excluding the intent we just registered)
      const tokenExpired =
        typeof authSession.expiresAt === 'number' &&
        authSession.expiresAt > 0 &&
        now >= authSession.expiresAt;

      const preReadiness = this.readinessGuard.evaluate({
        hasValidAuth: Boolean(authSession.isAuthorized),
        tokenExpired,
        selectedAccountId,
        confirmedAccountId: authSession.accountId || authSession.loginid || null,
        connectionState,
        isSessionAuthenticated: Boolean(authSession.isAuthorized),
        balanceSnapshot,
        requiredSubscriptionsActive: this.broker.areRequiredSubscriptionsActive(),
        hasUnresolvedPurchaseTimeout: this.reconciler.hasUnresolvedTimeout(),
        hasPendingReconciliation: this.reconciler.hasPendingReconciliation(),
        emergencyStopActive:
          request.source !== 'MANUAL' && this.autonomy.getLifecycle() !== 'ACTIVE',
        symbol: request.symbol,
        stake: request.stake,
        confidence: request.confidence ?? 0.65,
        sizingMode: request.source === 'MANUAL' ? 'FIXED' : cfg.risk.sizingMode,
        maxStakePercent: cfg.risk.maxStakePercent,
        minStake: cfg.risk.minStake,
        openExposure,
        maxOpenExposure: cfg.risk.maxOpenExposure,
        openContractsCount: openTrades.length,
        maxConcurrentContracts: cfg.risk.maxConcurrentContracts,
        dailyLoss: this.portfolioProvider.getDailyLoss(),
        maxDailyLoss: cfg.risk.maxDailyLoss,
        drawdownPercent: this.portfolioProvider.getDrawdownPercent(),
        maxDrawdownPercent: cfg.risk.maxSessionDrawdownPercent,
        consecutiveLosses: this.portfolioProvider.getConsecutiveLosses(),
        maxConsecutiveLosses: cfg.risk.maxConsecutiveLosses,
        duplicateIntentActive: false,
        now,
      });

      if (!preReadiness.ready) {
        this.reconciler.markIntentFailed(intentId);
        const reason = preReadiness.blockers.join(' | ');
        this.recordEvent('PURCHASE', request.source, request.symbol, 'BLOCKED', reason, undefined, undefined, request.stake);
        return {
          executed: false,
          status: 'BLOCKED',
          blockers: preReadiness.blockers,
          reason,
          timestamp: now,
        };
      }

      // 7. Request verified Deriv proposal quote
      const quote = await this.broker.requestProposalQuote({
        symbol: request.symbol,
        amount: request.stake,
        contract_type: request.contractType,
        duration: durationResolution.duration,
        duration_unit: durationResolution.unit,
        currency: balanceSnapshot.currency,
      });

      // Verify broker quote expiry consistency independently even on custom broker adapters
      const expiryCheck = acde.verifyBrokerProposalExpiry({
        symbol: request.symbol,
        requestedDuration: durationResolution.duration,
        requestedUnit: durationResolution.unit,
        dateStartMs: quote.dateStartMs,
        dateExpiryMs: quote.dateExpiryMs,
        spotTimeMs: quote.spotTimeMs,
        brokerQuoteExpiresAtMs: quote.brokerQuoteExpiresAtMs,
        fetchedAt: quote.fetchedAt,
        now: Date.now(),
        governance: effectiveGovernance,
      });
      if (quote.brokerDurationVerified === undefined) {
        // Enforce strict verification when quote provides dateExpiryMs, or tick-check when unit is ticks
        if (quote.dateExpiryMs !== undefined || durationResolution.unit === 'ticks') {
          quote.brokerDurationVerified = expiryCheck.verified;
          quote.brokerVerificationNote = expiryCheck.note;
        }
      }

      this.reconciler.attachProposalId(intentId, quote.proposalId);

      // 8. Re-check Stop/Cancellation right before sending final buy order!
      if (request.source !== 'MANUAL') {
        const recheckAuth = this.autonomy.authorizeExecution({
          source: request.source,
          requestGeneration: preAuthGen,
          operation: 'PURCHASE',
        });
        if (!recheckAuth.authorized || !this.autonomy.hasQueuedAutonomousIntent(intentId)) {
          this.reconciler.markIntentFailed(intentId);
          const reason = recheckAuth.reason || 'Autonomous execution was stopped while awaiting broker proposal.';
          this.recordEvent('PURCHASE', request.source, request.symbol, 'BLOCKED', reason, undefined, quote.proposalId, request.stake);
          return {
            executed: false,
            status: 'BLOCKED',
            blockers: [reason],
            reason,
            proposalId: quote.proposalId,
            timestamp: Date.now(),
          };
        }
      }

      // 9. Post-proposal readiness & quote integrity check
      const postNow = Date.now();
      const postReadiness = this.readinessGuard.evaluate({
        hasValidAuth: Boolean(authSession.isAuthorized),
        tokenExpired,
        selectedAccountId,
        confirmedAccountId: authSession.accountId || authSession.loginid || null,
        connectionState: this.broker.getConnectionState(),
        isSessionAuthenticated: Boolean(authSession.isAuthorized),
        balanceSnapshot: this.broker.getBalanceSnapshot(),
        requiredSubscriptionsActive: this.broker.areRequiredSubscriptionsActive(),
        hasUnresolvedPurchaseTimeout: this.reconciler.hasUnresolvedTimeout(),
        hasPendingReconciliation: this.reconciler.hasPendingReconciliation(),
        emergencyStopActive:
          request.source !== 'MANUAL' && this.autonomy.getLifecycle() !== 'ACTIVE',
        symbol: request.symbol,
        stake: request.stake,
        confidence: request.confidence ?? 0.65,
        sizingMode: request.source === 'MANUAL' ? 'FIXED' : cfg.risk.sizingMode,
        maxStakePercent: cfg.risk.maxStakePercent,
        minStake: cfg.risk.minStake,
        openExposure,
        maxOpenExposure: cfg.risk.maxOpenExposure,
        openContractsCount: openTrades.length,
        maxConcurrentContracts: cfg.risk.maxConcurrentContracts,
        dailyLoss: this.portfolioProvider.getDailyLoss(),
        maxDailyLoss: cfg.risk.maxDailyLoss,
        drawdownPercent: this.portfolioProvider.getDrawdownPercent(),
        maxDrawdownPercent: cfg.risk.maxSessionDrawdownPercent,
        consecutiveLosses: this.portfolioProvider.getConsecutiveLosses(),
        maxConsecutiveLosses: cfg.risk.maxConsecutiveLosses,
        duplicateIntentActive: false,
        proposal: quote,
        now: postNow,
      });

      if (!postReadiness.ready) {
        this.reconciler.markIntentFailed(intentId);
        const reason = postReadiness.blockers.join(' | ');
        this.recordEvent('PURCHASE', request.source, request.symbol, 'BLOCKED', reason, undefined, quote.proposalId, request.stake);
        return {
          executed: false,
          status: 'BLOCKED',
          blockers: postReadiness.blockers,
          reason,
          proposalId: quote.proposalId,
          timestamp: postNow,
        };
      }

      // 10. Execute Deriv Purchase against Proposal ID
      const maxPurchasePrice = Number(quote.askPrice.toFixed(2));
      const buyResult = await this.broker.buyProposal(quote.proposalId, maxPurchasePrice, {
        symbol: request.symbol,
        contractType: request.contractType,
        duration: durationResolution.duration,
        durationUnit: durationResolution.unit,
        currency: balanceSnapshot.currency,
      });

      this.reconciler.markIntentConfirmed(intentId, buyResult.contract_id);
      if (this.broker.subscribeOpenContract) {
        void this.broker.subscribeOpenContract(buyResult.contract_id).catch(() => {});
      }

      const mode: TradeRecord['mode'] =
        authSession.accountType === 'real' ? 'REAL' : 'DEMO';

      const brokerConfirmedStartMs =
        quote.dateStartMs ??
        (buyResult.start_time ? buyResult.start_time * 1000 : Date.now());
      const brokerConfirmedExpiryMs = quote.dateExpiryMs;

      const tradeRecord: TradeRecord = {
        id: String(buyResult.contract_id),
        contract_id: buyResult.contract_id,
        proposalId: quote.proposalId,
        timestamp: new Date().toISOString(),
        mode,
        symbol: request.symbol,
        amount: buyResult.buy_price ?? maxPurchasePrice,
        decision: request.contractType,
        result: 'PENDING',
        profit: 0,
        payout: buyResult.payout ?? quote.payout,
        confidence: request.confidence ?? 0.65,
        compositeSignal: request.compositeSignal,
        agent: request.agent || request.source,
        regime: request.regime || 'NEUTRAL',
        duration: durationResolution.duration,
        durationUnit: durationResolution.unit,
        requestedDuration: durationResolution.duration,
        requestedDurationUnit: durationResolution.unit,
        originalRequestedDuration: resolvedOrigDur,
        originalRequestedDurationUnit: resolvedOrigUnit,
        durationAdjustmentReason: resolvedAdjustReason,
        chartTimeframeSeconds: request.chartTimeframeSeconds,
        brokerConfirmedStartMs,
        brokerConfirmedExpiryMs,
        brokerDurationVerified: quote.brokerDurationVerified ?? expiryCheck.verified,
        brokerVerificationNote: quote.brokerVerificationNote ?? expiryCheck.note,
        durationRecommendation:
          durationResolution.validatedRecommendation ?? request.durationRecommendation ?? null,
        earlyExited: false,
        isSniperTrade: request.isSniperTrade,
        confluenceScore: request.confluenceScore,
        entryPrice: quote.spot ?? 0,
        dateStart: buyResult.start_time,
        dateExpiry: brokerConfirmedExpiryMs ? Math.round(brokerConfirmedExpiryMs / 1000) : undefined,
        isDerivRealTime: true,
        status: 'open',
        strategyVersion: request.strategyVersion || cfg.activeStrategyVersion,
        executionSource: request.source,
        trailingStopEnabled: request.trailingStopEnabled ?? cfg.trailingStop.enabled,
        takeProfitEnabled: request.takeProfitEnabled,
        takeProfitAmount: request.takeProfitAmount,
        targetPrice: request.targetPrice,
        stopPrice: request.stopPrice,
      };

      this.recordEvent(
        'PURCHASE',
        request.source,
        request.symbol,
        'EXECUTED',
        `Contract ${buyResult.contract_id} purchased at $${tradeRecord.amount.toFixed(2)}`,
        buyResult.contract_id,
        quote.proposalId,
        tradeRecord.amount
      );

      defaultAuditLogger.record({
        type: 'AUTONOMOUS_TRADE',
        symbol: request.symbol,
        action: `BUY_${request.contractType}_${request.source}`,
        reason: request.reasoning || `Authorized execution (${request.source}) at $${tradeRecord.amount.toFixed(2)}.`,
        agentConsensus: request.agent || request.source,
        consensusScore: Math.round((request.confidence ?? 0.65) * 100),
      });

      return {
        executed: true,
        status: 'EXECUTED',
        contractId: buyResult.contract_id,
        proposalId: quote.proposalId,
        buyPrice: tradeRecord.amount,
        payout: tradeRecord.payout,
        blockers: [],
        reason: `Executed ${request.contractType} contract #${buyResult.contract_id}.`,
        tradeRecord,
        timestamp: Date.now(),
      };
    } catch (err: any) {
      const msg = String(err?.message || err || 'Unknown purchase error');
      const isTimeoutOrAmbiguous =
        /timeout|timed out|socket|disconnect|ambiguous|network|no response/i.test(msg);

      if (isTimeoutOrAmbiguous) {
        this.reconciler.markIntentTimedOut(intentId);
        if (this.broker.reconcileBrokerState) {
          void this.broker
            .reconcileBrokerState()
            .then((brokerState) => {
              this.reconciler.reconcile({
                openTrades: this.portfolioProvider.getOpenTrades(),
                broker: {
                  openPortfolioContracts: brokerState.openPortfolioContracts,
                  settledTransactions: brokerState.settledTransactions,
                  portfolioChecked: true,
                  statementChecked: true,
                },
              });
            })
            .catch(() => {});
        }
        this.recordEvent(
          'PURCHASE',
          request.source,
          request.symbol,
          'RECONCILIATION_PENDING',
          `Purchase timeout entered broker reconciliation: ${msg}`,
          undefined,
          undefined,
          request.stake
        );
        return {
          executed: false,
          status: 'RECONCILIATION_PENDING',
          reconciliationPending: true,
          blockers: [`Purchase outcome uncertain (${msg}); broker reconciliation required.`],
          reason: `Purchase timed out — entered RECONCILIATION_PENDING to prevent duplicate order.`,
          timestamp: Date.now(),
        };
      }

      this.reconciler.markIntentFailed(intentId);
      this.recordEvent('PURCHASE', request.source, request.symbol, 'FAILED', msg, undefined, undefined, request.stake);
      return {
        executed: false,
        status: 'FAILED',
        blockers: [msg],
        reason: msg,
        timestamp: Date.now(),
      };
    } finally {
      this.autonomy.clearAutonomousIntent(intentId);
      this.executionInFlight = false;
    }
  }

  public async executeSell(request: SellExecutionRequest): Promise<SellExecutionResult> {
    const now = request.now ?? Date.now();
    const { trade } = request;
    const contractId = trade.contract_id;

    if (!contractId) {
      return {
        sold: false,
        contractId: trade.id,
        reason: 'Missing Deriv contract_id; cannot issue sell request.',
        status: 'REJECTED',
      };
    }

    if (trade.result !== 'PENDING') {
      return {
        sold: false,
        contractId,
        reason: `Contract #${contractId} is already settled (${trade.result}).`,
        status: 'REJECTED',
      };
    }

    if (typeof trade.dateExpiry === 'number' && trade.dateExpiry > 0 && now >= trade.dateExpiry * 1000) {
      return {
        sold: false,
        contractId,
        reason: `Contract #${contractId} has reached expiry; waiting for broker settlement.`,
        status: 'REJECTED',
      };
    }

    if (!trade.isValidToSell) {
      return {
        sold: false,
        contractId,
        reason: `Contract #${contractId} does not have Deriv is_valid_to_sell confirmation.`,
        status: 'REJECTED',
      };
    }

    const authCheck = this.autonomy.authorizeExecution({
      source: request.source,
      operation: 'SELL',
    });
    if (!authCheck.authorized) {
      return {
        sold: false,
        contractId,
        reason: authCheck.reason || 'Early sell unauthorized.',
        status: 'REJECTED',
      };
    }

    const lockKey = String(contractId);
    if (this.pendingSellContractIds.has(lockKey)) {
      return {
        sold: false,
        contractId,
        reason: `Sell request already in flight for contract #${contractId}.`,
        status: 'IN_FLIGHT',
      };
    }

    this.pendingSellContractIds.add(lockKey);
    try {
      const res = await this.broker.sellContract(contractId, request.minPrice ?? 0);
      const soldFor = Number(res.sold_for);
      const profit = Number((soldFor - (trade.amount || 0)).toFixed(2));
      const actualSaleTime = now;
      const startRef =
        trade.brokerConfirmedStartMs ??
        (trade.dateStart ? trade.dateStart * 1000 : Date.parse(trade.timestamp || '')) ??
        actualSaleTime;
      const actualHoldingMs = Math.max(0, actualSaleTime - (Number.isFinite(startRef) ? startRef : actualSaleTime));

      this.recordEvent(
        'SELL',
        request.source,
        trade.symbol,
        'SOLD',
        `${request.reason} (sold_for=$${soldFor.toFixed(2)}, P/L=${profit >= 0 ? '+' : ''}$${profit.toFixed(2)})`,
        contractId,
        undefined,
        soldFor
      );
      defaultAuditLogger.record({
        type: 'RISK_SHIELD',
        symbol: trade.symbol,
        action: `EARLY_SELL_${request.policyTriggered || request.source}`,
        reason: `${request.reason} → sold #$${soldFor.toFixed(2)} (Net ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}).`,
        pnlImpact: profit,
      });

      return {
        sold: true,
        contractId,
        soldFor,
        profit,
        transactionId: res.transaction_id,
        actualSaleTime,
        actualHoldingMs,
        reason: request.reason,
        status: 'SOLD',
      };
    } catch (err: any) {
      const msg = String(err?.message || err || 'Deriv sell error');
      this.recordEvent('SELL', request.source, trade.symbol, 'FAILED', msg, contractId);
      if (this.broker.reconcileBrokerState) {
        void this.broker
          .reconcileBrokerState()
          .then((brokerState) => {
            this.reconciler.reconcile({
              openTrades: this.portfolioProvider.getOpenTrades(),
              broker: {
                openPortfolioContracts: brokerState.openPortfolioContracts,
                settledTransactions: brokerState.settledTransactions,
                portfolioChecked: true,
                statementChecked: true,
              },
            });
          })
          .catch(() => {});
      }
      return {
        sold: false,
        contractId,
        reason: msg,
        status: 'FAILED',
      };
    } finally {
      this.pendingSellContractIds.delete(lockKey);
    }
  }

  private recordEvent(
    type: 'PURCHASE' | 'SELL',
    source: string,
    symbol: string,
    status: string,
    reason: string,
    contractId?: string | number,
    proposalId?: string,
    amount?: number
  ): void {
    const evt: ExecutionAuditEvent = sanitizeForPersistence({
      id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      type,
      source,
      symbol,
      status,
      reason,
      contractId,
      proposalId,
      amount,
    });
    this.eventLog.unshift(evt);
    if (this.eventLog.length > 100) {
      this.eventLog = this.eventLog.slice(0, 100);
    }
    for (const listener of this.listeners) {
      listener([...this.eventLog]);
    }
  }

  public subscribeEvents(listener: (events: ExecutionAuditEvent[]) => void): () => void {
    this.listeners.add(listener);
    listener([...this.eventLog]);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const executionController = new ExecutionController();
