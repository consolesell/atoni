import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle, Activity, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackSymbol?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  errorInfo: string | null;
  errorStack: string | null;
  autoRetries: number;
  isAutoRecovering: boolean;
  showDetails: boolean;
}

export class ChartErrorBoundary extends Component<Props, State> {
  private autoRecoveryTimer: NodeJS.Timeout | null = null;
  private lastErrorTime: number = 0;

  public state: State = {
    hasError: false,
    errorInfo: null,
    errorStack: null,
    autoRetries: 0,
    isAutoRecovering: false,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      errorInfo: error.message || 'Unknown chart rendering issue',
      errorStack: error.stack || null,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('ChartErrorBoundary caught error:', error, errorInfo);
    const now = Date.now();

    // Reset retry counter if previous error was > 45s ago
    let nextRetries = this.state.autoRetries + 1;
    if (now - this.lastErrorTime > 45000) {
      nextRetries = 1;
    }
    this.lastErrorTime = now;

    // Automatic seamless self-healing: Attempt automatic recovery up to 3 times
    if (nextRetries <= 3) {
      this.setState({ autoRetries: nextRetries, isAutoRecovering: true });
      if (this.autoRecoveryTimer) clearTimeout(this.autoRecoveryTimer);
      this.autoRecoveryTimer = setTimeout(() => {
        console.log(`[ChartErrorBoundary] Executing autonomous recovery attempt ${nextRetries}/3...`);
        this.handleReset();
      }, 1500);
    } else {
      this.setState({ isAutoRecovering: false });
    }
  }

  public componentWillUnmount() {
    if (this.autoRecoveryTimer) {
      clearTimeout(this.autoRecoveryTimer);
    }
  }

  private handleReset = () => {
    if (this.autoRecoveryTimer) clearTimeout(this.autoRecoveryTimer);
    this.setState({ hasError: false, errorInfo: null, errorStack: null, isAutoRecovering: false });
    if (this.props.onReset) {
      try {
        this.props.onReset();
      } catch (err) {
        console.warn('onReset callback error:', err);
      }
    }
  };

  private handleHardReset = () => {
    if (this.autoRecoveryTimer) clearTimeout(this.autoRecoveryTimer);
    // Clear potentially corrupted drawings/zoom state for this symbol
    try {
      const sym = this.props.fallbackSymbol || 'default';
      localStorage.removeItem(`chart_drawings_${sym}`);
    } catch {}
    this.setState({ autoRetries: 0, hasError: false, errorInfo: null, errorStack: null, isAutoRecovering: false });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-[400px] sm:h-[480px] bg-slate-950/95 border border-cyan-500/30 rounded-2xl flex flex-col items-center justify-center p-6 text-center shadow-2xl relative overflow-hidden backdrop-blur-md">
          {/* Neon scanline accent */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/15 via-transparent to-transparent pointer-events-none" />

          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400 mb-3 relative">
            <AlertTriangle className="w-6 h-6 animate-pulse" />
            {this.state.isAutoRecovering && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
              </span>
            )}
          </div>

          <h3 className="text-sm font-bold text-slate-100 font-mono mb-1 tracking-wide">
            CHART ENGINE STABILIZER
          </h3>

          <p className="text-xs text-slate-400 font-mono max-w-md mb-3 leading-relaxed">
            {this.state.isAutoRecovering ? (
              <span className="text-cyan-300 font-semibold flex items-center justify-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                Auto-recovering viewport buffer (attempt {this.state.autoRetries}/3)...
              </span>
            ) : (
              'The high-frequency tick buffer underwent an unexpected synchronization anomaly. The protective stabilizer caught the event to safeguard session continuity.'
            )}
          </p>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-3 z-10">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold font-mono text-xs hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-cyan-500/20"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>RECOVER VIEWPORT</span>
            </button>
            <button
              onClick={this.handleHardReset}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 text-xs font-mono font-semibold hover:border-slate-700 transition-all"
              title="Clears cached zoom and drawing state"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
              <span>HARD RESET</span>
            </button>
          </div>

          {/* Collapsible Diagnostics */}
          <div className="w-full max-w-md mt-2 z-10 text-left">
            <button
              onClick={() => this.setState({ showDetails: !this.state.showDetails })}
              className="text-[11px] font-mono text-slate-500 hover:text-slate-300 flex items-center gap-1 mx-auto transition-colors"
            >
              <span>Diagnostics Details</span>
              {this.state.showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {this.state.showDetails && (
              <div className="mt-2 p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-[10px] font-mono text-slate-400 max-h-32 overflow-y-auto">
                <div className="text-rose-400 font-bold mb-1">Error: {this.state.errorInfo}</div>
                {this.state.errorStack && (
                  <pre className="text-slate-500 whitespace-pre-wrap text-[9px]">{this.state.errorStack}</pre>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
