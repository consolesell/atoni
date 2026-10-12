# sbatomic4.1 — Autonomous Quantitative Trading Terminal

> Powered by **SBAgent Market Intelligence**, Multi-Agent Consensus Engine, 3D Holographic Spatial Analytics, Dynamic Half-Kelly Sizing, and Studio Neural Audio.

---

## 🌟 Overview

**sbatomic4.1** is an institutional-grade, low-latency Rise/Fall trading terminal engineered for Deriv synthetic volatility indices (`1HZ10V` – `1HZ100V`, `R_10` – `R_100`). It unites autonomous strategy execution with cutting-edge visual telemetry and studio neural audio feedback.

### Key Capabilities

1. **AI Copilot & Strategy Intelligence**
   - **Real-Time Token Streaming**: Server-Sent Events (SSE) token streaming from Google Gemini models (`gemini-3.8-flash`) with progressive rendering, live activity pipeline tracking, and instant user abort control.
   - **Self-Improvement Loop (`sbagent.md`)**: Autonomous mutation proposals based on real session trade outcomes, with human approval review modals and hot-reloading.
   - **Strategy Versioning & A/B Testing**: Multi-version allocation slider, automated trade assignment, and performance divergence auditing.
   - **Agent Evolution Dashboard**: Per-agent SVG equity curves, win-rate trends across market regimes, and Bayesian indicator weight mutations.
   - **Portfolio Exposure Limits & Correlation-Aware Rotation**: Max open exposure and concurrent contract limits, with correlation-aware rotation prioritizing low-correlation synthetic assets.

2. **Chart & High-Frequency Visualization**
   - **Zero-Blanking Stabilized Chart**: Fully decoupled ResizeObserver engine eliminating canvas tearing, resize loops, and HMR desynchronization.
   - **Agent-Vote Annotations**: Overlaid BUY, SELL, and HOLD badges plotted directly on candles with consensus agreement metrics.
   - **Multi-Timeframe Overlays**: Higher-Timeframe EMA200 baselines and dynamic volatility corridor envelopes.
   - **Side Volume Profile & Persistent Drawings**: Real-time Point of Control (POC) price ray and tick volume histogram, with persistent drawings synced to localStorage and Firebase Firestore.
   - **Advanced 3D Holographic Visualizer**: Three.js-powered cybernetic holographic engine rendering Spatial Phase-Space Attractors, Blackbox Intelligence Core, and Multi-Agent Consensus manifolds.

3. **Studio Voice & Speech System**
   - **Fine-Grained Synthesizer Controls**: Sliders for Pitch, Speech Rate, Stability, Clarity/Treble, Emotion Matrix, and Kokoro-82M model selection (`af_heart`, `af_bella`, `af_sarah`, `af_sky`, `am_adam`, `am_michael`).
   - **Rich Natural Language Commands**: Spoken commands including `"Rotate to Volatility 75"`, `"Tighten stop"`, `"Show agent votes"`, `"Pause bot"`, `"Increase stake to 2 dollars"`, and `"Export journal"` with instant voice audio confirmation.

4. **Deriv Authentication & WebSocket Resilience**
   - **Session State & Clean Log In / Log Out**: Multi-account token switching, virtual $10.00 USD anchor sandbox, and clean session logout.
   - **Heartbeat Monitoring & Watchdog**: Active 20-second ping/pong keep-alives with a 12-second zombie socket watchdog and exponential backoff reconnection.
   - **Tick Buffering**: Seamless tick buffering during reconnect events with automatic fallback simulation.

5. **Reliability, Offline Support & Auditability**
   - **Service Worker & Full Offline Support**: Pre-cached shell and assets with background synchronization queue.
   - **Structured Audit Logging**: Tamper-evident logging of every autonomous decision, HOLD reason, rotation event, and circuit-breaker trigger with CSV export.
   - **Interactive Onboarding Tour**: 5-step guided walkthrough highlighting live data streams, charts, 3D holographic spatial core, risk armor, and voice commands.

---

## 🛠️ Architecture

```
sbatomic4.1/
├── server.ts                    # Full-Stack Express Server (SSE Streaming, TTS, AI Endpoints)
├── fastapi_tts_server.py        # Kokoro-82M Neural Audio FastAPI Service
├── sbagent.md                   # Core Autonomous Strategy Definition & Governance
├── src/
│   ├── components/
│   │   ├── InteractiveChart.tsx          # Canvas Chart with HTF & Volume Profile
│   │   ├── Holographic3DVisualizer.tsx    # Three.js 3D Hologram (Spatial, Blackbox, Consensus)
│   │   ├── AICopilotChat.tsx             # Real-time SSE Streaming Chat + Voice Mic
│   │   ├── BlackboxHubView.tsx           # Autonomous Hub with 3D Core
│   │   ├── SpatialProcessingMetricsView  # Phase-Space Vector Field & Hologram
│   │   ├── AgentEvolutionModal.tsx       # Per-Agent Equity Curves & Bayesian Weights
│   │   ├── StrategyEvolutionModal.tsx    # Mutation Proposals & A/B Testing
│   │   ├── VoiceCommandHUD.tsx           # Voice Command HUD & Audio Feedback
│   │   ├── AgentVoiceCompanion.tsx       # Synthesizer Slider Controls
│   │   ├── AuditLogModal.tsx             # Structured Audit Logging & CSV Export
│   │   └── OnboardingTourModal.tsx       # 5-Step Guided Walkthrough
│   ├── lib/
│   │   ├── derivWS.ts                    # Resilient Deriv WebSocket Client
│   │   ├── voiceEngine.ts                # Neural Kokoro-82M & WebSpeech Audio Engine
│   │   ├── voiceInputEngine.ts           # Speech Recognition & Trade Command Parser
│   │   ├── riskEngine.ts                 # Half-Kelly Sizing & Drawdown Shield
│   │   ├── auditLogger.ts                # Structured Audit Log Engine
│   │   └── offlineSync.ts                # Offline Action Queue Manager
│   └── public/
│       └── sw.js                         # Stale-While-Revalidate Service Worker
```

---

## 🚀 Getting Started

### Development Dev Server
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

---

## 🛡️ Risk & Safety Disclaimers
Synthetic volatility index trading carries capital risk. **sbatomic4.1** implements mathematical Half-Kelly Criterion stake sizing, a mandatory 5% session drawdown circuit-breaker, and portfolio exposure limits to enforce disciplined risk management.
