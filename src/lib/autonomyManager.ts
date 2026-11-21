import {
  AutonomyLifecycleState,
  AutonomyPermissions,
  ExecutionModeSetting,
  ExecutionSource,
} from '../types/trading';
import { auditLogger } from './auditLogger';
import { SBAgent } from './sbagentAutonomyEngine';
import { AutonomySessionContext } from '../types/autonomy';

export interface AutonomyRuntimeSnapshot {
  lifecycle: AutonomyLifecycleState;
  executionMode: ExecutionModeSetting;
  permissions: AutonomyPermissions;
  generation: number;
  activeAsyncCount: number;
  lastTransitionReason: string;
  lastUpdatedAt: number;
  errorReason?: string | null;
}

const DEFAULT_PERMISSIONS: AutonomyPermissions = {
  allowAutoBot: false,
  allowSubagent: false,
  allowAiTriggers: false,
  allowEarlySelling: true, // Monitoring/early exit stays enabled for open contracts
  allowSymbolRotation: false,
};

export class AutonomyManager {
  private lifecycle: AutonomyLifecycleState = 'OFF';
  private executionMode: ExecutionModeSetting = 'SUPERVISED_AUTO';
  private permissions: AutonomyPermissions = { ...DEFAULT_PERMISSIONS };
  private generation = 1;
  private activeControllers: Map<string, AbortController> = new Map();
  private scheduledTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  private queuedAutonomousIntentIds: Set<string> = new Set();
  private lastTransitionReason = 'Initialized';
  private errorReason: string | null = null;
  private lastUpdatedAt = Date.now();
  private listeners: Set<(snapshot: AutonomyRuntimeSnapshot) => void> = new Set();

  public getSnapshot(): AutonomyRuntimeSnapshot {
    return {
      lifecycle: this.lifecycle,
      executionMode: this.executionMode,
      permissions: { ...this.permissions },
      generation: this.generation,
      activeAsyncCount: this.activeControllers.size,
      lastTransitionReason: this.lastTransitionReason,
      lastUpdatedAt: this.lastUpdatedAt,
      errorReason: this.errorReason,
    };
  }

  public getGeneration(): number {
    return this.generation;
  }

  public getLifecycle(): AutonomyLifecycleState {
    return this.lifecycle;
  }

  public getExecutionMode(): ExecutionModeSetting {
    return this.executionMode;
  }

  public setExecutionMode(mode: ExecutionModeSetting, reason = 'user_mode_change'): void {
    this.executionMode = mode;
    if (mode === 'MANUAL_ONLY' && (this.lifecycle === 'ACTIVE' || this.lifecycle === 'STARTING')) {
      this.stopAll(`execution_mode_manual_only:${reason}`);
      return;
    }
    this.lastTransitionReason = reason;
    this.lastUpdatedAt = Date.now();
    this.notify();
  }

  public updatePermissions(partial: Partial<AutonomyPermissions>, reason = 'permissions_updated'): void {
    this.permissions = {
      ...this.permissions,
      ...partial,
    };
    this.lastTransitionReason = reason;
    this.lastUpdatedAt = Date.now();
    this.notify();
  }

