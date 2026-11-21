import { ActionResult, ExecutionSource } from '../types/trading';

export type RegisteredActionName =
  | 'rotate_symbol'
  | 'change_timeframe'
  | 'adjust_stake_mode'
  | 'adjust_strategy'
  | 'tighten_stop'
  | 'request_market_analysis'
  | 'inspect_open_contracts'
  | 'request_early_selling_evaluation'
  | 'export_trading_journal'
  | 'propose_strategy_updates'
  | 'request_manual_trade_confirmation'
  | 'execute_authorized_trade';

export interface AIActionInvocation {
  action: RegisteredActionName | string;
  args?: Record<string, any>;
  source: ExecutionSource | 'COPILOT' | 'GEMINI_AI' | 'LOCAL_AI' | 'SUBAGENT_MD';
  requireConfirmationForTrades?: boolean;
}

export type AIActionHandler = (
  args: Record<string, any>,
  meta: { source: AIActionInvocation['source'] }
) => Promise<ActionResult> | ActionResult;

/**
 * Single typed AI Action Registry shared by AICopilotChat, SystemCopilotBottomSheet,
 * FullscreenWorkspace, Gemini tool calls, Local AI endpoints, and SBAgent.
 * Never claims success when a runtime handler is missing or unauthorized.
 */
export class AIActionRegistry {
  private handlers: Map<string, AIActionHandler> = new Map();

  public registerHandler(action: RegisteredActionName | string, handler: AIActionHandler): void {
    this.handlers.set(action, handler);
  }

  public registerHandlers(map: Partial<Record<RegisteredActionName, AIActionHandler>>): void {
    for (const [key, handler] of Object.entries(map)) {
      if (typeof handler === 'function') {
        this.handlers.set(key, handler);
      }
    }
  }

  public clearHandlers(): void {
    this.handlers.clear();
  }

  public hasHandler(action: string): boolean {
    return this.handlers.has(action);
  }

  public listRegisteredActions(): string[] {
    return Array.from(this.handlers.keys());
  }

  public async dispatch(invocation: AIActionInvocation): Promise<ActionResult> {
    const now = Date.now();
    const action = String(invocation.action || '').trim();
    if (!action) {
      return {
        status: 'REJECTED',
        action: 'UNKNOWN',
        message: 'Action name is required.',
        timestamp: now,
      };
    }

    const handler = this.handlers.get(action);
    if (!handler) {
      return {
        status: 'UNAVAILABLE',
        action,
        message: `Runtime handler for "${action}" is not registered in the current terminal context.`,
        timestamp: now,
      };
    }

    try {
      const result = await handler(invocation.args || {}, { source: invocation.source });
      if (!result || !result.status) {
        return {
          status: 'FAILED',
          action,
          message: `Handler for "${action}" returned an invalid ActionResult.`,
          timestamp: Date.now(),
        };
      }
      return {
        ...result,
        action,
        timestamp: result.timestamp || Date.now(),
      };
    } catch (err: any) {
      return {
        status: 'FAILED',
        action,
        message: err?.message || `Execution error while dispatching "${action}".`,
        timestamp: Date.now(),
      };
    }
  }
}

export const aiActionRegistry = new AIActionRegistry();
