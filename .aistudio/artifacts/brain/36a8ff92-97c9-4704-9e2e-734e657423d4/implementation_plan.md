# UI Transitions, Loading, Responsiveness & Adaptive Design Plan (sbatomic4.1)

Elevate the terminal into a cohesive, adaptive product with a unified motion language, real skeleton loading states, responsive viewport boundaries (from 360px mobile to 1440px desktop), and thumb-first mobile autonomy integration without modifying underlying trading engines.

## User Review & Critical Decisions

> [!IMPORTANT]
> All Phase 1 user decisions are confirmed and incorporated as non-negotiable architectural anchors:
> - **Chart Loading**: Skeleton frame with subtle candle placeholders (avoiding blank canvas voids or flashing overlays).
> - **Tab Motion**: Subtle cross-fade with slight horizontal shift (8–12px) with persistent chart mounting to prevent remount jitter.
> - **Mobile Autonomy Presentation (< 480px)**: Compact status bar integrated directly above the sticky mobile execution deck for immediate thumb accessibility.

---

## 1. Overview & Core Concept

- **What It Does**: Establishes a system-wide motion language, real event-driven loading skeletons, robust multi-tier breakpoints (`< 480px`, `480–768px`, `768–1024px`, `≥ 1024px`), and adaptive component disclosure across the platform.
- **Target Audience**: Quantitative and manual traders operating on varying devices (mobile phones, tablets, high-resolution desktop terminals) who require continuous situational awareness, zero visual layout shift, and immediate control without sensory fatigue.
- **Key Value**: Delivers native app fluidity and visual poise. Eliminates blank loading flashes, prevents mobile button overlap, standardizes animation timing, and keeps the trading console calm, clear, and instant.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **App Shell First Paint & Candle Load Flow**:
   - On load or asset change, the chart area displays a geometric skeleton mirror consisting of simulated candle stems and bodies pulsating with a subtle 600ms opacity shimmer.
   - When WebSocket ticks/candles arrive, the skeleton cross-fades into the real canvas smoothly (200ms) with zero layout reflow.
2. **Tab Transition Flow**:
   - Switching between `Terminal`, `Multi-Agent & Analytics`, `sbagent Co-Pilot`, `Markets`, and `Blackbox Hub` uses a 200–250ms cross-fade with a gentle 10px horizontal slide (`translate-x-2` to `translate-x-0`).
   - The primary interactive chart container remains mounted in the background via CSS display/opacity to avoid canvas re-initialization and WebSocket re-subscription delays.
3. **Mobile Autonomy & Execution Flow (< 480px)**:
   - A sticky bottom bar docks cleanly against `--safe-bottom` (`pb-safe`).
   - Directly above the Rise/Fall touch targets (min 46px height), a compact Autonomy strip displays:
     `[AUTONOMY: RUNNING · SBAgent GRANTED] [STOP]` or `[AUTONOMY: IDLE] [RUN AUTONOMOUSLY]`.
   - The Voice Command HUD trigger rests safely at `bottom-24`, preventing thumb collisions.
4. **Autonomous Phase Execution Feedback**:
   - Clicking `"Run autonomously"` on the AutonomyCard steps through real-time phase badges:
     *Validating Prerequisites* → *Configuring SBAgent & Risk* → *Autonomous Engine Armed*.
   - A thin Cyan progress rail provides visual confirmation of the configuration sequence.
5. **Drawers & Modals Exit Transitions**:
   - Slide-over drawers (Settings, Positions, Google Docs, Token Setup) animate with an enter transition (`animate-slide-up` / `scale-in`) and graceful 150ms leave transition before unmounting.

### Visual Identity & Theme Tokens

```css
/* Unified Motion Tokens */
--duration-micro: 120ms;       /* Button clicks, toggle switches, hover highlights */
--duration-ui: 220ms;          /* Dropdowns, tooltips, segmented toggles, tab shifts */
--duration-panel: 320ms;       /* Drawers, modals, bottom sheets */
--duration-hero: 600ms;        /* Skeletons, pulse glows, radar waves */

/* Easing Curves */
--ease-enter: cubic-bezier(0.16, 1, 0.3, 1);  /* Smooth deceleration for elements appearing */
--ease-leave: cubic-bezier(0.4, 0, 1, 1);      /* Clean acceleration for elements exiting */

/* Elevation Hierarchy */
--z-surface: 10;   /* Cards, chart panels */
--z-docked: 20;    /* Sticky mobile execution bar, chart toolbars */
--z-drawer: 40;    /* Slide-over settings drawers, tools dropdown */
--z-modal: 50;     /* Fullscreen dialogs, onboarding tour, token modals */
--z-toast: 60;     /* Voice HUD, alert toasts, error notices */
```

- **Prefers-Reduced-Motion**: Under `prefers-reduced-motion: reduce`, all translations and scale transforms are neutralized to simple opacity dissolves (`opacity: 0` to `opacity: 1`), and infinite pulse animations are halted.
- **Tabular Figures**: All price quotes, profit & loss amounts, countdown timers, and Kelly multipliers enforce `tabular-nums` / `font-mono` to prevent horizontal jitter during rapid tick fluctuations.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Skeleton Frame vs Blur Placeholder for Chart Loading**:
  - *Chosen Approach*: Lightweight SVG/CSS candle skeleton grid that mirrors real candlestick intervals.
  - *Why*: Eliminates the jarring black flash when switching volatility assets (e.g., from `1HZ10V` to `1HZ100V`), maintaining visual continuity.
  - *Alternatives Considered*: Blur placeholder of previous asset (causes misleading chart perception across different volatility scales).
