import React, { useState } from 'react';
import {
  Sparkles,
  TrendingUp,
  Brain,
  ShieldCheck,
  Mic,
  ChevronRight,
  ChevronLeft,
  X,
  CheckCircle2,
  Cpu,
  Layers,
  Zap,
} from 'lucide-react';
import { sound } from '../lib/soundEngine';

interface OnboardingTourModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TourStep {
  title: string;
  badge: string;
  icon: React.ReactNode;
  description: string;
  keyFeatures: string[];
  actionHint: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'High-Speed Live Terminal & Deriv Data Streams',
    badge: 'Step 1 of 5 • Terminal Ingestion',
    icon: <TrendingUp className="w-8 h-8 text-cyan-400" />,
    description:
      'sbatomic4.1 connects directly to Deriv WebSockets for millisecond-level tick ingestion across Volatility 10 to 100 indices, with automatic exponential backoff resilience and tick buffering.',
    keyFeatures: [
      'Zero-latency spot ticks and live candle generation',
      'Dual Virtual Sandbox ($10.00 USD anchor) and Real Deriv account switching',
      'Continuous ping/pong heartbeat watchdog monitoring',
    ],
    actionHint: 'Look at the top navbar to switch markets or inspect latency in real time.',
  },
  {
    title: 'Interactive Chart, HTF Overlays & Agent-Vote Badges',
    badge: 'Step 2 of 5 • Visualization Suite',
    icon: <Layers className="w-8 h-8 text-purple-400" />,
    description:
      'Experience zero-blanking canvas charting with Multi-Timeframe EMA200 corridors, Side Volume Profile (POC), and individual agent BUY/SELL/HOLD decision badges overlaid directly on candles.',
    keyFeatures: [
      'Interactive Agent-Vote annotations with hover details',
      'Persistent drawings synced to localStorage & Firebase Firestore',
      'Decoupled ResizeObserver engine to eliminate canvas tearing or loop errors',
    ],
    actionHint: 'Use the drawing pencil and indicator menu on the chart toolbar to customize your layout.',
  },
  {
    title: 'Autonomous Blackbox Hub & 3D Holographic Spatial Core',
    badge: 'Step 3 of 5 • Spatial Intelligence',
    icon: <Cpu className="w-8 h-8 text-blue-400" />,
    description:
      'The Blackbox Intelligence Hub encapsulates 4 autonomous subagents (Executive, Sniper, Quant, Neural Co-Pilot) rendered inside a futuristic 3D Holographic engine powered by Three.js.',
    keyFeatures: [
      'Dynamic Phase-Space Attractor Torus reacting to live market entropy',
      'Satellite Subagent orbital nodes with laser data stream conduits',
      'Celestial consensus sphere showing vector alignment towards BUY or SELL poles',
    ],
    actionHint: 'Toggle between Spatial Metrics, Blackbox Core, and Consensus views on the 3D Hologram.',
  },
  {
    title: 'Dynamic Half-Kelly Sizing & 5% Session Drawdown Shield',
    badge: 'Step 4 of 5 • Quantitative Risk Defense',
    icon: <ShieldCheck className="w-8 h-8 text-emerald-400" />,
    description:
      'Capital preservation is mathematically guaranteed through dynamic Half-Kelly Criterion stake optimization and hard circuit-breaker enforcement defined in sbagent.md.',
    keyFeatures: [
      'Automatic Half-Kelly stake calculation based on historical session win probability',
      'Hard 5% session drawdown ceiling that halts all autonomous firing upon breach',
      'Portfolio exposure caps and correlation-aware rotation to prevent over-leverage',
    ],
    actionHint: 'Audit your current Kelly stake and drawdown bounds on the Risk Panel.',
  },
  {
    title: 'AI Copilot Token Streaming & Studio Neural Voice',
    badge: 'Step 5 of 5 • Hands-Free Co-Pilot',
    icon: <Mic className="w-8 h-8 text-amber-400" />,
    description:
      'Interact with SBAgent using real-time Gemini token streaming, conversational progressive rendering, and studio-quality Kokoro-82M neural voice synthesis with rich spoken trade commands.',
    keyFeatures: [
      'Real-time token streaming with live tool dispatch and abort support',
      'Rich voice commands: "Rotate to Volatility 75", "Tighten stop", "Show agent votes"',
      'Fine-grained synthesizer sliders for pitch, rate, stability, clarity, and emotion',
    ],
    actionHint: 'Tap the mic icon in the AI Copilot to issue your first voice command hands-free.',
  },
];

export const OnboardingTourModal: React.FC<OnboardingTourModalProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const step = TOUR_STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  const handleNext = () => {
    sound.play('click');
    if (isLast) {
      onClose();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    sound.play('click');
    if (!isFirst) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl flex flex-col text-slate-100 overflow-hidden">
        {/* Top Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shadow-md">
              <Sparkles className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 font-sans">sbatomic4.1 Interactive Tour</h2>
              <span className="text-[10px] font-mono text-cyan-400">{step.badge}</span>
            </div>
          </div>

          <button
            onClick={() => {
              sound.play('click');
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Body */}
        <div className="p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl shrink-0 shadow-lg">
              {step.icon}
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-white font-sans">{step.title}</h3>
              <p className="text-xs text-slate-400 font-sans leading-relaxed">{step.description}</p>
            </div>
          </div>

          {/* Key Bullet Features */}
          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 space-y-2">
            <div className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider">
              Core Architectural Highlights:
            </div>
            <ul className="space-y-1.5">
              {step.keyFeatures.map((feat, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs text-slate-300 font-sans">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Tactical Hint */}
          <div className="p-3 bg-cyan-950/30 border border-cyan-500/30 rounded-xl text-xs text-cyan-300 font-mono flex items-center gap-2">
            <Zap className="w-4 h-4 shrink-0 text-cyan-400" />
            <span>{step.actionHint}</span>
          </div>

          {/* Step Progress Indicators */}
          <div className="flex items-center justify-center gap-1.5 pt-1">
            {TOUR_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={`h-1.5 rounded-full transition-all ${
                  currentStep === i ? 'w-8 bg-cyan-400' : 'w-2 bg-slate-700 hover:bg-slate-600'
                }`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={handlePrev}
            disabled={isFirst}
            className="px-3.5 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 text-xs font-mono font-semibold flex items-center gap-1.5 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>

          <button
            onClick={handleNext}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 text-xs font-bold font-mono flex items-center gap-2 shadow-lg shadow-cyan-500/25 transition-all"
          >
            <span>{isLast ? 'Complete Onboarding' : 'Next Step'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
