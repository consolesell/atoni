import { MemoryCategory, MemoryRecord, MemoryTrustSource } from '../types/trading';
import { sanitizeForPersistence } from './securitySanitizer';

const STORAGE_KEY = 'sbatomic_memory_v1';
const MAX_MEMORY_RECORDS = 150;

export interface UpsertMemoryInput {
  category: MemoryCategory;
  trustSource: MemoryTrustSource;
  key: string;
  title: string;
  summary: string;
  symbol?: string;
  strategyVersion?: string;
  regime?: string;
  tags?: string[];
  relevanceScore?: number;
  ttlMs?: number;
  metadata?: Record<string, any>;
}

const TRUST_PRIORITY: Record<MemoryTrustSource, number> = {
  VERIFIED_FACT: 5,
  USER_DECISION: 4,
  RECOMMENDATION: 3,
  AI_OBSERVATION: 2,
  HYPOTHESIS: 1,
};

export class MemoryManager {
  private records: MemoryRecord[] = [];
  private storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  private listeners: Set<(records: MemoryRecord[]) => void> = new Set();

  constructor(storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    this.storage =
      storage ??
      (typeof window !== 'undefined' && window.localStorage ? window.localStorage : null);
    this.records = this.load();
  }

  private load(): MemoryRecord[] {
    if (!this.storage) return [];
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      const sanitized = sanitizeForPersistence(this.records);
      this.storage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    } catch {
      // Ignore quota errors
    }
  }

  /**
   * Inserts or updates a memory record while enforcing trust hierarchy:
   * Unverified AI observations or hypotheses CANNOT overwrite VERIFIED_FACT or USER_DECISION records sharing the same key.
   */
  public upsert(input: UpsertMemoryInput): { stored: boolean; record: MemoryRecord; reason?: string } {
    const now = Date.now();
    const safeMetadata = input.metadata ? sanitizeForPersistence(input.metadata) : undefined;
    const safeTitle = sanitizeForPersistence(input.title);
    const safeSummary = sanitizeForPersistence(input.summary);
    const verified = input.trustSource === 'VERIFIED_FACT' || input.trustSource === 'USER_DECISION';

    const existingIdx = this.records.findIndex(
      (r) => r.category === input.category && r.key === input.key
    );

    if (existingIdx !== -1) {
      const existing = this.records[existingIdx];
      if (TRUST_PRIORITY[input.trustSource] < TRUST_PRIORITY[existing.trustSource]) {
        return {
          stored: false,
          record: existing,
          reason: `Trust boundary prevented ${input.trustSource} from overwriting ${existing.trustSource} (${existing.key}).`,
        };
      }

      const updated: MemoryRecord = {
        ...existing,
        trustSource: input.trustSource,
        verified,
        title: safeTitle,
        summary: safeSummary,
        symbol: input.symbol ?? existing.symbol,
        strategyVersion: input.strategyVersion ?? existing.strategyVersion,
        regime: input.regime ?? existing.regime,
        tags: Array.from(new Set([...(existing.tags || []), ...(input.tags || [])])),
        relevanceScore: Math.max(0, Math.min(100, input.relevanceScore ?? existing.relevanceScore)),
        updatedAt: now,
        expiresAt: input.ttlMs ? now + input.ttlMs : existing.expiresAt,
        version: existing.version + 1,
        metadata: safeMetadata ?? existing.metadata,
      };
      this.records[existingIdx] = updated;
      this.pruneAndSave(now);
      this.notify();
      return { stored: true, record: updated };
    }

    const record: MemoryRecord = {
      id: `mem_${now}_${Math.random().toString(36).slice(2, 7)}`,
      category: input.category,
      trustSource: input.trustSource,
      verified,
      key: input.key,
      title: safeTitle,
      summary: safeSummary,
      symbol: input.symbol,
      strategyVersion: input.strategyVersion,
      regime: input.regime,
      tags: input.tags || [],
      relevanceScore: Math.max(0, Math.min(100, input.relevanceScore ?? (verified ? 85 : 55))),
      createdAt: now,
      updatedAt: now,
      expiresAt: input.ttlMs ? now + input.ttlMs : undefined,
      version: 1,
      metadata: safeMetadata,
    };

    this.records.unshift(record);
    this.pruneAndSave(now);
    this.notify();
    return { stored: true, record };
  }

  public pruneAndSave(now = Date.now()): void {
    this.records = this.records.filter((r) => !r.expiresAt || r.expiresAt > now);
    if (this.records.length > MAX_MEMORY_RECORDS) {
      // Preserve verified records and highest-relevance recent records
      this.records.sort((a, b) => {
        const trustDiff = TRUST_PRIORITY[b.trustSource] - TRUST_PRIORITY[a.trustSource];
        if (trustDiff !== 0) return trustDiff;
        const scoreDiff = b.relevanceScore - a.relevanceScore;
        if (scoreDiff !== 0) return scoreDiff;
        return b.updatedAt - a.updatedAt;
      });
      this.records = this.records.slice(0, MAX_MEMORY_RECORDS);
    }
    this.persist();
  }

  public getAll(category?: MemoryCategory): MemoryRecord[] {
    const now = Date.now();
    return this.records.filter(
      (r) => (!r.expiresAt || r.expiresAt > now) && (!category || r.category === category)
    );
  }

  /**
   * Retrieves top relevant records for AI prompt grounding without bloating token budgets.
   */
  public selectCompactContext(params: {
    symbol?: string;
    strategyVersion?: string;
    regime?: string;
    maxItems?: number;
  }): Array<{
    category: MemoryCategory;
    trust: MemoryTrustSource;
    title: string;
    summary: string;
  }> {
    const now = Date.now();
    const active = this.records.filter((r) => !r.expiresAt || r.expiresAt > now);
    const scored = active.map((r) => {
      let score = r.relevanceScore + TRUST_PRIORITY[r.trustSource] * 10;
      if (params.symbol && r.symbol === params.symbol) score += 35;
      if (params.strategyVersion && r.strategyVersion === params.strategyVersion) score += 20;
      if (params.regime && r.regime === params.regime) score += 15;
      const ageHours = Math.max(0, (now - r.updatedAt) / 3_600_000);
      score -= Math.min(30, ageHours * 1.5);
      return { record: r, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, params.maxItems ?? 6).map(({ record }) => ({
      category: record.category,
      trust: record.trustSource,
      title: record.title,
      summary: record.summary,
    }));
  }

  public clearUnverified(): void {
    this.records = this.records.filter((r) => r.verified);
    this.persist();
    this.notify();
  }

  public subscribe(listener: (records: MemoryRecord[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getAll());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = this.getAll();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export const memoryManager = new MemoryManager();
