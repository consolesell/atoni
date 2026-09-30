import React, { useState, useEffect } from 'react';
import {
  Bot,
  Save,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Code,
  FileText,
  Zap,
  Shuffle,
  Clock,
  ShieldCheck,
  RotateCcw,
  Sliders,
  ExternalLink,
} from 'lucide-react';
import { BotState } from '../types/trading';
import { sound } from '../lib/soundEngine';

interface SubAgentSettingsViewProps {
  botState: BotState;
  onUpdateBotState: (updates: Partial<BotState>) => void;
  selectedSymbol: string;
  onSymbolChange: (symbol: string) => void;
  isAutonomousRunning?: boolean;
  onToggleAutonomous?: () => void;
  onOpenFullModal?: () => void;
}

const DEFAULT_ROTATION_SYMBOLS = [
  '1HZ10V',
  '1HZ25V',
  '1HZ50V',
  '1HZ75V',
  '1HZ100V',
  'R_10',
  'R_25',
  'R_50',
  'R_75',
  'R_100',
];

export const SubAgentSettingsView: React.FC<SubAgentSettingsViewProps> = ({
  botState,
  onUpdateBotState,
  selectedSymbol,
  onSymbolChange,
  isAutonomousRunning,
  onToggleAutonomous,
  onOpenFullModal,
}) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const allowedSymbols = botState.allowedRotationSymbols || DEFAULT_ROTATION_SYMBOLS;
  const isAutoRotationEnabled = botState.autonomousSymbolChange ?? true;

  // Fetch live sbagent.md content
  const fetchScript = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/subagent/script');
      const data = await res.json();
      if (data.success) {
        setContent(data.content);
      }
    } catch (err) {
      console.error('Failed to load sbagent.md:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScript();
  }, []);

  // Save updated sbagent.md
  const handleSave = async () => {
    setSaving(true);
    try {
      sound.play('click');
      const res = await fetch('/api/subagent/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.success) {
        sound.play('win');
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save sbagent.md:', err);
      sound.play('alert');
    } finally {
      setSaving(false);
    }
  };

  // Trigger on-demand symbol hunt & auto-rotation
  const handleTriggerAutoRotation = async () => {
    setScanning(true);
    setScanMessage(null);
    sound.play('click');
    try {
      const res = await fetch('/api/subagent/scan-symbols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentSymbol: selectedSymbol,
          candidateSymbols: allowedSymbols,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.shouldRotate && data.topCandidate !== selectedSymbol) {
          onSymbolChange(data.topCandidate);
          onUpdateBotState({
            lastSymbolRotationTime: Date.now(),
            lastRotationReason: data.rotationReason,
          });
          sound.play('win');
          setScanMessage(`Autonomously rotated to ${data.topCandidate}: ${data.rotationReason}`);
        } else {
          setScanMessage(`Current market (${selectedSymbol}) remains optimal. No rotation required.`);
        }
      }
    } catch (err: any) {
      setScanMessage(`Scan error: ${err.message}`);
    } finally {
      setScanning(false);
    }
  };

  // Toggle candidate symbol in allowed list
  const toggleSymbol = (sym: string) => {
    let next: string[];
    if (allowedSymbols.includes(sym)) {
      if (allowedSymbols.length <= 1) return; // Keep at least one
      next = allowedSymbols.filter((s) => s !== sym);
    } else {
      next = [...allowedSymbols, sym];
    }
    onUpdateBotState({ allowedRotationSymbols: next });
    sound.play('click');
  };

  // Quick insertion helpers
  const insertRule = (snippet: string) => {
    setContent((prev) => prev + '\n\n' + snippet);
    sound.play('click');
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Header Banner */}
      <div className="bg-slate-950/70 p-3.5 rounded-xl border border-cyan-500/20 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-white">sbagent.md Autonomous Engine</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                v3.1.0-Kelly
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Live strategy definition, dynamic symbol rotation & creator configuration.
            </p>
          </div>
        </div>

        {onOpenFullModal && (
          <button
            onClick={onOpenFullModal}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            title="Open Full SubAgent Studio"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 1. Autonomous Symbol Rotation Controls */}
      <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shuffle className="w-4 h-4 text-purple-400" />
            <div>
              <span className="font-bold text-slate-200 block text-sm">Autonomous Symbol Change</span>
              <span className="text-[11px] text-slate-400">
                Agent autonomously switches market when chop or low-volatility trap is detected
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              onUpdateBotState({ autonomousSymbolChange: !isAutoRotationEnabled });
              sound.play('toggle');
            }}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              isAutoRotationEnabled ? 'bg-purple-500' : 'bg-slate-800'
            }`}
          >
            <span
              className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                isAutoRotationEnabled ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>

        {/* Scan & Rotate Now Button */}
        <div className="pt-1 flex items-center gap-2">
          <button
            onClick={handleTriggerAutoRotation}
            disabled={scanning}
            className="flex-1 py-2 px-3 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? 'Hunting Volatility Edge...' : 'Hunt & Rotate Symbol Now'}</span>
          </button>
        </div>

        {scanMessage && (
          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-cyan-300 animate-fade-in">
            {scanMessage}
          </div>
        )}

        {/* Rotation Candidate Indices Selector */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Allowed Rotation Synthetic Indices ({allowedSymbols.length} active)</span>
            <span className="font-mono text-cyan-400">Current: {selectedSymbol}</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_ROTATION_SYMBOLS.map((sym) => {
              const active = allowedSymbols.includes(sym);
              const isCurrent = sym === selectedSymbol;
              return (
                <button
                  key={sym}
                  onClick={() => toggleSymbol(sym)}
                  className={`px-2 py-1 rounded-md font-mono font-bold text-[11px] transition-all flex items-center gap-1 ${
                    isCurrent
                      ? 'bg-cyan-500 text-slate-950 ring-1 ring-cyan-300 shadow-sm'
                      : active
                      ? 'bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-600'
                      : 'bg-slate-950 text-slate-500 border border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <span>{sym}</span>
                  {isCurrent && <span className="text-[9px]">★</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Rotation Cooldown Setting */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-slate-400 text-[11px]">
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Min Rotation Cooldown:</span>
          </div>
          <div className="flex items-center gap-1">
            {[30, 60, 120, 300].map((sec) => (
              <button
                key={sec}
                onClick={() => {
                  onUpdateBotState({ rotationCooldownSeconds: sec });
                  sound.play('click');
                }}
                className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                  (botState.rotationCooldownSeconds || 60) === sec
                    ? 'bg-purple-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {sec}s
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Full Live sbagent.md Markdown Editor */}
      <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <span className="font-bold text-slate-200 text-sm">sbagent.md Strategy Specification</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={fetchScript}
              disabled={loading}
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
              title="Reload from disk"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs flex items-center gap-1 transition-all shadow-md shadow-cyan-950/40 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save & Reload'}</span>
            </button>
          </div>
        </div>

        {saveSuccess && (
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-[11px] animate-fade-in">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>sbagent.md successfully updated & hot-reloaded!</span>
          </div>
        )}

        {/* Quick Rule Inserter Chips */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] text-slate-500 font-mono">Insert Directive:</span>
          <button
            onClick={() =>
              insertRule(
                `### 🔄 Dynamic Symbol Rotation Clause\n- Autonomous Hunt: Active across ${allowedSymbols.join(', ')}\n- Rotate on BB Squeeze (< 0.0018) or RSI Chop (48-52).\n- Cooldown: 60s minimum.`
              )
            }
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-purple-300 font-mono text-[10px] border border-slate-700"
          >
            + Auto-Rotation Rule
          </button>
          <button
            onClick={() =>
              insertRule(
                `### 📐 Half-Kelly Risk Directive\n- Stake Bounds: 1.0% to 2.5% max portfolio equity.\n- If consecutive losses >= 2, scale down immediately to Quarter-Kelly.`
              )
            }
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-[10px] border border-slate-700"
          >
            + Half-Kelly Rule
          </button>
          <button
            onClick={() =>
              insertRule(
                `### 🛡️ Drawdown Circuit Breaker\n- Halt all autonomous execution if session peak drawdown exceeds 5.0%.`
              )
            }
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-rose-300 font-mono text-[10px] border border-slate-700"
          >
            + Max Drawdown Stop
          </button>
        </div>

        {/* Code/Markdown Textarea */}
        <div className="relative">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={loading}
            rows={14}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] leading-relaxed text-slate-200 focus:outline-none focus:border-cyan-500 resize-y shadow-inner"
            placeholder="Loading sbagent.md..."
          />
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 px-1">
            <span>Lines: {content.split('\n').length} | Characters: {content.length}</span>
            <span>Target File: /sbagent.md</span>
          </div>
        </div>
      </div>
    </div>
  );
};
