/**
 * Native Host Bridge Client for SBAtomic Android Host
 * 
 * Facilitates safe, non-blocking IPC with Android WebView wrappers (window.AtomicBridge / window.SBAtomicHost).
 * Every method is fail-soft: if running in a standard desktop or mobile web browser,
 * calls cleanly no-op with zero console warnings or exceptions.
 * 
 * SECURITY: Never pass credentials, Deriv API tokens, or private user keys over the host bridge.
 */

export type HostHapticStyle = 'light' | 'medium' | 'success' | 'error';

export interface HostDeviceInfo {
  native?: boolean;
  host?: string;
  version?: string | number;
  haptics?: boolean;
  reducedMotion?: boolean;
  [key: string]: unknown;
}

export interface HostBridge {
  notifyReady?: () => void;
  haptic?: (style: HostHapticStyle) => void;
  showToast?: (msg: string) => void;
  keepScreenOn?: (on: boolean) => void;
  speak?: (text: string) => void;
  copyToClipboard?: (text: string) => void;
  getDeviceInfo?: () => string | HostDeviceInfo;
  reload?: () => void;
}

declare global {
  interface Window {
    AtomicBridge?: HostBridge;
    SBAtomicHost?: HostBridge;
    __ATOMIC_NATIVE__?: boolean;
    __SBATOMIC_HOST__?: boolean;
  }
}

let isReadySignaled = false;
let listenersInitialized = false;

/**
 * Resolves the injected Android WebView host bridge instance if available.
 */
export function getBridge(): HostBridge | null {
  if (typeof window === 'undefined') return null;
  return window.AtomicBridge || window.SBAtomicHost || null;
}

/**
 * Checks if the application is running inside the SBAtomic Android native shell.
 */
export function isNativeHost(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.__ATOMIC_NATIVE__ === true ||
    window.__SBATOMIC_HOST__ === true ||
    window.AtomicBridge ||
    window.SBAtomicHost
  );
}

/**
 * Signals to the native host that the web application is fully interactive and mounted.
 * Allows the native host to dismiss its splash screen / bootloader curtain.
 * Guaranteed to be idempotent (invoked at most once per page lifecycle).
 */
export function notifyHostReady(): void {
  if (typeof window === 'undefined' || isReadySignaled) return;

  const bridge = getBridge();
  if (bridge && typeof bridge.notifyReady === 'function') {
    try {
      bridge.notifyReady();
      isReadySignaled = true;
    } catch (e) {
      console.warn('[NativeHost] notifyReady invocation notice:', e);
    }
  }
}

/**
 * Attaches a one-time listener for the host's 'atomic-ready' event in case the
 * bridge is injected asynchronously after initial script evaluation.
 */
export function initHostListeners(): void {
  if (typeof window === 'undefined' || listenersInitialized) return;
  listenersInitialized = true;

  window.addEventListener('atomic-ready', () => {
    notifyHostReady();
  });
}

// Auto-register listener immediately upon script evaluation
initHostListeners();

/**
 * Triggers native haptic vibration feedback via the Android host.
 * Silently no-ops in standard browsers.
 */
export function hostHaptic(style: HostHapticStyle): void {
  if (!isNativeHost()) return;
  const bridge = getBridge();
  if (bridge && typeof bridge.haptic === 'function') {
    try {
      bridge.haptic(style);
    } catch (e) {
      console.warn('[NativeHost] haptic failed:', e);
    }
  }
}

/**
 * Controls the Android FLAG_KEEP_SCREEN_ON window property to keep the device awake
 * during active automated trading or live market monitoring sessions.
 */
export function hostKeepScreenOn(on: boolean): void {
  if (!isNativeHost()) return;
  const bridge = getBridge();
  if (bridge && typeof bridge.keepScreenOn === 'function') {
    try {
      bridge.keepScreenOn(Boolean(on));
    } catch (e) {
      console.warn('[NativeHost] keepScreenOn failed:', e);
    }
  }
}

/**
 * Displays a native Android Toast message.
 */
export function hostToast(msg: string): void {
  if (!isNativeHost() || !msg) return;
  const bridge = getBridge();
  if (bridge && typeof bridge.showToast === 'function') {
    try {
      bridge.showToast(String(msg));
    } catch (e) {
      console.warn('[NativeHost] showToast failed:', e);
    }
  }
}

/**
 * Uses host Text-To-Speech for short verbal confirmations.
 * Note: To prevent dual-audio collisions with web TTS (Kokoro/Web Speech),
 * call this only when web audio is unavailable or disabled.
 */
export function hostSpeak(text: string): void {
  if (!isNativeHost() || !text) return;
  const bridge = getBridge();
  if (bridge && typeof bridge.speak === 'function') {
    try {
      bridge.speak(String(text));
    } catch (e) {
      console.warn('[NativeHost] speak failed:', e);
    }
  }
}

/**
 * Requests the host copy text to the Android system clipboard.
 */
export function hostCopy(text: string): void {
  if (!text) return;
  const bridge = getBridge();
  if (bridge && typeof bridge.copyToClipboard === 'function') {
    try {
      bridge.copyToClipboard(String(text));
      return;
    } catch (e) {
      console.warn('[NativeHost] copyToClipboard failed, falling back:', e);
    }
  }

  // Web clipboard fallback
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

/**
 * Retrieves device and host telemetry (e.g. reducedMotion, haptics capability, app version).
 */
export function hostDeviceInfo(): HostDeviceInfo | null {
  if (!isNativeHost()) return null;
  const bridge = getBridge();
  if (bridge && typeof bridge.getDeviceInfo === 'function') {
    try {
      const info = bridge.getDeviceInfo();
      if (typeof info === 'string') {
        return JSON.parse(info) as HostDeviceInfo;
      }
      if (typeof info === 'object' && info !== null) {
        return info as HostDeviceInfo;
      }
    } catch (e) {
      console.warn('[NativeHost] getDeviceInfo parsing note:', e);
    }
  }
  return null;
}

/**
 * Triggers a full native WebView reload.
 */
export function hostReload(): void {
  const bridge = getBridge();
  if (bridge && typeof bridge.reload === 'function') {
    try {
      bridge.reload();
      return;
    } catch (e) {
      console.warn('[NativeHost] reload failed, falling back to window.location.reload:', e);
    }
  }
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}
