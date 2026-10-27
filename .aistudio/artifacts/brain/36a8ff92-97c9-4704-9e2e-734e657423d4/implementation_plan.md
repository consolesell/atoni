# Native Host Bridge Integration Plan (SBAtomic Host)

Seamlessly connect the sbatomic web trading terminal with its Android WebView native wrapper (**SBAtomic Host**). Provides idempotent boot loader dismissal (`notifyReady`), contextual tactile haptics, battery-conscious screen wake management during autonomous execution, and native toasts—failing soft with zero errors in standard browsers.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed in Phase 1 and are locked as core architectural commitments:
> - **Host TTS Strategy**: Native host `speak()` is used **strictly as a fallback** when the web-based Kokoro/Web Speech synthesis is unavailable, disabled, or unconfigured, completely preventing dual-audio or overlapping voices.
> - **Native Toasts**: The host bridge will emit native Android toasts (`showToast`) on **autonomy state changes** (Granted/Revoked/Armed) and **critical risk/circuit breaker errors**, complementing web notifications.

---

## 1. Overview & Core Concept

- **What It Does**: Establishes a lightweight, resilient TypeScript bridge client (`src/lib/nativeHost.ts`) that safely communicates with Android WebView host objects (`window.AtomicBridge` or `window.SBAtomicHost`) without polluting standard browser runtimes.
- **Target Persona**: Mobile algorithmic traders running the terminal embedded within the dedicated Android APK/wrapper shell who need native haptic feedback on trade execution, persistent screen wake while the bot is active, and instant boot readiness handoff.
- **Key Value**: Delivers native app poise (haptics on trade submit, device wake locking during active autonomy, instant native splash dismissal) without touching or refactoring trading math, WebSocket protocols, or Kelly sizing.

---

## 2. User Experience & Native Integration

### Key User Flows

1. **Boot & Handshake Flow**:
   - The Android host launches with its native splash/boot loader.
   - When the web app mounts its primary shell (`App.tsx`) and reaches an interactive state (Deriv WebSocket initialized or main UI rendered), `notifyHostReady()` fires once.
   - The native host intercepts the call and smoothly dismisses its native loader curtain. If the web app is opened in a standard desktop or mobile browser, the call no-ops cleanly with zero console warnings.
2. **Autonomy Start / Stop & Screen Wake Flow**:
   - When the user taps `"Run autonomously"` or starts the trading bot:
     - Bridge triggers `haptic('success')`.
     - Bridge requests `keepScreenOn(true)` so the device display stays active during live automated market monitoring.
     - Bridge displays a native toast: `"SBAtomic Autonomy: Active (SBAgent Granted)"`.
   - When autonomy is revoked or stopped:
     - Bridge triggers `haptic('light')`.
     - Bridge releases wake lock via `keepScreenOn(false)`.
     - Bridge displays a native toast: `"SBAtomic Autonomy: Stopped"`.
3. **Trade Execution & Safety Alerts**:
   - Tapping Rise (`CALL ↑`) or Fall (`PUT ↓`):
     - Bridge fires `haptic('medium')` for crisp tactile confirmation.
   - Circuit breaker tripped / risk ceiling hit / hard trade rejection:
     - Bridge fires `haptic('error')` alongside a native toast alerting the user to check risk logs.

### Haptic Feedback Mapping

| Trigger | Bridge Call | Tactile Experience |
| :--- | :--- | :--- |
| **Autonomy Start / Bot Arming** | `hostHaptic('success')` | Satisfying double-pulse confirmation |
| **Autonomy Stop / Manual Halt** | `hostHaptic('light')` | Subtle single micro-tap |
| **Manual Rise / Fall Order Submit**| `hostHaptic('medium')` | Solid single click response |
| **Circuit Breaker / Risk Violation** | `hostHaptic('error')` | Heavy alert buzz |
| **Soft Warning / Limit Reached** | `hostHaptic('light')` | Subtle warning tap |

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Bridge Resolution & Idempotency**:
  - *Chosen Approach*: Support both `window.AtomicBridge` and legacy alias `window.SBAtomicHost`, with flags `window.__ATOMIC_NATIVE__` / `window.__SBATOMIC_HOST__`. Wrap all calls in `try/catch` and enforce an internal `isReadySignaled` latch.
  - *Why*: Eliminates race conditions if `atomic-ready` event fires before or after React hydration, and guarantees `notifyReady()` is only dispatched once per page lifecycle.
  - *Alternatives Considered*: Direct unbound calls (risks crashing if bridge is injected asynchronously by WebView).