- **Decision 2: Persistent Terminal Mount During Tab Transitions**:
  - *Chosen Approach*: Keep the Terminal view mounted in the DOM (`hidden` / `opacity-0` when inactive) while animating secondary tabs.
  - *Why*: Prevents re-creating the HTML5 2D canvas, re-measuring ResizeObservers, and re-fetching 120 candles on every tab switch.
  - *Alternatives Considered*: Full unmount/remount on every tab (leads to 400ms white/black screen flicker and CPU spikes).
- **Decision 3: Integrated Mobile Autonomy Strip**:
  - *Chosen Approach*: Dock a compact Autonomy status and quick-toggle strip directly atop `MobileExecutionBar.tsx`.
  - *Why*: Users on mobile viewports (< 480px) rarely scroll past the chart to inspect the right rail; hosting autonomy in the sticky bar ensures instantaneous emergency stop and start capability.

---

## 4. Technical Architecture & Component Mapping

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ADAPTIVE TOP NAVIGATION                         │
│  [Logo] · [Status · Latency] · [Tabs] · [Balance] · [Tools ▾] [Account]│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
         ┌──────────────────────────┴───────────────────────────┐
         ▼                                                      ▼
┌─────────────────────────────────┐   ┌──────────────────────────────────┐
│   INTERACTIVE CHART CONTAINER   │   │     EXECUTION & AUTONOMY RAIL    │
│  ┌───────────────────────────┐  │   │  ┌────────────────────────────┐  │
│  │ Segmented Overlay Toolbar │  │   │  │ AutonomyCard               │  │
│  │ [MAs][BB][RSI][MTF][Vol]  │  │   │  │ Phase: Validating/Active   │  │
│  └───────────────────────────┘  │   │  │ [Run Autonomously] [Config]│  │
│  ┌───────────────────────────┐  │   │  └────────────────────────────┘  │
│  │ Candle Skeleton / Canvas  │  │   │  ┌────────────────────────────┐  │
│  │ Cross-fade on Tick Stream │  │   │  │ TradeControls              │  │
│  └───────────────────────────┘  │   │  │ HOLD Warning Advisory      │  │
│  ┌───────────────────────────┐  │   │  │ [↑ RISE]      [↓ FALL]     │  │
│  │ Positions Drawer          │  │   │  └────────────────────────────┘  │
│  └───────────────────────────┘  │   └──────────────────────────────────┘
└─────────────────────────────────┘
                                    │
                                    ▼ (Mobile Viewports < 768px)
┌────────────────────────────────────────────────────────────────────────┐
│                     STICKY MOBILE EXECUTION BAR                        │
│  [Autonomy Strip: RUNNING · SBAgent Granted] [Stop Button]             │
│  [Stake Stepper] [Duration] ── [CALL ↑ RISE] ── [PUT ↓ FALL]           │
└────────────────────────────────────────────────────────────────────────┘
```

### Component Upgrades

1. **`src/index.css`**:
   - Add unified motion duration & easing utility classes (`.duration-micro`, `.duration-ui`, `.duration-panel`).
   - Add `.tab-crossfade-enter` keyframe with subtle horizontal slide (`translate-x-2` -> `translate-x-0`).
   - Add `.skeleton-shimmer` and `.candle-skeleton` styles for dark/light themes.
   - Comprehensive `@media (prefers-reduced-motion: reduce)` block.
2. **`src/components/InteractiveChart.tsx`**:
   - Add real loading state detection (`candles.length === 0` or switching symbol).
   - Render a high-density, themed candle skeleton grid when data is loading.
   - Smooth 200ms opacity dissolve when candles populate.
3. **`src/components/AutonomyCard.tsx`**:
   - Add phase progress indicator when starting autonomy (*Validating* -> *Configuring* -> *Armed*).
   - Fluid glow transitions between `OFF`, `ARMED`, and `RUNNING` states.
4. **`src/components/MobileExecutionBar.tsx`**:
   - Embed compact Autonomy status strip directly above Rise/Fall buttons.
   - One-tap `"Run"` / `"Stop"` button synchronized with global autonomy state.
   - Strict `touch-action: manipulation` and safe-area padding (`pb-safe`).
5. **`src/App.tsx`**:
   - Optimize view container transitions (`tab-crossfade-enter`).
   - Keep Terminal view persistent to prevent canvas remounts.
   - Pass autonomy handlers to `MobileExecutionBar`.

---

## 5. Rollout Order & Verification Plan

1. **Phase 1: Motion Tokens & CSS Architecture**: [COMPLETED] Implemented shared timing tokens, easing curves, skeleton shimmer, and reduced-motion rules in `src/index.css`.
2. **Phase 2: Chart Skeleton & Loading States**: [COMPLETED] Built the candle skeleton inside `src/components/InteractiveChart.tsx` with smooth canvas cross-fades.
3. **Phase 3: Tab View Transitions & Persistent Mounting**: [COMPLETED] Updated `src/App.tsx` tab switching to use persistent DOM preservation with horizontal cross-fade animation.
4. **Phase 4: Mobile Autonomy Integration**: [COMPLETED] Enhanced `src/components/MobileExecutionBar.tsx` with the integrated autonomy strip, one-touch start/stop, and safe-area offsets, wired directly to `App.tsx`.
5. **Phase 5: AutonomyCard Phase Progress**: [COMPLETED] Enhanced `src/components/AutonomyCard.tsx` with stage-aware feedback indicators and phase progress tracking.
6. **Phase 6: Verification**: [COMPLETED] Validated with `lint_applet` (`tsc --noEmit`) and `compile_applet` (100% clean production build).
