import { SyncStatus } from '../types/trading';
import { db, doc, getDoc, handleFirestoreError, OperationType, setDoc } from './firebase';
import { containsSecretFields, sanitizeForPersistence } from './securitySanitizer';

export type SyncEntityCollection =
  | 'sessions'
  | 'tradingHistory'
  | 'strategyVersions'
  | 'agentMemory'
  | 'agentTasks'
  | 'executionEvents'
  | 'settings';

export interface SyncQueueItem {
  id: string;
  uid: string;
  collectionName: SyncEntityCollection;
  docId: string;
  data: Record<string, any>;
  version: number;
  updatedAt: number;
  retryCount: number;
  nextRetryAt: number;
  lastError?: string;
}

export interface FirebaseSyncStatusSnapshot {
  status: SyncStatus;
  pendingCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  isOnline: boolean;
}

export interface FirestoreSyncTransport {
  readDoc: (pathSegments: string[]) => Promise<Record<string, any> | null>;
  writeDoc: (pathSegments: string[], data: Record<string, any>) => Promise<void>;
}

const SYNC_QUEUE_STORAGE_KEY = 'sbatomic_firebase_sync_queue_v1';
const MAX_RETRY_ATTEMPTS = 6;

function createDefaultFirestoreTransport(): FirestoreSyncTransport {
  return {
    readDoc: async (pathSegments) => {
      const ref = doc(db, pathSegments[0], ...pathSegments.slice(1));
      try {
        const snap = await getDoc(ref);
        return snap.exists() ? (snap.data() as Record<string, any>) : null;
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, pathSegments.join('/'));
        return null;
      }
    },
    writeDoc: async (pathSegments, data) => {
      const ref = doc(db, pathSegments[0], ...pathSegments.slice(1));
      try {
        await setDoc(ref, data, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, pathSegments.join('/'));
      }
    },
  };
}

export class FirebaseSyncManager {
  private queue: SyncQueueItem[] = [];
  private status: SyncStatus = 'LOCAL_ONLY';
  private lastSyncedAt: number | null = null;
  private lastError: string | null = null;
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isFlushing = false;
  private transport: FirestoreSyncTransport;
  private storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  private listeners: Set<(snap: FirebaseSyncStatusSnapshot) => void> = new Set();

  constructor(deps?: {
    transport?: FirestoreSyncTransport;
    storage?: Pick<Storage, 'getItem' | 'setItem'>;
    isOnline?: boolean;
  }) {
    this.transport = deps?.transport ?? createDefaultFirestoreTransport();
    this.storage =
      deps?.storage ??
      (typeof window !== 'undefined' && window.localStorage ? window.localStorage : null);
    if (typeof deps?.isOnline === 'boolean') {
      this.isOnline = deps.isOnline;
    }

    this.loadQueue();

    if (typeof window !== 'undefined' && !deps?.transport) {
      window.addEventListener('online', () => {
        this.setOnline(true);
      });
      window.addEventListener('offline', () => {
        this.setOnline(false);
      });
    }
  }

