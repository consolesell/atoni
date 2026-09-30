export type AlertType =
  | 'PRICE_ABOVE'
  | 'PRICE_BELOW'
  | 'RSI_OVERBOUGHT'
  | 'RSI_OVERSOLD'
  | 'AI_CONFIDENCE'
  | 'REGIME_CHANGE'
  | 'DAILY_LOSS_LIMIT'
  | 'DAILY_PROFIT_TARGET';

export interface AlertRule {
  id: string;
  name: string;
  type: AlertType;
  symbol: string; // e.g. 'R_25' or 'ALL'
  threshold: number | string;
  enabled: boolean;
  sound: boolean;
  browserNotification?: boolean;
  lastTriggered?: number;
  cooldownSec: number;
  oneShot: boolean;
  createdAt: number;
}

export interface TriggeredAlert {
  id: string;
  ruleId: string;
  title: string;
  message: string;
  timestamp: number;
  type: AlertType;
  severity: 'info' | 'warning' | 'critical' | 'success';
  read: boolean;
  symbol?: string;
  currentValue?: number | string;
}
