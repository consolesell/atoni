import React, { useState } from 'react';
import {
  X,
  Bell,
  BellRing,
  Plus,
  Trash2,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Zap,
  TrendingUp,
  TrendingDown,
  History,
  ShieldAlert,
  Clock,
  Radio,
} from 'lucide-react';
import { AlertRule, TriggeredAlert, AlertType } from '../types/alerts';
import { DEFAULT_ALERT_PRESETS } from '../lib/alertsEngine';
import { sound } from '../lib/soundEngine';

interface AdvancedAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  rules: AlertRule[];
  onUpdateRules: (newRules: AlertRule[]) => void;
  triggeredHistory: TriggeredAlert[];
  onClearHistory: () => void;
  currentSymbol: string;
  currentPrice: number;
}

export const AdvancedAlertsModal: React.FC<AdvancedAlertsModalProps> = ({
  isOpen,
  onClose,
  rules,
  onUpdateRules,
  triggeredHistory,
  onClearHistory,
  currentSymbol,
  currentPrice,
}) => {
  const [activeTab, setActiveTab] = useState<'rules' | 'create' | 'history'>('rules');

  // Form State for creating a new alert
  const [nameInput, setNameInput] = useState('');
  const [typeInput, setTypeInput] = useState<AlertType>('PRICE_ABOVE');
  const [thresholdInput, setThresholdInput] = useState(String(Math.round(currentPrice * 1.01)));
  const [symbolInput, setSymbolInput] = useState(currentSymbol);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [cooldownSec, setCooldownSec] = useState(120);
  const [oneShot, setOneShot] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  // Toggle rule enabled state
  const handleToggleRule = (id: string) => {
    const updated = rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    onUpdateRules(updated);
    sound.play('toggle');
  };

  // Toggle rule sound state
  const handleToggleSound = (id: string) => {
    const updated = rules.map((r) => (r.id === id ? { ...r, sound: !r.sound } : r));
    onUpdateRules(updated);
  };

  // Delete rule
  const handleDeleteRule = (id: string) => {
    const updated = rules.filter((r) => r.id !== id);
    onUpdateRules(updated);
    sound.play('click');
  };

  // Add preset rule
  const handleAddPreset = (preset: AlertRule) => {
    if (rules.some((r) => r.id === preset.id || r.name === preset.name)) {
      setSuccessNotice(`Rule "${preset.name}" is already present!`);
      setTimeout(() => setSuccessNotice(null), 2000);
      return;
    }
    const newRule: AlertRule = {
      ...preset,
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
    };
    onUpdateRules([...rules, newRule]);
    sound.play('trade');
    setSuccessNotice(`Added preset alert: ${preset.name}`);
    setTimeout(() => setSuccessNotice(null), 2000);
  };

  // Create custom rule
  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;

    const newRule: AlertRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: nameInput.trim(),
      type: typeInput,
      symbol: symbolInput,
      threshold: isNaN(Number(thresholdInput)) ? thresholdInput : Number(thresholdInput),
      enabled: true,
      sound: soundEnabled,
      cooldownSec,
      oneShot,
      createdAt: Date.now(),
    };

    onUpdateRules([...rules, newRule]);
    sound.play('trade');
    setNameInput('');
    setSuccessNotice('Alert rule created successfully!');
    setTimeout(() => {
      setSuccessNotice(null);
      setActiveTab('rules');
    }, 1000);
  };

  const enabledCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <BellRing className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-100 font-sans">
                  Advanced Algorithmic Alerts
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  {enabledCount} ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Real-time price thresholds, RSI extremes, AI conviction & drawdown guards
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between px-6 py-2.5 bg-slate-950/60 border-b border-slate-800/80 text-xs font-mono">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('rules')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'rules'
                  ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              Active Rules ({rules.length})
            </button>

            <button
              onClick={() => setActiveTab('create')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'create'
                  ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              New Alert
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Trigger Log ({triggeredHistory.length})
            </button>
          </div>

          {/* Test Sound Button */}
          <button
            type="button"
            onClick={() => sound.play('alert')}
            className="text-[11px] text-slate-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
            title="Test audio alert chime"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Test Sound</span>
          </button>
        </div>

        {/* Success Banner */}
        {successNotice && (
          <div className="px-6 py-2 bg-emerald-950/70 border-b border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{successNotice}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 font-sans text-xs">
          {/* TAB 1: ACTIVE RULES */}
          {activeTab === 'rules' && (
            <div className="flex flex-col gap-4">
              {/* Preset Quick Adders */}
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col gap-2.5">
                <span className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Quick Add Proven Presets
                </span>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_ALERT_PRESETS.map((p) => {
                    const exists = rules.some((r) => r.name === p.name);
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleAddPreset(p)}
                        disabled={exists}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition-all ${
                          exists
                            ? 'bg-slate-900 text-slate-500 border-slate-800 cursor-not-allowed'
                            : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        <Plus className="w-3 h-3" />
                        <span>{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Rules List */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                  Configured Alert Rules
                </span>

                {rules.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 font-mono flex flex-col items-center gap-2">
                    <Bell className="w-8 h-8 opacity-40" />
                    <span>No alert rules configured yet. Click "Quick Add Presets" above or create a new alert.</span>
                  </div>
                ) : (
                  rules.map((rule) => (
                    <div
                      key={rule.id}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-4 transition-all ${
                        rule.enabled
                          ? 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                          : 'bg-slate-950/40 border-slate-900 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggleRule(rule.id)}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors relative flex items-center ${
                            rule.enabled ? 'bg-amber-500' : 'bg-slate-800'
                          }`}
                          title={rule.enabled ? 'Click to disable' : 'Click to enable'}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-slate-950 transition-transform ${
                              rule.enabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>

                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-200 font-sans text-xs">
                              {rule.name}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-slate-900 text-slate-400 border border-slate-800">
                              {rule.symbol}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-amber-950/80 text-amber-400 border border-amber-500/30">
                              {rule.type.replace(/_/g, ' ')}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-3">
                            <span>Threshold: <strong className="text-slate-200">{String(rule.threshold)}</strong></span>
                            <span>•</span>
                            <span>Cooldown: {rule.cooldownSec}s</span>
                            {rule.lastTriggered && (
                              <>
                                <span>•</span>
                                <span className="text-amber-400/80">
                                  Last fired: {new Date(rule.lastTriggered).toLocaleTimeString()}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleSound(rule.id)}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            rule.sound
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-slate-900 text-slate-500 border-slate-800'
                          }`}
                          title={rule.sound ? 'Sound alert enabled' : 'Muted'}
                        >
                          {rule.sound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                        </button>

                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/50 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors"
                          title="Delete rule"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CREATE ALERT */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateRule} className="flex flex-col gap-4 font-mono">
              <div className="flex flex-col gap-1.5">
                <label className="text-slate-300 font-medium">Alert Name</label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="e.g. Volatility 25 Target Spike Alert"
                  className="bg-slate-950 border border-slate-700 hover:border-amber-500/50 focus:border-amber-500 text-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-300 font-medium">Condition Type</label>
                  <select
                    value={typeInput}
                    onChange={(e) => {
                      const newType = e.target.value as AlertType;
                      setTypeInput(newType);
                      if (newType === 'RSI_OVERBOUGHT') setThresholdInput('70');
                      else if (newType === 'RSI_OVERSOLD') setThresholdInput('30');
                      else if (newType === 'AI_CONFIDENCE') setThresholdInput('80');
                      else if (newType === 'DAILY_LOSS_LIMIT') setThresholdInput('100');
                      else if (newType === 'DAILY_PROFIT_TARGET') setThresholdInput('200');
                      else if (newType === 'REGIME_CHANGE') setThresholdInput('Extreme Volatility');
                      else setThresholdInput(String(Math.round(currentPrice * 1.01)));
                    }}
                    className="bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none"
                  >
                    <option value="PRICE_ABOVE">Price Crosses Above</option>
                    <option value="PRICE_BELOW">Price Drops Below</option>
                    <option value="RSI_OVERBOUGHT">RSI Overbought (&gt;=)</option>
                    <option value="RSI_OVERSOLD">RSI Oversold (&lt;=)</option>
                    <option value="AI_CONFIDENCE">AI Conviction Score (&gt;=%)</option>
                    <option value="DAILY_LOSS_LIMIT">Daily Drawdown Stop Loss (-$)</option>
                    <option value="DAILY_PROFIT_TARGET">Daily Profit Target (+$)</option>
                    <option value="REGIME_CHANGE">Market Regime Change</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-300 font-medium">Target Asset / Symbol</label>
                  <select
                    value={symbolInput}
                    onChange={(e) => setSymbolInput(e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none"
                  >
                    <option value="ALL">All Active Symbols</option>
                    <option value={currentSymbol}>Current Symbol ({currentSymbol})</option>
                    <option value="R_10">Volatility 10 Index</option>
                    <option value="R_25">Volatility 25 Index</option>
                    <option value="R_50">Volatility 50 Index</option>
                    <option value="R_100">Volatility 100 Index</option>
                    <option value="frxEURUSD">EUR/USD</option>
                    <option value="frxGBPUSD">GBP/USD</option>
                    <option value="frxUSDJPY">USD/JPY</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-300 font-medium">
                    {typeInput === 'REGIME_CHANGE'
                      ? 'Target Regime Name'
                      : typeInput.includes('RSI')
                      ? 'RSI Value (0-100)'
                      : typeInput.includes('CONFIDENCE')
                      ? 'Confidence %'
                      : 'Threshold Value'}
                  </label>
                  {typeInput === 'REGIME_CHANGE' ? (
                    <select
                      value={thresholdInput}
                      onChange={(e) => setThresholdInput(e.target.value)}
                      className="bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none"
                    >
                      <option value="Extreme Volatility">Extreme Volatility</option>
                      <option value="Trending Bullish">Trending Bullish</option>
                      <option value="Trending Bearish">Trending Bearish</option>
                      <option value="Mean Reverting">Mean Reverting</option>
                      <option value="High Volatility Breakout">High Volatility Breakout</option>
                    </select>
                  ) : (
                    <input
                      type="number"
                      step="any"
                      value={thresholdInput}
                      onChange={(e) => setThresholdInput(e.target.value)}
                      className="bg-slate-950 border border-slate-700 hover:border-amber-500/50 focus:border-amber-500 text-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none"
                      required
                    />
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-300 font-medium">Cooldown Period</label>
                  <select
                    value={cooldownSec}
                    onChange={(e) => setCooldownSec(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none"
                  >
                    <option value={60}>1 Minute</option>
                    <option value={120}>2 Minutes</option>
                    <option value={300}>5 Minutes</option>
                    <option value={600}>10 Minutes</option>
                  </select>
                </div>
              </div>

              {/* Checkboxes */}
              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0"
                  />
                  <span>Play audio alert chime</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={oneShot}
                    onChange={(e) => setOneShot(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0"
                  />
                  <span>One-shot (auto-disable after firing)</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800 mt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('rules')}
                  className="px-4 py-2 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all"
                >
                  Save Alert Rule
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: TRIGGERED HISTORY */}
          {activeTab === 'history' && (
            <div className="flex flex-col gap-3 font-mono">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs text-slate-400 font-bold">
                  Recent Triggered Notifications ({triggeredHistory.length})
                </span>
                {triggeredHistory.length > 0 && (
                  <button
                    onClick={onClearHistory}
                    className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear History</span>
                  </button>
                )}
              </div>

              {triggeredHistory.length === 0 ? (
                <div className="p-8 text-center text-slate-500 flex flex-col items-center gap-2">
                  <History className="w-8 h-8 opacity-40" />
                  <span>No alerts have triggered yet. Active rules will log here when conditions are met.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {triggeredHistory.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl flex items-start gap-3"
                    >
                      <div
                        className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                          item.severity === 'critical'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                            : item.severity === 'warning'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                        }`}
                      >
                        <Bell className="w-3.5 h-3.5" />
                      </div>

                      <div className="flex-1 flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-200 text-xs">{item.title}</span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 font-sans">{item.message}</p>
                        {item.currentValue && (
                          <span className="text-[10px] text-amber-400/80">
                            Recorded value: {String(item.currentValue)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
