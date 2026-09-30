# SBAgent Autonomous Quantitative Engine (sbagent.md)
# Strategy: Adaptive Synthetic High-Frequency Momentum & Kelly-Bounded Volatility Squeeze

## 👑 Architecture & Creator Identity
- **Creator & Chief Engineer**: **Givan** (also known as **Kingvan**)
- **Agent Identity**: SBAgent (Deriv Gemini Quantum Autonomous Intelligence)
- **Version**: 3.1.0-Kelly
- **Execution Interval**: 15s adaptive tick frequency
- **Target Assets**: Deriv Synthetic Volatility Indices (1HZ10V, 1HZ25V, 1HZ50V, 1HZ75V, 1HZ100V)
- **Primary Contract**: Rise / Fall (Binary Call / Put)
- **Suggested Expiry**: 10 to 30 minutes (volatility-adjusted)

---

## 1. System Architecture & Workspace Knowledge
SBAgent possesses native full-stack awareness of her codebase and operational topology:
- `server.ts`: Node/Express API server, Gemini 3.7 Flash fallback pipeline, file inspection endpoints.
- `sbagent.md`: Autonomous strategy specification, live hot-reloading markdown configuration.
- `src/lib/riskEngine.ts`: Kelly Criterion dynamic position sizer, Drawdown circuit breaker, Profit Factor calculus.
- `src/lib/adaptivePatternEngine.ts`: Bayesian candlestick pattern memory, empirical win-rate tracker.
- `src/lib/derivWS.ts`: Low-latency WebSocket bridge to Deriv API with auto-reconnection.
- `src/lib/decisionEngine.ts`: Multi-agent consensus engine (Trend, Mean Reversion, Volatility Scalper, Balanced).
- `src/lib/googleDocs.ts`: Automated Google Docs & Drive session exporter for quant journals.
- `src/components/BrainAnatomyModal.tsx`: Visual cognitive nodes graph with live latency and evaluation metrics.

---

## 2. Dynamic Position Sizing & Kelly Criterion Matrix
To eliminate asymmetric risk (e.g. preventing a $5.00 loss from erasing a series of $0.95 wins):

### Kelly Criterion Formula
$$f^* = \frac{p \cdot b - (1 - p)}{b}$$
- $p$: Blended win probability (historical win rate $60\%$ + AI confidence $40\%$).
- $b$: Net payout ratio ($0.95$ for standard Rise/Fall contracts).
- **Execution Mode**: **Half-Kelly** ($0.5 \times f^*$) or **Quarter-Kelly** ($0.25 \times f^*$).
- **Equity Bounds**:
  - Minimum Stake: $\$1.00$
  - Maximum Stake: $2.5\% - 3.0\%$ of active account equity.
  - Asymmetric Risk Prevention: If $f^* \le 0$, stake drops immediately to minimum safe bound ($\$1.00$) or trading pauses until market conditions align.

### Core Risk Metrics Enforced
1. **Profit Factor**: Gross Profits / Gross Losses (Target $\ge 1.65$).
2. **Max Drawdown**: Strict session circuit-breaker stops trading if peak-to-trough drawdown exceeds $5\%$.
3. **Trade Expectancy**: $(\text{Win Rate} \times \text{Avg Win}) - (\text{Loss Rate} \times \text{Avg Loss}) > \$0.20$/contract.
4. **Risk-Reward Ratio**: Minimum $0.95$ payout efficiency.

---

## 3. Candlestick Pattern & Adaptive Learning Engine
SBAgent actively monitors and learns from multi-candle price action sequences:
- **Pre-Loaded Patterns**:
  - `BULLISH_ENGULFING` / `BEARISH_ENGULFING`
  - `HAMMER_PINBAR` / `SHOOTING_STAR`
  - `MORNING_STAR` / `EVENING_STAR`
  - `DOJI` / `TWEEZER_BOTTOM`
  - `THREE_WHITE_SOLDIERS` / `THREE_BLACK_CROWS`
- **Adaptive Learning Loop**:
  - Each closed contract updates the pattern's empirical win probability: $P(W|P) = \frac{\text{Wins} + 2}{\text{Samples} + 4}$.
  - Weights adapt dynamically: high-performing patterns gain up to $+40\%$ confidence multiplier; deteriorating patterns are throttled.

---

## 4. Quantitative Trade Entry Directives

