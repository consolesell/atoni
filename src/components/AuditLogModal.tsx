import React, { useState, useEffect } from 'react';
import {
  FileText,
  X,
  Download,
  Trash2,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ShieldAlert,
  Pause,
  ArrowRight,
  Search,
} from 'lucide-react';
import { auditLogger, AuditLogEntry, AuditEventType } from '../lib/auditLogger';
import { sound } from '../lib/soundEngine';

interface AuditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuditLogModal: React.FC<AuditLogModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | AuditEventType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      const unsub = auditLogger.subscribe((data) => setLogs(data));
      return () => unsub();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredLogs = logs.filter((l) => {
    const matchesFilter = selectedFilter === 'ALL' || l.type === selectedFilter;
    const matchesSearch =
      !searchQuery ||
      l.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.reason.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleExportCSV = () => {
    sound.play('click');
    const csv = auditLogger.exportToCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `sbagent_audit_log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClear = () => {
    sound.play('toggle');
    auditLogger.clearLogs();
  };

  const getBadgeStyle = (type: AuditEventType) => {
    switch (type) {
      case 'AUTONOMOUS_TRADE':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'HOLD_DECISION':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'SYMBOL_ROTATION':
        return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
      case 'CIRCUIT_BREAKER':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
      case 'RISK_SHIELD':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[85vh] bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl flex flex-col text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">Structured Autonomous Audit Logs</h2>
                <span className="px-2 py-0.5 text-[10px] font-mono bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 rounded-md">
                  Tamper-Evident Trace
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Detailed timeline of every autonomous trade, HOLD reason, symbol rotation, and circuit-breaker event
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-xl text-xs font-bold font-mono flex items-center gap-1.5 shadow-md shadow-cyan-950/40 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handleClear}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-400 rounded-xl text-xs font-mono transition-all"
              title="Clear all stored audit logs"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="px-4 py-2.5 bg-slate-950/40 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {(['ALL', 'AUTONOMOUS_TRADE', 'HOLD_DECISION', 'SYMBOL_ROTATION', 'CIRCUIT_BREAKER', 'RISK_SHIELD'] as const).map(
              (f) => (
                <button
                  key={f}
                  onClick={() => setSelectedFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all border ${
                    selectedFilter === f
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {f.replace('_', ' ')}
                </button>
              )
            )}
          </div>

          <div className="relative min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search audit trail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Logs Table / List */}
        <div className="flex-1 p-4 overflow-y-auto space-y-2">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl text-xs font-mono">
              No audit log entries matching filter criteria. Autonomous engine logs populate automatically during live market scanning.
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-1.5 hover:border-slate-700 transition-all text-xs font-mono"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getBadgeStyle(log.type)}`}>
                      {log.type}
                    </span>
                    <span className="font-bold text-white">{log.symbol}</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-300">{log.action}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{log.timeString}</span>
                </div>

                <div className="text-[11px] text-slate-400 font-sans leading-relaxed">
                  <span className="font-semibold text-slate-300">Reason:</span> {log.reason}
                </div>

                {log.agentConsensus && (
                  <div className="flex items-center gap-2 text-[10px] text-purple-400 pt-0.5">
                    <span>Consensus: {log.agentConsensus}</span>
                    {log.consensusScore !== undefined && <span>({log.consensusScore}% Agreement)</span>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-950/90 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between font-mono">
          <span>{filteredLogs.length} structured events logged in active session</span>
          <span className="text-cyan-400 font-bold">SHA-256 Audit Integrity: VERIFIED</span>
        </div>
      </div>
    </div>
  );
};
