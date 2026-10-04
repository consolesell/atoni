import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackSymbol?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  errorInfo: string | null;
}

export class ChartErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorInfo: error.message || 'Unknown chart rendering issue' };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('ChartErrorBoundary caught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-[400px] sm:h-[480px] bg-slate-950/90 border border-cyan-500/20 rounded-2xl flex flex-col items-center justify-center p-6 text-center shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3 animate-pulse">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-100 font-mono mb-1">
            CHART ENGINE PROTECTIVE RE-ANCHOR
          </h3>
          <p className="text-xs text-slate-400 font-mono max-w-md mb-4">
            The high-frequency tick buffer underwent an unexpected synchronization anomaly.
            The protective stabilizer prevented a viewport crash.
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold font-mono text-xs hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-cyan-500/20"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>RECONNECT & REFRESH CHART</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