  /**
   * Starts autonomous execution and grants SBAgent permissions when enabled.
   */
  public start(params: {
    permissions?: Partial<AutonomyPermissions>;
    sbagentContext?: AutonomySessionContext;
    reason?: string;
  }): { ok: boolean; generation: number; reason: string } {
    if (this.executionMode === 'MANUAL_ONLY') {
      this.lastTransitionReason = 'Blocked: executionMode is MANUAL_ONLY';
      this.lastUpdatedAt = Date.now();
      this.notify();
      return {
        ok: false,
        generation: this.generation,
        reason: 'Autonomous execution cannot start while executionMode is MANUAL_ONLY.',
      };
    }

    this.lifecycle = 'STARTING';
    this.errorReason = null;
    this.generation += 1;
    this.lastTransitionReason = params.reason || 'user_start';
    this.lastUpdatedAt = Date.now();
    this.notify();

    this.permissions = {
      ...DEFAULT_PERMISSIONS,
      allowAutoBot: params.permissions?.allowAutoBot ?? true,
      allowSubagent: params.permissions?.allowSubagent ?? false,
      allowAiTriggers: params.permissions?.allowAiTriggers ?? true,
      allowEarlySelling: params.permissions?.allowEarlySelling ?? true,
      allowSymbolRotation: params.permissions?.allowSymbolRotation ?? true,
    };

    if (this.permissions.allowSubagent && params.sbagentContext) {
      SBAgent.onAutonomyGranted(params.sbagentContext);
    }

    this.lifecycle = 'ACTIVE';
    this.lastUpdatedAt = Date.now();
    auditLogger.record({
      type: 'RISK_SHIELD',
      symbol: params.sbagentContext?.symbol || 'SYSTEM',
      action: 'AUTONOMY_STARTED',
      reason: `Autonomy ACTIVE (gen=${this.generation}, mode=${this.executionMode}, bot=${this.permissions.allowAutoBot}, subagent=${this.permissions.allowSubagent}).`,
      agentConsensus: 'AUTHORITY_GRANTED',
    });
    this.notify();
    return {
      ok: true,
      generation: this.generation,
      reason: 'Autonomy started cleanly.',
    };
  }

  public pause(reason = 'user_pause'): void {
    if (this.lifecycle === 'OFF') return;
    this.generation += 1;
    this.abortAllPendingAsync(`paused:${reason}`);
    this.queuedAutonomousIntentIds.clear();
    this.lifecycle = 'PAUSED';
    this.permissions.allowAutoBot = false;
    this.permissions.allowSubagent = false;
    this.permissions.allowAiTriggers = false;
    // Note: allowEarlySelling stays true so existing open contracts remain protected.
    SBAgent.onAutonomyRevoked(`paused:${reason}`);
    this.lastTransitionReason = reason;
    this.lastUpdatedAt = Date.now();
    this.notify();
  }

  public setError(reason: string): void {
    this.generation += 1;
    this.abortAllPendingAsync(`error:${reason}`);
    this.queuedAutonomousIntentIds.clear();
    this.lifecycle = 'ERROR';
    this.errorReason = reason;
    this.permissions.allowAutoBot = false;
    this.permissions.allowSubagent = false;
    this.permissions.allowAiTriggers = false;
    SBAgent.onAutonomyRevoked(`error:${reason}`);
    this.lastTransitionReason = reason;
    this.lastUpdatedAt = Date.now();
    this.notify();
  }

  /**
   * Authoritative global Stop control:
   * - Transitions through STOPPING -> OFF
   * - Disables every autonomous purchase source
   * - Revokes SBAgent grant
   * - Increments generation token so delayed AI/Subagent callbacks are ignored
   * - Aborts all in-flight AbortControllers and clears scheduled cycles
   * - Preserves open-contract monitoring & early-selling protection capability
   */
  public stopAll(reason = 'global_stop'): { previousGeneration: number; nextGeneration: number; abortedCount: number } {
    const previousGeneration = this.generation;
    this.lifecycle = 'STOPPING';
    this.generation += 1;

    const abortedCount = this.abortAllPendingAsync(reason);
    for (const timer of this.scheduledTimers) {
      clearTimeout(timer);
    }
    this.scheduledTimers.clear();
    this.queuedAutonomousIntentIds.clear();

    this.permissions = {
      allowAutoBot: false,
      allowSubagent: false,
      allowAiTriggers: false,
      allowEarlySelling: this.permissions.allowEarlySelling,
      allowSymbolRotation: false,
    };

    SBAgent.onAutonomyRevoked(reason);

    this.lifecycle = 'OFF';
    this.errorReason = null;
    this.lastTransitionReason = reason;
    this.lastUpdatedAt = Date.now();

    auditLogger.record({
      type: 'CIRCUIT_BREAKER',
      symbol: 'SYSTEM',
      action: 'GLOBAL_STOP_EXECUTED',
      reason: `Global Stop terminated all autonomous loops (${abortedCount} in-flight requests aborted, gen ${previousGeneration} -> ${this.generation}). Open-contract monitoring preserved.`,
      agentConsensus: 'HARD_STOP',
      consensusScore: 100,
    });

    this.notify();
    return {
      previousGeneration,
      nextGeneration: this.generation,
      abortedCount,
    };
  }

