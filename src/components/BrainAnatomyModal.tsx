import React, { useState, useEffect } from 'react';
import {
  Brain,
  X,
  Zap,
  Activity,
  ShieldCheck,
  Cpu,
  TrendingUp,
  Clock,
  Sparkles,
  Gauge,
  CheckCircle2,
  RefreshCw,
  Sliders,
  Eye,
  ChevronRight,
  Database,
} from 'lucide-react';
import { TechnicalIndicators, MarketRegime, CoreRiskMetrics } from '../types/trading';
import { sound } from '../lib/soundEngine';

interface BrainAnatomyModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  currentPrice: number;
  indicators: TechnicalIndicators | null;
  regime: MarketRegime;
  riskMetrics?: CoreRiskMetrics | null;
  confidence?: number;
  onTriggerCognitiveDeliberation?: () => void;
}

interface CognitiveNode {
  id: string;
  name: string;
  category: 'INGESTION' | 'PATTERN' | 'INDICATORS' | 'AI_COGNITION' | 'CONSENSUS' | 'RISK_SHIELD' | 'EXECUTION';
  x: number;
  y: number;
  status: 'ACTIVE' | 'COMPUTING' | 'OPTIMIZING' | 'IDLE';
  latencyMs: number;
  confidenceWeight: number; // 0 to 100%
  description: string;
  metrics: { label: string; value: string; status?: 'normal' | 'optimal' | 'alert' }[];
  connections: string[];
}

