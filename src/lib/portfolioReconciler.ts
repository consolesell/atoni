import { PendingPurchaseIntent, PortfolioPnLSummary, TradeRecord } from '../types/trading';

export interface ReconcileBrokerInput {
  openPortfolioContracts?: Array<{
    contract_id: number | string;
    symbol?: string;
    buy_price?: number;
    payout?: number;
    contract_type?: string;
    date_start?: number;
    expiry_time?: number;
  }>;
  settledTransactions?: Array<{
    contract_id?: number | string;
    transaction_id?: number | string;
    buy_price?: number;
    sell_price?: number;
    payout?: number;
    amount?: number;
    action?: string;
    action_type?: string;
    shortcode?: string;
    transaction_time?: number;
    balance_after?: number;
  }>;
  portfolioChecked?: boolean;
  statementChecked?: boolean;
}

export class PortfolioReconciler {
  private pendingIntents: Map<string, PendingPurchaseIntent> = new Map();
  private unresolvedTimeoutIds: Set<string> = new Set();

  public buildClientOrderKey(params: {
    accountId: string;
    symbol: string;
    contractType: 'CALL' | 'PUT';
    amount: number;
    duration: number;
    durationUnit: 'ticks' | 'seconds' | 'minutes';
  }): string {
    return `${params.accountId}:${params.symbol}:${params.contractType}:${params.amount.toFixed(2)}:${params.duration}${params.durationUnit}`;
  }

  public hasInFlightOrPendingIntent(clientOrderKey?: string): boolean {
    for (const intent of this.pendingIntents.values()) {
      if (intent.status === 'RECONCILIATION_PENDING') return true;
      if (
        intent.status === 'SUBMITTED' &&
        (!clientOrderKey || intent.clientOrderKey === clientOrderKey)
      ) {
        return true;
      }
    }
    return this.unresolvedTimeoutIds.size > 0;
  }

  public hasUnresolvedTimeout(): boolean {
    return this.unresolvedTimeoutIds.size > 0;
  }

  public hasPendingReconciliation(): boolean {
    if (this.unresolvedTimeoutIds.size > 0) return true;
    for (const intent of this.pendingIntents.values()) {
      if (intent.status === 'RECONCILIATION_PENDING') return true;
    }
    return false;
  }

  public getPendingIntents(): PendingPurchaseIntent[] {
    return Array.from(this.pendingIntents.values());
  }

  public registerIntent(params: {
    intentId: string;
    accountId: string;
    symbol: string;
    contractType: 'CALL' | 'PUT';
    amount: number;
    duration: number;
    durationUnit: 'ticks' | 'seconds' | 'minutes';
    proposalId?: string;
    now?: number;
  }): { ok: boolean; intent?: PendingPurchaseIntent; reason?: string } {
    const clientOrderKey = this.buildClientOrderKey(params);
    if (this.hasInFlightOrPendingIntent(clientOrderKey)) {
      return {
        ok: false,
        reason: `Duplicate or unresolved purchase intent active for ${params.symbol} (${params.contractType} $${params.amount.toFixed(2)}).`,
      };
    }

    const intent: PendingPurchaseIntent = {
      intentId: params.intentId,
      clientOrderKey,
      symbol: params.symbol,
      contractType: params.contractType,
      amount: params.amount,
      duration: params.duration,
      durationUnit: params.durationUnit,
      accountId: params.accountId,
      status: 'SUBMITTED',
      createdAt: params.now ?? Date.now(),
      proposalId: params.proposalId,
    };
    this.pendingIntents.set(params.intentId, intent);
    return { ok: true, intent };
  }

  public attachProposalId(intentId: string, proposalId: string): void {
    const existing = this.pendingIntents.get(intentId);
    if (existing) {
      existing.proposalId = proposalId;
    }
  }

  public markIntentConfirmed(intentId: string, contractId: string | number): void {
    this.unresolvedTimeoutIds.delete(intentId);
    const existing = this.pendingIntents.get(intentId);
    if (existing) {
      existing.status = 'CONFIRMED';
      existing.contractId = contractId;
      this.pendingIntents.delete(intentId);
    }
  }

  public markIntentFailed(intentId: string): void {
    this.unresolvedTimeoutIds.delete(intentId);
    const existing = this.pendingIntents.get(intentId);
    if (existing) {
      existing.status = 'FAILED';
      this.pendingIntents.delete(intentId);
    }
  }

  /**
   * Purchase timeouts MUST enter RECONCILIATION_PENDING — never allow immediate blind retry.
   */
  public markIntentTimedOut(intentId: string): void {
    this.unresolvedTimeoutIds.add(intentId);
    const existing = this.pendingIntents.get(intentId);
    if (existing) {
      existing.status = 'RECONCILIATION_PENDING';
    }
  }

