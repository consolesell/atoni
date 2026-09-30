import React, { useState, useEffect } from 'react';
import {
  Bot,
  Play,
  Pause,
  Save,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Code,
  FileText,
  Cpu,
  Zap,
  Activity,
  ShieldCheck,
  Search,
  ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { sound } from '../lib/soundEngine';

interface SubAgentEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunAutonomousStep: () => void;
  isAutonomousRunning: boolean;
  lastAutonomousDecision?: {
    action: string;
    confidence: number;
    rule_matched?: string;
    reasoning?: string;
    timestamp?: string;
  } | null;
  onToggleAutonomous: () => void;
}

interface WorkspaceFile {
  path: string;
  name: string;
  category: string;
  description: string;
}

export const SubAgentEditorModal: React.FC<SubAgentEditorModalProps> = ({
  isOpen,
  onClose,
  onRunAutonomousStep,
  isAutonomousRunning,
  lastAutonomousDecision,
  onToggleAutonomous,
}) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview' | 'telemetry' | 'audit'>('editor');

  // Workspace inspection state
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('src/lib/riskEngine.ts');
  const [critique, setCritique] = useState<string>('');
  const [critiqueLoading, setCritiqueLoading] = useState<boolean>(false);

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

  const fetchWorkspaceFiles = async () => {
    try {
      const res = await fetch('/api/workspace/files');
      const data = await res.json();
      if (data.success && Array.isArray(data.files)) {
        setWorkspaceFiles(data.files);
      }
    } catch (err) {
      console.error('Failed to fetch workspace files:', err);
    }
  };

  const handleInspectFile = async (filePathToInspect?: string) => {
    const targetPath = filePathToInspect || selectedFilePath;
    setCritiqueLoading(true);
    try {
      sound.play('click');
      const res = await fetch('/api/workspace/inspect-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: targetPath }),
      });
      const data = await res.json();
      if (data.success) {
        setCritique(data.critique);
        sound.play('strategy_update');
      }
    } catch (err) {
      console.error('Failed to inspect workspace file:', err);
    } finally {
      setCritiqueLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchScript();
      fetchWorkspaceFiles();
    }
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/subagent/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        sound.play('strategy_update');
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save sbagent.md:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl flex flex-col text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">SBAgent Workspace & Strategy Terminal</h2>
                <span className="px-2 py-0.5 text-[10px] font-mono bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 rounded-md">
                  Creator: Givan (Kingvan)
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Directly edit sbagent.md rules or inspect any workspace script with autonomous self-awareness
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleAutonomous}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                isAutonomousRunning
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-lg shadow-amber-950/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/50'
              }`}
            >
              {isAutonomousRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5" /> Pause Subagent
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" /> Run Autonomously
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Navigation bar */}
        <div className="px-4 py-2 bg-slate-950/40 border-b border-slate-800/80 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('editor')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'editor'
                  ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code className="w-3.5 h-3.5" /> Markdown Editor
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'preview'
                  ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> Parsed View
            </button>
            <button
              onClick={() => setActiveTab('telemetry')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'telemetry'
                  ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" /> Live Telemetry
            </button>
            <button
              onClick={() => {
                setActiveTab('audit');
                if (!critique && workspaceFiles.length > 0) {
                  handleInspectFile(workspaceFiles[0].path);
                }
              }}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'audit'
                  ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                  : 'text-slate-400 hover:text-cyan-300'
              }`}
            >
              <Search className="w-3.5 h-3.5 text-cyan-400" /> Workspace Script Audit
            </button>
          </div>

          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Saved to disk!
              </span>
            )}
            {activeTab === 'editor' && (
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="px-3 py-1 bg-emerald-600/90 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save sbagent.md'}
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-4 overflow-y-auto font-mono text-xs">
          {loading ? (
            <div className="h-64 flex items-center justify-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-500 mb-2" />
            </div>
          ) : activeTab === 'editor' ? (
            <div className="h-[55vh] flex flex-col">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="# Subagent configuration..."
                className="w-full h-full p-4 bg-slate-950/80 border border-slate-800/80 rounded-xl text-slate-200 font-mono text-xs focus:outline-none focus:border-emerald-500/50 resize-none leading-relaxed"
                spellCheck={false}
              />
            </div>
          ) : activeTab === 'preview' ? (
            <div className="h-[55vh] p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl overflow-y-auto font-sans text-xs text-slate-300 space-y-3 whitespace-pre-wrap leading-relaxed">
              {content}
            </div>
          ) : activeTab === 'audit' ? (
            /* Workspace Script Audit Tab */
            <div className="h-[55vh] flex flex-col sm:flex-row gap-4 font-sans text-xs">
              {/* Left File Selector List */}
              <div className="w-full sm:w-1/3 bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex flex-col gap-2 overflow-y-auto">
                <div className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Workspace Scripts</span>
                  <span className="text-cyan-400">{workspaceFiles.length} Files</span>
                </div>
                {workspaceFiles.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => {
                      setSelectedFilePath(file.path);
                      handleInspectFile(file.path);
                    }}
                    className={`p-2.5 rounded-lg border text-left transition-all flex flex-col gap-1 ${
                      selectedFilePath === file.path
                        ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200'
                        : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white text-xs truncate">{file.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-400">
                        {file.category}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 truncate">{file.path}</span>
                  </button>
                ))}
              </div>

              {/* Right Critique & Optimization View */}
              <div className="flex-1 bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col overflow-y-auto">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-white font-mono">SBAgent Code Audit</h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        {selectedFilePath}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Autonomous algorithmic inspection and optimization report for Givan (Kingvan)
                    </p>
                  </div>
                  <button
                    onClick={() => handleInspectFile(selectedFilePath)}
                    disabled={critiqueLoading}
                    className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    {critiqueLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analyzing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" /> Re-audit
                      </>
                    )}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto font-sans leading-relaxed text-slate-300 whitespace-pre-wrap">
                  {critiqueLoading ? (
                    <div className="h-48 flex flex-col items-center justify-center text-slate-500 gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                      <span className="font-mono text-xs text-cyan-400">
                        SBAgent synthesizing deep code analysis...
                      </span>
                    </div>
                  ) : critique ? (
                    <div className="space-y-2 text-xs">
                      {critique}
                    </div>
                  ) : (
                    <div className="text-slate-500 text-center py-12">
                      Select any workspace script on the left to view SBAgent's architectural critique.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[55vh] space-y-4 font-sans text-xs">
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-300">Subagent Runtime Status</div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">
                    {isAutonomousRunning ? 'Autonomous Active (Evaluating Live Ticks)' : 'Standby / Paused'}
                  </div>
                </div>
                <button
                  onClick={onRunAutonomousStep}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs flex items-center gap-1.5 border border-slate-700"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" /> Execute Single Scan
                </button>
              </div>

              {lastAutonomousDecision ? (
                <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">Last Subagent Deliberation</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {lastAutonomousDecision.timestamp || new Date().toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        lastAutonomousDecision.action === 'BUY'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : lastAutonomousDecision.action === 'SELL'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      ACTION: {lastAutonomousDecision.action}
                    </span>
                    <span className="text-xs text-slate-400">
                      Confidence: <strong className="text-slate-200">{lastAutonomousDecision.confidence}%</strong>
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    <strong className="text-slate-300">Rule Triggered:</strong> {lastAutonomousDecision.rule_matched || 'N/A'}
                  </div>
                  <div className="text-xs text-slate-400">
                    <strong className="text-slate-300">Reasoning:</strong> {lastAutonomousDecision.reasoning || 'N/A'}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  No subagent execution history yet. Click "Run Autonomously" or "Execute Single Scan" to begin.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-950/90 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            Edits made to <code className="text-slate-200 font-mono">sbagent.md</code> are synced immediately to the execution pipeline.
          </span>
          <span className="font-mono text-slate-500">Creator: Givan / Kingvan</span>
        </div>
      </div>
    </div>
  );
};