  public registerAbortController(id: string): { controller: AbortController; generation: number } {
    const existing = this.activeControllers.get(id);
    if (existing) {
      existing.abort('superseded');
    }
    const controller = new AbortController();
    this.activeControllers.set(id, controller);
    return { controller, generation: this.generation };
  }

  public releaseAbortController(id: string): void {
    this.activeControllers.delete(id);
  }

  public scheduleTrackedTimeout(fn: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    const captureGen = this.generation;
    const timer = setTimeout(() => {
      this.scheduledTimers.delete(timer);
      if (this.generation !== captureGen) return;
      fn();
    }, delayMs);
    this.scheduledTimers.add(timer);
    return timer;
  }

  public registerAutonomousIntent(intentId: string): void {
    this.queuedAutonomousIntentIds.add(intentId);
  }

  public clearAutonomousIntent(intentId: string): void {
    this.queuedAutonomousIntentIds.delete(intentId);
  }

  public hasQueuedAutonomousIntent(intentId: string): boolean {
    return this.queuedAutonomousIntentIds.has(intentId);
  }

  private abortAllPendingAsync(reason: string): number {
    let count = 0;
    for (const [id, ctrl] of this.activeControllers.entries()) {
      if (!ctrl.signal.aborted) {
        ctrl.abort(reason);
        count += 1;
      }
      this.activeControllers.delete(id);
    }
    return count;
  }

  /**
   * Checks whether a given ExecutionSource is currently authorized to open or close a position.
   */
  public authorizeExecution(params: {
    source: ExecutionSource;
    requestGeneration?: number;
    operation: 'PURCHASE' | 'SELL';
  }): { authorized: boolean; reason?: string } {
    if (params.source === 'MANUAL') {
      return { authorized: true };
    }

    if (params.operation === 'SELL' && params.source === 'EARLY_SELLING') {
      if (!this.permissions.allowEarlySelling) {
        return {
          authorized: false,
          reason: 'Early-selling permission is currently disabled.',
        };
      }
      return { authorized: true };
    }

    if (
      typeof params.requestGeneration === 'number' &&
      params.requestGeneration !== this.generation
    ) {
      return {
        authorized: false,
        reason: `Stale autonomous generation (${params.requestGeneration} != current ${this.generation}); execution cancelled.`,
      };
    }

    if (this.executionMode === 'MANUAL_ONLY') {
      return {
        authorized: false,
        reason: `Autonomous source ${params.source} blocked: execution mode is MANUAL_ONLY.`,
      };
    }

    if (this.lifecycle !== 'ACTIVE') {
      return {
        authorized: false,
        reason: `Autonomous source ${params.source} blocked: lifecycle is ${this.lifecycle}.`,
      };
    }

    if (params.source === 'AUTO_BOT' && !this.permissions.allowAutoBot) {
      return { authorized: false, reason: 'Auto-Bot permission disabled.' };
    }
    if (params.source === 'SUBAGENT_MD' && !this.permissions.allowSubagent) {
      return { authorized: false, reason: 'SBAgent permission disabled.' };
    }
    if (
      (params.source === 'GEMINI_AI' ||
        params.source === 'LOCAL_AI' ||
        params.source === 'COPILOT') &&
      !this.permissions.allowAiTriggers
    ) {
      return { authorized: false, reason: `AI trigger permission disabled for ${params.source}.` };
    }
    if (params.source === 'STRATEGY_AUTOMATION' && !this.permissions.allowAutoBot && !this.permissions.allowSubagent) {
      return { authorized: false, reason: 'Strategy automation permission disabled.' };
    }

    return { authorized: true };
  }

  public isGenerationCurrent(gen: number): boolean {
    return gen === this.generation;
  }

  public subscribe(listener: (snapshot: AutonomyRuntimeSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }
}

export const autonomyManager = new AutonomyManager();
