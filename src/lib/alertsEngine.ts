import { AlertRule, TriggeredAlert, AlertType } from '../types/alerts';
import { TechnicalIndicators, MarketRegime, DecisionResult, AIPredictionResult } from '../types/trading';
import { sound } from './soundEngine';

const STORAGE_KEY_RULES = 'deriv_advanced_alerts_rules_v1';
const STORAGE_KEY_HISTORY = 'deriv_advanced_alerts_history_v1';

export const DEFAULT_ALERT_PRESETS: AlertRule[] = [
  {
    id: 'preset_rsi_high',
    name: 'RSI Extreme Overbought (>72)',
    type: 'RSI_OVERBOUGHT',
    symbol: 'ALL',
    threshold: 72,
    enabled: true,
    sound: true,
    cooldownSec: 180,
    oneShot: false,
    createdAt: Date.now(),
  },
  {
    id: 'preset_rsi_low',
    name: 'RSI Extreme Oversold (<28)',
    type: 'RSI_OVERSOLD',
    symbol: 'ALL',
    threshold: 28,
    enabled: true,
    sound: true,
    cooldownSec: 180,
    oneShot: false,
    createdAt: Date.now(),
  },
  {
    id: 'preset_ai_conviction',
    name: 'High Conviction AI Signal (>=80%)',
    type: 'AI_CONFIDENCE',
    symbol: 'ALL',
    threshold: 80,
    enabled: true,
    sound: true,
    cooldownSec: 120,
    oneShot: false,
    createdAt: Date.now(),
  },
  {
    id: 'preset_daily_stop_loss',
    name: 'Daily Drawdown Circuit Breaker (-$150)',
    type: 'DAILY_LOSS_LIMIT',
    symbol: 'ALL',
    threshold: 150,
    enabled: true,
    sound: true,
    cooldownSec: 600,
    oneShot: false,
    createdAt: Date.now(),
  },
  {
    id: 'preset_regime_volatility',
    name: 'High Volatility Regime Shift',
    type: 'REGIME_CHANGE',
    symbol: 'ALL',
    threshold: 'HIGH_VOLATILITY',
    enabled: false,
    sound: true,
    cooldownSec: 300,
    oneShot: false,
    createdAt: Date.now(),
  },
];

export function loadAlertRules(): AlertRule[] {
  if (typeof window === 'undefined') return DEFAULT_ALERT_PRESETS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RULES);
    if (!raw) return DEFAULT_ALERT_PRESETS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_ALERT_PRESETS;
  } catch {
    return DEFAULT_ALERT_PRESETS;
  }
}

export function saveAlertRules(rules: AlertRule[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(rules));
  } catch (err) {
    console.error('Failed to save alert rules:', err);
  }
}

export function loadAlertHistory(): TriggeredAlert[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveAlertHistory(history: TriggeredAlert[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Keep max 50 recent alerts
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history.slice(0, 50)));
  } catch (err) {
    console.error('Failed to save alert history:', err);
  }
}

export interface EvaluateContext {
  symbol: string;
  currentPrice: number;
  indicators: TechnicalIndicators | null;
  decision: DecisionResult | null;
  aiPrediction: AIPredictionResult | null;
  regime: MarketRegime;
  dailyPnL: number;
}