  /**
   * Reconciles local open trades and timed-out intents against authoritative broker portfolio & settlement records.
   */
  public reconcile(params: {
    openTrades: TradeRecord[];
    broker: ReconcileBrokerInput;
  }): {
    matchedOpenContractIds: Array<string | number>;
    newlySettledContractIds: Array<string | number>;
    resolvedTimeoutIntents: string[];
    updatedOpenTrades: TradeRecord[];
    stillPendingReconciliation: boolean;
  } {
    const brokerOpen = params.broker.openPortfolioContracts || [];
    const brokerSettled = params.broker.settledTransactions || [];
    const portfolioChecked = params.broker.portfolioChecked !== false;
    const statementChecked = params.broker.statementChecked !== false;

    const openIds = new Set(brokerOpen.map((c) => String(c.contract_id)));
    const settledMap = new Map<string, NonNullable<ReconcileBrokerInput['settledTransactions']>[number]>();
    for (const tx of brokerSettled) {
      if (tx.contract_id !== undefined && tx.contract_id !== null) {
        settledMap.set(String(tx.contract_id), tx);
      }
    }

    const resolvedTimeoutIntents: string[] = [];
    const matchedOpenContractIds: Array<string | number> = [];
    const newlySettledContractIds: Array<string | number> = [];

    // Resolve any pending/timed-out intents against broker open contracts or account statement transactions
    for (const [intentId, intent] of this.pendingIntents.entries()) {
      if (intent.contractId && openIds.has(String(intent.contractId))) {
        matchedOpenContractIds.push(intent.contractId);
        this.pendingIntents.delete(intentId);
        this.unresolvedTimeoutIds.delete(intentId);
        resolvedTimeoutIntents.push(intentId);
        continue;
      }

      if (intent.contractId && settledMap.has(String(intent.contractId))) {
        newlySettledContractIds.push(intent.contractId);
        this.pendingIntents.delete(intentId);
        this.unresolvedTimeoutIds.delete(intentId);
        resolvedTimeoutIntents.push(intentId);
        continue;
      }

      // If no contractId was returned before timeout, match against newly discovered open portfolio contract
      const matchedPortfolio = brokerOpen.find(
        (c) =>
          (!c.symbol || c.symbol === intent.symbol) &&
          (typeof c.buy_price !== 'number' || Math.abs(c.buy_price - intent.amount) < 0.05) &&
          (!c.date_start || c.date_start * 1000 >= intent.createdAt - 120_000)
      );

      if (matchedPortfolio) {
        matchedOpenContractIds.push(matchedPortfolio.contract_id);
        this.pendingIntents.delete(intentId);
        this.unresolvedTimeoutIds.delete(intentId);
        resolvedTimeoutIntents.push(intentId);
        continue;
      }

      // Match against account statement transactions (e.g. fast contract that already settled during timeout)
      const matchedStatementTx = brokerSettled.find((tx) => {
        if (tx.contract_id === undefined || tx.contract_id === null) return false;
        const action = String(tx.action_type || tx.action || '').toLowerCase();
        if (action && action !== 'buy' && action !== 'sell') return false;
        const txAmount =
          typeof tx.buy_price === 'number'
            ? tx.buy_price
            : typeof tx.amount === 'number'
            ? Math.abs(tx.amount)
            : null;
        const amountMatch = txAmount === null || Math.abs(txAmount - intent.amount) < 0.05;
        const symbolMatch = !tx.shortcode || tx.shortcode.includes(intent.symbol);
        const timeMatch = !tx.transaction_time || tx.transaction_time * 1000 >= intent.createdAt - 120_000;
        return amountMatch && symbolMatch && timeMatch;
      });

      if (matchedStatementTx && matchedStatementTx.contract_id !== undefined) {
        newlySettledContractIds.push(matchedStatementTx.contract_id);
        this.pendingIntents.delete(intentId);
        this.unresolvedTimeoutIds.delete(intentId);
        resolvedTimeoutIntents.push(intentId);
      } else if (intent.status === 'RECONCILIATION_PENDING' && portfolioChecked && statementChecked) {
        // Broker portfolio AND account statement both verified clean with no matching contract: timeout did not fill
        this.pendingIntents.delete(intentId);
        this.unresolvedTimeoutIds.delete(intentId);
        resolvedTimeoutIntents.push(intentId);
      }
    }

    // Only clear orphan timeout flags when no pending reconciliations remain and statement/portfolio checks succeeded
    if (this.pendingIntents.size === 0 && portfolioChecked && statementChecked) {
      this.unresolvedTimeoutIds.clear();
    }

    const updatedOpenTrades = params.openTrades.map((trade) => {
      if (trade.contract_id && openIds.has(String(trade.contract_id))) {
        matchedOpenContractIds.push(trade.contract_id);
        return {
          ...trade,
          isDerivRealTime: true,
        };
      }
      return trade;
    });

    return {
      matchedOpenContractIds: Array.from(new Set(matchedOpenContractIds)),
      newlySettledContractIds: Array.from(new Set(newlySettledContractIds)),
      resolvedTimeoutIntents,
      updatedOpenTrades,
      stillPendingReconciliation: this.hasPendingReconciliation(),
    };
  }

  /**
   * Computes strictly separated P&L buckets:
   * - realizedPnL: confirmed broker settlements only (WIN/LOSS/SOLD)
   * - liveDerivPnL: live proposal_open_contract P/L only
   * - estimatedPnL: always isolated (never merged into realized or live Deriv P/L)
   */
  public computePnLSummary(
    openTrades: TradeRecord[],
    closedTrades: TradeRecord[]
  ): PortfolioPnLSummary {
    const realizedPnL = Number(
      closedTrades
        .filter((t) => t.result === 'WIN' || t.result === 'LOSS' || t.result === 'SOLD')
        .reduce((acc, t) => acc + (Number.isFinite(t.profit) ? t.profit : 0), 0)
        .toFixed(2)
    );

    const liveDerivPnL = Number(
      openTrades
        .filter((t) => t.isDerivRealTime && typeof t.profit === 'number')
        .reduce((acc, t) => acc + (t.profit || 0), 0)
        .toFixed(2)
    );

    return {
      realizedPnL,
      liveDerivPnL,
      estimatedPnL: 0,
      openContractsCount: openTrades.length,
      pendingReconciliationCount: this.hasPendingReconciliation()
        ? Math.max(1, this.pendingIntents.size, this.unresolvedTimeoutIds.size)
        : 0,
    };
  }

  public reset(): void {
    this.pendingIntents.clear();
    this.unresolvedTimeoutIds.clear();
  }
}

export const portfolioReconciler = new PortfolioReconciler();