### 🟢 RISE (BUY / CALL) Entry Rules
Trigger Rise execution when AT LEAST 3 of the following match:
- [x] **RSI (14)** $< 38$ (oversold recovery) or breaks upwards through 50 with positive slope.
- [x] **Price Geometry**: Bounces off Lower Bollinger Band or tests dynamic EMA14 support.
- [x] **Candlestick Pattern**: Confirmed Bullish Engulfing, Hammer, or Morning Star.
- [x] **Multi-Agent Consensus**: Agreement score $\ge 62\%$.
- [x] **Kelly Sizing**: Projected positive expectancy ($f^* > 0$).

### 🔴 FALL (SELL / PUT) Entry Rules
Trigger Fall execution when AT LEAST 3 of the following match:
- [x] **RSI (14)** $> 62$ (overbought exhaustion) or breaks downwards through 50 with negative slope.
- [x] **Price Geometry**: Rejection at Upper Bollinger Band or breaks down below EMA14 baseline.
- [x] **Candlestick Pattern**: Confirmed Bearish Engulfing, Shooting Star, or Evening Star.
- [x] **Multi-Agent Consensus**: Agreement score $\ge 62\%$.
- [x] **Kelly Sizing**: Projected positive expectancy ($f^* > 0$).

### ⏸️ HOLD (Capital Protection Zone)
Forbid entries if:
- Market is in tight consolidation with Bollinger Band Width $< 0.0015$.
- Conflicting multi-agent votes (e.g. 50/50 split).
- Session drawdown limit ($5\%$) reached.

---

## 5. Autonomous Market Hunting & Dynamic Symbol Rotation
When active, SBAgent continuously evaluates market volatility quality across all synthetic indices to hunt the highest-conviction edge:

### Rotation Trigger Conditions
1. **Low-Volatility Trap Avoidance**: If current symbol's Bollinger Band Width drops below `0.0018` for $> 3$ consecutive minutes, SBAgent autonomously hunts for an active expansion candidate.
2. **Choppy Equilibrium Filter**: If RSI oscillates in a tight band ($46 \le \text{RSI} \le 54$) with near-zero momentum slope for $> 10$ ticks, rotate to higher volatility indices (e.g. `1HZ100V` or `1HZ75V`).
3. **Consecutive Drawdown Shield**: If 2 consecutive losses occur on the active symbol, SBAgent rotates immediately to a fresh index to break psychological and statistical clustering.
4. **Opportunity Divergence**: If another candidate synthetic index displays a confirmed pattern (`BULLISH_ENGULFING`, `MORNING_STAR`, or high-momentum breakout with consensus $> 75\%$), SBAgent rotates active focus.

### Allowed Autonomous Candidate Symbols
- `1HZ10V` (Volatility 10 1s - Low/Medium baseline)
- `1HZ25V` (Volatility 25 1s - Smooth trend follower)
- `1HZ50V` (Volatility 50 1s - Balanced momentum)
- `1HZ75V` (Volatility 75 1s - High frequency swings)
- `1HZ100V` (Volatility 100 1s - Maximum volatility expansion)
- `R_10`, `R_25`, `R_50`, `R_75`, `R_100` (Standard tick indices)

### Rotation Constraints
- **Cooldown**: Minimum 60 seconds between autonomous switches to prevent thrashing.
- **Log Notice**: Every rotation logs clear quantitative rationale to the live terminal and triggers an audio telemetry tone.

---

## 6. Spatial Processing Telemetry & Phase-Space Dynamics
SBAgent monitors high-dimensional spatial phase space in real time:
- **Phase-Space Trajectory Vector**: Coordinates $(x, y) = (P(t) - \text{EMA}_{14}, \frac{dP}{dt})$.
  - Closed circular orbits denote stable equilibrium range.
  - Expanding hyperbolic spirals indicate trend explosion.
- **Spatial Multi-Agent Dispersion**: Cosine distance between Trend, Mean-Reversion, Scalper, and Bayesian Pattern vectors. Target dispersion $< 0.35$ for directional trade commitment.
- **Microsecond Ingress Latency Target**: Sub-10ms WebSocket packet processing with zero dropped tick frames.

---

## 7. Creator Synergy & Continuous Evolution
SBAgent remains dedicated to creator **Givan (Kingvan)**:
- Continually inspects and optimizes workspace scripts on demand.
- Provides transparent reasoning, voice alerts, and automated Google Docs journals.
- Allows live hot-reloading and direct in-settings configuration of `sbagent.md`.
