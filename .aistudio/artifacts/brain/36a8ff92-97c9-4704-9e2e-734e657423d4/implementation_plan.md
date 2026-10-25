# UI Polish & Unified Autonomy Console Plan (sbatomic4.1)

Consolidate scattered controls, declutter the navigation bar into a categorized Tools menu, establish a clean default mobile chart experience, and surface real-time execution trust telemetry without modifying underlying decision, risk, or WebSocket engines.

## User Review & Critical Decisions

> [!IMPORTANT]
> All Phase 1 user decisions are confirmed and incorporated as non-negotiable architectural anchors:
> - **Autonomy Placement**: Centered directly beside the primary Trade Execution Deck at the top of the right rail for immediate visual proximity to manual execution controls.
> - **Navbar Tools Grouping**: Consolidated into a single clean "Tools" menu with categorized shortcuts (Intelligence, Reporting, Audit & Logs, Help) to eliminate visual clutter and avoid horizontal overflow.
> - **Chart Mobile View**: Boots into a clean minimal state with essential moving averages, moving secondary overlays (Bollinger Bands, RSI, Multi-Timeframe EMA, Volume Profile, and Agent-Vote annotations) into a compact segmented toolbar.

---

## 1. Overview & Core Concept

- **What It Does**: Unifies trading controls into focused, intuitive surfaces across desktop (1440px) and mobile viewports (360px–720px). The platform gains a single canonical Autonomy Card, a calm Navbar with an organized Tools dropdown, a clean uncluttered chart canvas, a touch-first sticky execution strip with circuit-breaker lockout states, and an enhanced Voice HUD supporting both microphone and quick-text command entry.
- **Target Audience**: Quantitative and manual Deriv Rise/Fall traders requiring fast situational awareness, instant access to autonomy without hunting across panels, and robust execution safety indicators.
- **Key Value**: Eradicates UI scatter and sensory overload while keeping 100% of the underlying mathematical, subagent, and risk capabilities intact.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Autonomous Operation Flow**:
   - The user views the consolidated **Autonomy Card** directly beside the manual execution deck.
   - A single primary button toggles between `"Run autonomously"` (with status chip `ARMED` / `RUNNING • SBAgent granted`) and `"Stop autonomy"`.
   - Clicking `"Configure"` opens a focused modal adjusting only human risk ceilings and rotation universes.
   - Voice commands (`"Start bot"` / `"Run autonomously"`) and the card button share the exact same state machine.
2. **Tools Discovery Flow**:
   - The Navbar displays a single **Tools** button with a chevron.
   - Clicking reveals four categorized columns/sections:
     - **Intelligence**: Brain Anatomy, Subagent Editor, Strategy Evolution.
     - **Reporting & Notes**: Google Docs Exporter, Google Keep Notes.
     - **Audits & Telemetry**: Structured Audit Log, Alerts History.
     - **System & Help**: Guided Tour, Terminal Settings.
3. **Chart Exploration Flow**:
   - On load (especially on mobile), the chart displays clean candlesticks and moving averages without overwhelming overlays.
   - A sleek, floating segmented toolbar (`[MAs | BB | RSI | MTF | Vol | Votes | Draw]`) lets users toggle overlays with a single tap.
4. **Execution Safety Flow**:
   - When the decision engine signals `HOLD` or a session drawdown circuit-breaker trips, the Rise/Fall buttons visually dim and show an explicit lockout state with the exact HOLD reason (e.g., `"HOLD: BB Squeeze Compression"`).