- **Decision 2: Voice Overlap Prevention**:
  - *Chosen Approach*: Prioritize the built-in web `voice` engine (Kokoro neural TTS / Web Speech). Only route speech to `hostSpeak()` if web speech is disabled or fails to initialize.
  - *Why*: Prevents jarring simultaneous speech synthesis from two independent audio engines.
- **Decision 3: Zero Secret Exposure**:
  - *Chosen Approach*: Strictly zero tokens, credentials, or private state transmitted across the bridge. Only status messages, haptic enum styles, and boolean flags are exchanged.

---

## 4. Technical Architecture & Component Mapping

```
┌────────────────────────────────────────────────────────────────────────┐
│                   WEB TRADING RUNTIME (REACT / TS)                     │
│                                                                        │
│  ┌───────────────────────┐             ┌────────────────────────────┐  │
│  │   App.tsx Shell       │             │   Autonomy & Trade Engines │  │
│  │  - Mount event        │             │  - handleRunAutonomously   │  │
│  │  - atomic-ready event │             │  - handleStopAutonomy      │  │
│  └───────────┬───────────┘             │  - executeTrade (CALL/PUT) │  │
│              │                         └─────────────┬──────────────┘  │
│              ▼                                       ▼                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    src/lib/nativeHost.ts                         │  │
│  │  - isNativeHost() : boolean                                      │  │
│  │  - notifyHostReady() : void (idempotent)                         │  │
│  │  - hostHaptic(style: 'light'|'medium'|'success'|'error')         │  │
│  │  - hostKeepScreenOn(on: boolean)                                 │  │
│  │  - hostToast(msg: string)                                        │  │
│  │  - hostSpeak(text: string) (fallback only)                       │  │
│  │  - hostDeviceInfo() : DeviceInfo | null                          │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │ Safe IPC (try/catch guarded)
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   ANDROID NATIVE HOST (WEBVIEW)                        │
│  window.AtomicBridge || window.SBAtomicHost                            │
│  - dismiss boot loader curtain (notifyReady)                           │
│  - Vibrator / HapticFeedbackConstants                                  │
│  - FLAG_KEEP_SCREEN_ON                                                 │
│  - android.widget.Toast                                                │
│  - TextToSpeech (fallback)                                             │
└────────────────────────────────────────────────────────────────────────┘
```

### Module Specifications

1. **`src/lib/nativeHost.ts` (New Utility)**:
   - TypeScript definitions for `NativeHostBridge`, `HostHapticStyle`, and `HostDeviceInfo`.
   - Idempotent `notifyHostReady()` helper listening to both direct invocation and `window.addEventListener('atomic-ready', ...)`.
   - Safe proxy wrappers for `hostHaptic`, `hostKeepScreenOn`, `hostToast`, `hostSpeak`, `hostCopy`, and `hostDeviceInfo`.
2. **`src/App.tsx` Integration**:
   - `useEffect` on first paint calling `notifyHostReady()`.
   - `useEffect` watching `autonomyMode` and `botState.enabled` calling `hostKeepScreenOn(true/false)`.
   - Cleanup on unmount resetting `hostKeepScreenOn(false)`.
   - Wiring `handleRunAutonomously`: `hostHaptic('success')` + `hostToast('Autonomy active')`.
   - Wiring `handleStopAutonomy`: `hostHaptic('light')` + `hostToast('Autonomy stopped')`.
   - Wiring `executeTrade`: `hostHaptic('medium')` on entry, and `hostHaptic('error')` on rejection/blocker.

---

## 5. Rollout Order & Verification Plan

1. **Phase 1: Bridge Utility Module**: [COMPLETED] Created `src/lib/nativeHost.ts` with complete type guards and fallback safety for `window.AtomicBridge` / `window.SBAtomicHost`.
2. **Phase 2: App Shell Ready & Screen Wake**: [COMPLETED] Wired `notifyHostReady()` on initial mount and battery-conscious `hostKeepScreenOn` observer into `src/App.tsx`.
3. **Phase 3: Autonomy & Execution Haptics**: [COMPLETED] Wired tactile feedback and native toasts to `handleRunAutonomously`, `handleStopAutonomy`, and `executeTrade`, with `speakWithHostFallback` avoiding duplicate speech.
4. **Phase 4: Verification & Compilation**: [COMPLETED] Validated with `lint_applet` (`tsc --noEmit`) and `compile_applet` (100% successful production build).