  private loadQueue(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(SYNC_QUEUE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.queue = Array.isArray(parsed) ? parsed : [];
        if (this.queue.length > 0) {
          this.status = 'PENDING_SYNC';
        }
      }
    } catch {
      this.queue = [];
    }
  }

  private saveQueue(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(SYNC_QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
    } catch {
      // Ignore quota errors
    }
  }

  public setOnline(online: boolean): void {
    this.isOnline = online;
    if (online && this.queue.length > 0) {
      void this.flushQueue();
    } else {
      this.notify();
    }
  }

  public getStatus(): FirebaseSyncStatusSnapshot {
    return {
      status: this.status,
      pendingCount: this.queue.length,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
      isOnline: this.isOnline,
    };
  }

  /**
   * Queues a sanitized record locally first, guaranteeing durability offline and idempotent retry online.
   */
  public async enqueueSync(params: {
    uid: string | null | undefined;
    collectionName: SyncEntityCollection;
    docId: string;
    data: Record<string, any>;
    version?: number;
    updatedAt?: number;
    flushImmediately?: boolean;
  }): Promise<{ queued: boolean; status: SyncStatus; sanitizedPayload: Record<string, any> }> {
    const updatedAt = params.updatedAt ?? Date.now();
    const version = params.version ?? 1;
    const sanitizedPayload = sanitizeForPersistence({
      ...params.data,
      uid: params.uid || 'local',
      updatedAt,
      version,
    });

    if (containsSecretFields(sanitizedPayload)) {
      throw new Error('Security invariant violation: secret fields detected in sync payload.');
    }

    if (!params.uid) {
      this.status = 'LOCAL_ONLY';
      this.notify();
      return { queued: false, status: 'LOCAL_ONLY', sanitizedPayload };
    }

    const dedupeKey = `${params.uid}:${params.collectionName}:${params.docId}`;
    const existingIdx = this.queue.findIndex((item) => item.id === dedupeKey);
    const nextItem: SyncQueueItem = {
      id: dedupeKey,
      uid: params.uid,
      collectionName: params.collectionName,
      docId: params.docId,
      data: sanitizedPayload,
      version,
      updatedAt,
      retryCount: 0,
      nextRetryAt: Date.now(),
    };

    if (existingIdx !== -1) {
      const existing = this.queue[existingIdx];
      // Version & timestamp conflict check locally before queuing
      if (
        existing.version > nextItem.version ||
        (existing.version === nextItem.version && existing.updatedAt > nextItem.updatedAt)
      ) {
        return { queued: false, status: this.status, sanitizedPayload };
      }
      this.queue[existingIdx] = nextItem;
    } else {
      this.queue.push(nextItem);
    }

    this.status = 'PENDING_SYNC';
    this.saveQueue();
    this.notify();

    if (params.flushImmediately !== false && this.isOnline) {
      await this.flushQueue();
    }

    return { queued: true, status: this.status, sanitizedPayload };
  }

  /**
   * Flushes pending queue items to users/{uid}/{collectionName}/{docId} with version/timestamp conflict resolution.
   */
  public async flushQueue(now = Date.now()): Promise<{ syncedCount: number; failedCount: number }> {
    if (this.isFlushing || !this.isOnline || this.queue.length === 0) {
      return { syncedCount: 0, failedCount: 0 };
    }

    this.isFlushing = true;
    let syncedCount = 0;
    let failedCount = 0;
    const remaining: SyncQueueItem[] = [];

    try {
      for (const item of this.queue) {
        if (item.nextRetryAt > now) {
          remaining.push(item);
          continue;
        }

        const pathSegments = ['users', item.uid, item.collectionName, item.docId];
        try {
          // Conflict resolution against remote timestamp/version
          const remote = await this.transport.readDoc(pathSegments);
          if (remote) {
            const remoteVersion = Number(remote.version ?? 0);
            const remoteUpdated = Number(remote.updatedAt ?? 0);
            if (
              remoteVersion > item.version ||
              (remoteVersion === item.version && remoteUpdated > item.updatedAt)
            ) {
              // Remote is newer — skip stale overwrite idempotently
              syncedCount += 1;
              continue;
            }
          }

          await this.transport.writeDoc(pathSegments, item.data);
          syncedCount += 1;
          this.lastSyncedAt = Date.now();
          this.lastError = null;
        } catch (err: any) {
          failedCount += 1;
          const retryCount = item.retryCount + 1;
          const errMsg = String(err?.message || err || 'Firestore sync error');
          this.lastError = errMsg;
          if (retryCount < MAX_RETRY_ATTEMPTS) {
            const backoffMs = Math.min(60_000, 1000 * Math.pow(2, retryCount));
            remaining.push({
              ...item,
              retryCount,
              nextRetryAt: Date.now() + backoffMs,
              lastError: errMsg,
            });
          }
        }
      }

      this.queue = remaining;
      if (this.queue.length === 0 && failedCount === 0) {
        this.status = 'SYNCED';
      } else if (failedCount > 0) {
        this.status = 'SYNC_FAILED';
      } else {
        this.status = 'PENDING_SYNC';
      }

      this.saveQueue();
      this.notify();
      return { syncedCount, failedCount };
    } finally {
      this.isFlushing = false;
    }
  }

  public getPendingItems(): SyncQueueItem[] {
    return [...this.queue];
  }

  public clearQueue(): void {
    this.queue = [];
    this.status = 'LOCAL_ONLY';
    this.lastError = null;
    this.saveQueue();
    this.notify();
  }

  public subscribe(listener: (snap: FirebaseSyncStatusSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snap = this.getStatus();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }
}

export const firebaseSyncManager = new FirebaseSyncManager();