### Visual Identity & Theme
- **Color Palette & Discipline**: Dark Slate canvas (`#020617` / `#080F20`), quiet structural borders (`#1E293B`), Cyan (`#00F0FF`) primary accent for Autonomy & active states, Emerald (`#10B981`) for Rise/Win, and Rose (`#F43F5E`) for Fall/Circuit Breaker.
- **Typography**: Display structure in `Plus Jakarta Sans`, data telemetry in tabular monospace (`JetBrains Mono` / `font-mono tabular-nums`).
- **Zero-Pill Restraint**: Informational metadata (asset IDs, timestamps, hold reasons) rendered as clean unboxed text with typographic bullet separators (`·`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Single Home for Autonomy**:
  - *Approach*: Consolidate all bot toggles, autonomy grants, and prerequisite checks into the Autonomy Card beside TradeControls.
  - *Rationale*: Eliminates confusion between "Start Bot" in Navbar, "Autonomous Mode" in Blackbox, and "Voice HUD".
- **Decision 2: Categorized Tools Menu vs Floating Drawers**:
  - *Approach*: A single contextual dropdown menu in the Navbar.
  - *Rationale*: Preserves immediate desktop discovery without covering the chart with multiple overlapping slide-over sheets.
- **Decision 3: Voice HUD Dual-Input (Speech + Text)**:
  - *Approach*: Add an inline command text input field inside the Voice HUD for silent environments or unsupported microphone browsers.
  - *Rationale*: Reuses the existing robust `voiceInputEngine.ts` regex parsing pipeline with zero backend changes.

---

## 4. Technical Architecture & Component Mapping

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TOP NAVIGATION BAR                              │
│  [Wordmark] ── [Symbol Selector | WS Latency] ── [Tools ▾] [Account]   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
         ┌──────────────────────────┴───────────────────────────┐
         ▼                                                      ▼
┌─────────────────────────────────┐   ┌──────────────────────────────────┐
│   INTERACTIVE CHART CONTAINER   │   │     EXECUTION & AUTONOMY RAIL    │
│  ┌───────────────────────────┐  │   │  ┌────────────────────────────┐  │
│  │ Segmented Overlay Toolbar │  │   │  │ Consolidated Autonomy Card │  │
│  │ [MAs][BB][RSI][MTF][Vol]  │  │   │  │ Status: RUNNING / ARMED    │  │
│  └───────────────────────────┘  │   │  │ [Run Autonomously] [Config]│  │
│                                 │   │  └────────────────────────────┘  │
│  Canvas Area + Safe Padding     │   │  ┌────────────────────────────┐  │
│                                 │   │  │ TradeControls Execution    │  │
│  ┌───────────────────────────┐  │   │  │ Stake · Duration · TSL     │  │
│  │ Active Positions Drawer   │  │   │  │ [↑ RISE]      [↓ FALL]     │  │
│  └───────────────────────────┘  │   │  │ (Disabled when HOLD active)│  │
└─────────────────────────────────┘   │  └────────────────────────────┘  │
                                      └──────────────────────────────────┘
```

### Component Updates Breakdown

1. **`Navbar.tsx`**:
   - Replace 6 individual action buttons with a single unified `Tools` dropdown menu.
   - Clean up mobile responsiveness with a collapsible hamburger/tools drawer.
   - Keep symbol, connection status, balance, and quick autonomy indicator visible.
2. **`AutonomyCard.tsx` & `App.tsx`**:
   - Ensure the card is the single source of truth for Autonomy.
   - Display real-time status chips (`WS: Connected · 24ms`, `Risk: Armed · 5% DD Cap`, `Hold Reason`).
3. **`InteractiveChart.tsx`**:
   - Update default states to clean minimal (`showBB: false`, `showRSI: false`, `showVolumeProfile: false`, `showAgentVotes: false`).
   - Group toggles into a unified, compact toolbar above the canvas.
   - Add safe-area padding to avoid collision with mobile execution elements.
4. **`TradeControls.tsx` & `MobileExecutionBar.tsx`**:
   - Enforce read-only visual lockouts when `algorithmicDecision.action === 'HOLD'` or circuit breaker is tripped, displaying the exact hold rationale.
5. **`VoiceCommandHUD.tsx`**:
   - Add an optional text input field that passes typed commands directly to `parseTradeCommand`.
   - Ensure safe bottom-left docking that never overlaps execution buttons on 360px–720px screens.

---

## 5. Verification & Completion Status

- [x] **Consolidated Tools Navigation (`Navbar.tsx`)**: Replaced scattered individual buttons with a categorized `Tools` menu (Intelligence, Reporting, Audits, System).
- [x] **Unified Autonomy (`AutonomyCard.tsx`)**: Single control deck with `RUNNING`, `ARMED`, and `OFF` states, explicit grant feedback, and shared state across UI and voice.
- [x] **Clean Chart Defaults (`InteractiveChart.tsx`)**: Minimal boot state with core MAs only; secondary indicators moved to a compact segmented toggle strip (`[MA | BB | RSI | MTF | Vol | Votes]`).
- [x] **HOLD Advisory & Safety Lockouts (`TradeControls.tsx` & `MobileExecutionBar.tsx`)**: Clear warning chips showing exact algorithmic hold reasons (BB squeeze, MTF conflict, etc.).
- [x] **Voice HUD Fallback & Mobile Padding (`VoiceCommandHUD.tsx`)**: Added silent text command input and safe bottom spacing (`bottom-20`) to clear the mobile execution strip.
- [x] **Verification**: `tsc --noEmit` passed with 0 errors; `compile_applet` passed successfully.