export function evaluateAlerts(
  rules: AlertRule[],
  context: EvaluateContext,
  onTrigger: (triggered: TriggeredAlert, updatedRule: AlertRule) => void
): void {
  const now = Date.now();

  rules.forEach((rule) => {
    if (!rule.enabled) return;

    // Check symbol match
    if (rule.symbol !== 'ALL' && rule.symbol !== context.symbol) {
      return;
    }

    // Check cooldown
    if (rule.lastTriggered && now - rule.lastTriggered < rule.cooldownSec * 1000) {
      return;
    }

    let isTriggered = false;
    let message = '';
    let severity: 'info' | 'warning' | 'critical' | 'success' = 'info';
    let currentValue: number | string = '';

    switch (rule.type) {
      case 'PRICE_ABOVE': {
        const target = Number(rule.threshold);
        if (context.currentPrice >= target) {
          isTriggered = true;
          severity = 'info';
          currentValue = context.currentPrice;
          message = `${context.symbol} price rose to ${context.currentPrice.toFixed(2)}, crossing target ${target.toFixed(2)}`;
        }
        break;
      }
      case 'PRICE_BELOW': {
        const target = Number(rule.threshold);
        if (context.currentPrice <= target) {
          isTriggered = true;
          severity = 'warning';
          currentValue = context.currentPrice;
          message = `${context.symbol} price dropped to ${context.currentPrice.toFixed(2)}, falling below target ${target.toFixed(2)}`;
        }
        break;
      }
      case 'RSI_OVERBOUGHT': {
        if (context.indicators) {
          const rsi =
            context.indicators.rsiNow ??
            (context.indicators.rsi.length > 0
              ? context.indicators.rsi[context.indicators.rsi.length - 1]
              : null);
          const target = Number(rule.threshold) || 70;
          if (rsi !== null && rsi >= target) {
            isTriggered = true;
            severity = 'warning';
            currentValue = Number(rsi.toFixed(1));
            message = `RSI reached ${rsi.toFixed(1)} on ${context.symbol} (Overbought threshold: ${target})`;
          }
        }
        break;
      }
      case 'RSI_OVERSOLD': {
        if (context.indicators) {
          const rsi =
            context.indicators.rsiNow ??
            (context.indicators.rsi.length > 0
              ? context.indicators.rsi[context.indicators.rsi.length - 1]
              : null);
          const target = Number(rule.threshold) || 30;
          if (rsi !== null && rsi <= target) {
            isTriggered = true;
            severity = 'warning';
            currentValue = Number(rsi.toFixed(1));
            message = `RSI fell to ${rsi.toFixed(1)} on ${context.symbol} (Oversold threshold: ${target})`;
          }
        }
        break;
      }
      case 'AI_CONFIDENCE': {
        if (context.aiPrediction) {
          const conf = context.aiPrediction.confidence_score;
          const target = Number(rule.threshold) || 80;
          if (conf >= target && context.aiPrediction.recommendation !== 'HOLD') {
            isTriggered = true;
            severity = 'success';
            currentValue = `${conf}% ${context.aiPrediction.recommendation}`;
            message = `AI issued high conviction ${context.aiPrediction.recommendation} signal with ${conf}% confidence!`;
          }
        }
        break;
      }
      case 'REGIME_CHANGE': {
        const targetRegime = String(rule.threshold).toUpperCase().replace(/\s+/g, '_');
        const currentRegimeType = context.regime?.type || '';
        if (currentRegimeType.includes(targetRegime) || targetRegime.includes(currentRegimeType)) {
          isTriggered = true;
          severity = 'warning';
          currentValue = currentRegimeType;
          message = `Market regime shifted to ${currentRegimeType} on ${context.symbol}!`;
        }
        break;
      }
      case 'DAILY_LOSS_LIMIT': {
        const lossLimit = Math.abs(Number(rule.threshold));
        if (context.dailyPnL <= -lossLimit) {
          isTriggered = true;
          severity = 'critical';
          currentValue = `-$${Math.abs(context.dailyPnL).toFixed(2)}`;
          message = `Daily drawdown reached -$${Math.abs(context.dailyPnL).toFixed(2)}, breaching maximum risk limit of -$${lossLimit.toFixed(2)}`;
        }
        break;
      }
      case 'DAILY_PROFIT_TARGET': {
        const profitTarget = Math.abs(Number(rule.threshold));
        if (context.dailyPnL >= profitTarget) {
          isTriggered = true;
          severity = 'success';
          currentValue = `+$${context.dailyPnL.toFixed(2)}`;
          message = `Daily profit target reached: +$${context.dailyPnL.toFixed(2)} (Target: +$${profitTarget.toFixed(2)})!`;
        }
        break;
      }
    }

    if (isTriggered) {
      const triggeredAlert: TriggeredAlert = {
        id: `trig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ruleId: rule.id,
        title: rule.name,
        message,
        timestamp: now,
        type: rule.type,
        severity,
        read: false,
        symbol: context.symbol,
        currentValue,
      };

      const updatedRule: AlertRule = {
        ...rule,
        lastTriggered: now,
        enabled: rule.oneShot ? false : rule.enabled,
      };

      if (rule.sound) {
        sound.play('alert');
      }

      onTrigger(triggeredAlert, updatedRule);
    }
  });
}