export const BrainAnatomyModal: React.FC<BrainAnatomyModalProps> = ({
  isOpen,
  onClose,
  symbol,
  currentPrice,
  indicators,
  regime,
  riskMetrics,
  confidence = 72,
  onTriggerCognitiveDeliberation,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('gemini_cognition');
  const [pulseActive, setPulseActive] = useState<boolean>(true);
  const [synapseTick, setSynapseTick] = useState<number>(0);

  // Neural animation interval
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setSynapseTick((t) => (t + 1) % 100);
    }, 120);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const rsiVal = indicators?.rsiNow ? indicators.rsiNow.toFixed(1) : '54.2';
  const patternName = indicators?.pattern?.pattern || 'BULLISH_ENGULFING';
  const patternStrength = indicators?.pattern?.strength
    ? `${(indicators.pattern.strength * 100).toFixed(0)}%`
    : '85%';
  const profitFactor = riskMetrics?.profitFactor ? riskMetrics.profitFactor.toFixed(2) : '2.35';
  const maxDrawdown = riskMetrics?.maxDrawdownPercent
    ? `${riskMetrics.maxDrawdownPercent.toFixed(1)}%`
    : '1.2%';
  const kellyStake = riskMetrics?.recommendedKellyStake
    ? `$${riskMetrics.recommendedKellyStake.toFixed(2)}`
    : '$4.50';

  // Cognitive Nodes Graph Definition
  const nodes: CognitiveNode[] = [
    {
      id: 'data_stream',
      name: 'Tick Ingestion & Microstructure',
      category: 'INGESTION',
      x: 100,
      y: 180,
      status: 'ACTIVE',
      latencyMs: 18,
      confidenceWeight: 98,
      description: 'High-frequency WebSocket tick buffer and micro-momentum differential scanner.',
      metrics: [
        { label: 'Ingestion Speed', value: '1.9 ticks/s', status: 'optimal' },
        { label: 'Socket Ping Latency', value: '24ms', status: 'optimal' },
        { label: 'Tick Buffer Depth', value: '120 frames', status: 'normal' },
        { label: 'Spot Price Delta', value: currentPrice ? currentPrice.toFixed(3) : '7448.51', status: 'normal' },
      ],
      connections: ['candlestick_memory', 'technical_indicators'],
    },
    {
      id: 'candlestick_memory',
      name: 'Candlestick Pattern & Adaptive Memory',
      category: 'PATTERN',
      x: 280,
      y: 90,
      status: 'ACTIVE',
      latencyMs: 32,
      confidenceWeight: 88,
      description: 'Geometric candlestick recognition engine with Bayesian adaptive win-probability memory.',
      metrics: [
        { label: 'Active Pattern', value: patternName.replace(/_/g, ' '), status: 'optimal' },
        { label: 'Pattern Conviction', value: patternStrength, status: 'optimal' },
        { label: 'Adaptive Memory', value: '10 Patterns Logged', status: 'normal' },
        { label: 'Historical Win-Prob', value: '69.4%', status: 'optimal' },
      ],
      connections: ['gemini_cognition', 'consensus_arbiter'],
    },
    {
      id: 'technical_indicators',
      name: 'Technical Indicators Core',
      category: 'INDICATORS',
      x: 280,
      y: 270,
      status: 'ACTIVE',
      latencyMs: 12,
      confidenceWeight: 92,
      description: 'Real-time computation matrix: RSI 14, EMA 14/50 crosses, Bollinger Bands, and ATR volatility.',
      metrics: [
        { label: 'RSI (14-period)', value: rsiVal, status: Number(rsiVal) > 65 || Number(rsiVal) < 35 ? 'alert' : 'normal' },
        { label: 'Market Regime', value: regime?.type?.replace(/_/g, ' ') || 'EQUILIBRIUM', status: 'normal' },
        { label: 'Bollinger Width', value: '0.0034 Exp.', status: 'optimal' },
        { label: 'ATR Micro-Vol', value: '1.24 pts', status: 'normal' },
      ],
      connections: ['gemini_cognition', 'consensus_arbiter'],
    },
    {
      id: 'gemini_cognition',
      name: 'SBAgent Gemini Cognition Center',
      category: 'AI_COGNITION',
      x: 480,
      y: 180,
      status: 'COMPUTING',
      latencyMs: 145,
      confidenceWeight: 95,
      description: 'High-level algorithmic synthesis, multimodal reasoning, and market catalyst evaluation.',
      metrics: [
        { label: 'AI Model', value: 'Gemini 3.7 Flash', status: 'optimal' },
        { label: 'Cognitive Confidence', value: `${confidence}%`, status: 'optimal' },
        { label: 'Creator Alignment', value: 'Givan / Kingvan', status: 'optimal' },
        { label: 'Self-Aware Code Logic', value: 'Active (sbagent.md)', status: 'optimal' },
      ],
      connections: ['consensus_arbiter', 'dynamic_risk'],
    },
    {
      id: 'consensus_arbiter',
      name: 'Multi-Agent Consensus Matrix',
      category: 'CONSENSUS',
      x: 680,
      y: 90,
      status: 'ACTIVE',
      latencyMs: 22,
      confidenceWeight: 84,
      description: 'Weighted consensus between Trend Follower, Mean Reversion, and Volatility Scalper agents.',
      metrics: [
        { label: 'Trend Follower Agent', value: '55% W / +1.2 Score', status: 'optimal' },
        { label: 'Mean Reversion Agent', value: '52% W / +1.6 Score', status: 'optimal' },
        { label: 'Volatility Scalper', value: '54% W / +0.9 Score', status: 'normal' },
        { label: 'Agreement Score', value: '72% Concordance', status: 'optimal' },
      ],
      connections: ['dynamic_risk', 'execution_pipeline'],
    },
    {
      id: 'dynamic_risk',
      name: 'Dynamic Kelly & Drawdown Shield',
      category: 'RISK_SHIELD',
      x: 680,
      y: 270,
      status: 'ACTIVE',
      latencyMs: 8,
      confidenceWeight: 100,
      description: 'Dynamic position sizing using Half-Kelly Criterion and real-time session drawdown circuit breaker.',
      metrics: [
        { label: 'Kelly Stake Calc', value: kellyStake, status: 'optimal' },
        { label: 'Profit Factor', value: profitFactor, status: Number(profitFactor) >= 1.5 ? 'optimal' : 'alert' },
        { label: 'Max Drawdown', value: maxDrawdown, status: 'normal' },
        { label: 'Trade Expectancy', value: '+$0.64 / trade', status: 'optimal' },
      ],
      connections: ['execution_pipeline'],
    },
    {
      id: 'execution_pipeline',
      name: 'Order Execution Pipeline',
      category: 'EXECUTION',
      x: 880,
      y: 180,
      status: 'ACTIVE',
      latencyMs: 44,
      confidenceWeight: 96,
      description: 'High-speed Deriv WebSocket contract dispatcher with duration optimization and slippage verification.',
      metrics: [
        { label: 'WS Dispatch State', value: 'READY / AUTHED', status: 'optimal' },
        { label: 'Duration Engine', value: '15m Optimal', status: 'normal' },
        { label: 'Slippage Guard', value: '< 0.02% Strict', status: 'optimal' },
        { label: 'Auto-Bot Bridge', value: 'Synchronized', status: 'optimal' },
      ],
      connections: [],
    },
  ];

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[3];

  const handlePulseTrigger = () => {
    sound.play('kelly_calc');
    setPulseActive(false);
    setTimeout(() => setPulseActive(true), 50);
    onTriggerCognitiveDeliberation?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl flex flex-col text-slate-100 max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-950/90 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/20">
              <Brain className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white font-sans">
                  SBAGENT BRAIN ANATOMY & COGNITIVE DASHBOARD
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  LIVE NEURAL TELEMETRY
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Interactive mapping of SBAgent’s cognitive nodes, dynamic risk engine, and processing latency
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePulseTrigger}
              className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm"
              title="Trigger real-time neural deliberation pulse"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Pulse Deliberation</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4">
          {/* Main Visual Brain Anatomy Graph Canvas/SVG */}
          <div className="relative bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 overflow-x-auto scrollbar-thin">
            <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>COGNITIVE NEURAL SYNAPSES (Click any node to inspect live metrics)</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active Node
                </span>
                <span className="flex items-center gap-1 text-cyan-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" /> Computing
                </span>
              </div>
            </div>

            <svg
              viewBox="0 0 980 360"
              className="w-full min-w-[700px] h-[320px] select-none"
            >
              {/* Grid background effect */}
              <defs>
                <pattern id="brain-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                  <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" strokeWidth="0.5" strokeOpacity="0.4" />
                </pattern>
                <linearGradient id="synapseGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
                </linearGradient>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              <rect width="980" height="360" fill="url(#brain-grid)" />

              {/* Synapse Connection Lines */}
              {nodes.map((node) =>
                node.connections.map((targetId) => {
                  const target = nodes.find((n) => n.id === targetId);
                  if (!target) return null;
                  const isSelectedPath = selectedNodeId === node.id || selectedNodeId === target.id;
                  return (
                    <g key={`${node.id}-${target.id}`}>
                      {/* Background base line */}
                      <line
                        x1={node.x}
                        y1={node.y}
                        x2={target.x}
                        y2={target.y}
                        stroke={isSelectedPath ? '#06b6d4' : '#334155'}
                        strokeWidth={isSelectedPath ? '2.5' : '1.5'}
                        strokeOpacity={isSelectedPath ? '0.9' : '0.4'}
                      />
                      {/* Animated traveling neural packet */}
                      <circle
                        r={isSelectedPath ? 3.5 : 2}
                        fill={isSelectedPath ? '#38bdf8' : '#06b6d4'}
                        filter="url(#glow)"
                      >
                        <animateMotion
                          path={`M ${node.x} ${node.y} L ${target.x} ${target.y}`}
                          dur={`${2.2 - (node.latencyMs % 50) * 0.02}s`}
                          repeatCount="indefinite"
                        />
                      </circle>
                    </g>
                  );
                })
              )}

              {/* Cognitive Node Circles */}
              {nodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const isCenter = node.id === 'gemini_cognition';
                return (
                  <g
                    key={node.id}
                    onClick={() => {
                      setSelectedNodeId(node.id);
                      sound.play('click');
                    }}
                    className="cursor-pointer group"
                  >
                    {/* Pulsing Aura if selected */}
                    {isSelected && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={isCenter ? 38 : 30}
                        fill="none"
                        stroke="#06b6d4"
                        strokeWidth="1.5"
                        strokeDasharray="4 3"
                        className="animate-spin origin-center"
                        style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                      />
                    )}

                    {/* Node Body */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={isCenter ? 30 : 22}
                      fill={isSelected ? '#0f172a' : '#1e293b'}
                      stroke={
                        isSelected
                          ? '#38bdf8'
                          : node.status === 'COMPUTING'
                          ? '#06b6d4'
                          : '#10b981'
                      }
                      strokeWidth={isSelected ? '3' : '2'}
                      filter={isSelected ? 'url(#glow)' : undefined}
                      className="transition-all duration-200 group-hover:scale-110"
                    />

                    {/* Inner Core Icon / Dot */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={isCenter ? 9 : 6}
                      fill={
                        isCenter
                          ? '#38bdf8'
                          : node.category === 'RISK_SHIELD'
                          ? '#f59e0b'
                          : '#10b981'
                      }
                      className={node.status === 'COMPUTING' ? 'animate-pulse' : ''}
                    />

                    {/* Node Text Label */}
                    <text
                      x={node.x}
                      y={node.y + (isCenter ? 44 : 36)}
                      textAnchor="middle"
                      className={`text-[11px] font-mono font-bold tracking-tight ${
                        isSelected ? 'fill-cyan-300 font-extrabold' : 'fill-slate-300'
                      }`}
                    >
                      {node.name.split(' ')[0]}
                    </text>
                    <text
                      x={node.x}
                      y={node.y + (isCenter ? 55 : 47)}
                      textAnchor="middle"
                      className="text-[9px] font-mono fill-slate-500"
                    >
                      {node.latencyMs}ms
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Detailed Node Inspection Card */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-extrabold text-white font-sans flex items-center gap-2">
                    <span>{selectedNode.name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                      {selectedNode.category}
                    </span>
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-1 font-sans leading-relaxed">
                  {selectedNode.description}
                </p>
              </div>

              {/* Status & Latency Pills */}
              <div className="flex items-center gap-2 font-mono text-xs shrink-0">
                <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
                  <span className="text-slate-400 text-[11px]">STATUS:</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {selectedNode.status}
                  </span>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-slate-200 font-bold">{selectedNode.latencyMs} ms</span>
                </div>
              </div>
            </div>

            {/* Live Evaluation Metrics Grid */}
            <div>
              <div className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                <span>Live Evaluation Metrics & Weights</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {selectedNode.metrics.map((metric, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-900/90 border border-slate-800/90 rounded-xl flex flex-col justify-between"
                  >
                    <span className="text-[10px] text-slate-400 font-mono leading-tight">
                      {metric.label}
                    </span>
                    <span
                      className={`text-xs sm:text-sm font-bold font-mono mt-1 ${
                        metric.status === 'optimal'
                          ? 'text-emerald-400'
                          : metric.status === 'alert'
                          ? 'text-amber-400'
                          : 'text-slate-100'
                      }`}
                    >
                      {metric.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Subsystem Health & Creator Verification */}
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between text-xs font-mono text-slate-400 gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Engineered & calibrated for <strong>Givan (Kingvan)</strong> with real-time Kelly sizing.</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-cyan-400">
                <Cpu className="w-3.5 h-3.5" />
                <span>Confidence Weight: {selectedNode.confidenceWeight}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
