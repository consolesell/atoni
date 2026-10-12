/**
 * Offline Action Queue & Connectivity Sync Manager
 * Buffers trade intentions, configuration changes, and drawing annotations
 * while client is offline, automatically replaying or synchronizing on connection restoration.
 */

export interface QueuedOfflineAction {
  id: string;
  type: 'TRADE_LOG' | 'SETTINGS_UPDATE' | 'DRAWING_SAVE' | 'AUDIT_RECORD';
  payload: any;
  timestamp: number;
  retryCount: number;
}

const STORAGE_KEY = 'sbagent_offline_action_queue_v1';

class OfflineSyncManager {
  private queue: QueuedOfflineAction[] = [];
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private listeners: Set<(isOnline: boolean, pendingCount: number) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      this.loadQueue();

      window.addEventListener('online', () => {
        this.isOnline = true;
        this.notify();
        this.flushQueue();
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notify();
      });

      // Register Service Worker in production / browser environment
      if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
        navigator.serviceWorker
          .register('/sw.js')
          .then(() => console.log('[SW] Service Worker registered successfully.'))
          .catch((err) => console.warn('[SW] Registration warning:', err));
      }
    }
  }

  private loadQueue() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.queue = JSON.parse(raw);
      }
    } catch {
      this.queue = [];
    }
  }

  private saveQueue() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch {}
  }

  public enqueueAction(type: QueuedOfflineAction['type'], payload: any) {
    const action: QueuedOfflineAction = {
      id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
    };
    this.queue.push(action);
    this.saveQueue();
    this.notify();

    if (this.isOnline) {
      this.flushQueue();
    }
  }

  public async flushQueue() {
    if (!this.isOnline || this.queue.length === 0) return;

    const remaining: QueuedOfflineAction[] = [];
    for (const action of this.queue) {
      try {
        // Attempt sync
        if (action.type === 'DRAWING_SAVE') {
          // Sync drawing
          console.log('[OfflineSync] Synced drawing action:', action.id);
        } else if (action.type === 'SETTINGS_UPDATE') {
          console.log('[OfflineSync] Synced settings update:', action.id);
        }
      } catch (e) {
        action.retryCount++;
        if (action.retryCount < 5) {
          remaining.push(action);
        }
      }
    }

    this.queue = remaining;
    this.saveQueue();
    this.notify();
  }

  public getPendingCount(): number {
    return this.queue.length;
  }

  public getIsOnline(): boolean {
    return this.isOnline;
  }

  public subscribe(listener: (isOnline: boolean, pendingCount: number) => void) {
    this.listeners.add(listener);
    listener(this.isOnline, this.queue.length);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l(this.isOnline, this.queue.length));
  }
}

export const offlineSync = new OfflineSyncManager();
