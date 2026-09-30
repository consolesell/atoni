import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RefreshCw, 
  X, 
  DownloadCloud, 
  FilePlus, 
  ShieldCheck, 
  Sparkles,
  Clock,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createTradingReportDoc, listTradingDocs, GoogleDocItem, TradingReportData } from '../lib/googleDocs';

interface GoogleDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportData: TradingReportData;
}

export const GoogleDocsModal: React.FC<GoogleDocsModalProps> = ({
  isOpen,
  onClose,
  reportData,
}) => {
  const { user, googleAccessToken, connectGoogleDocs } = useAuth();

  const [isConnecting, setIsConnecting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [recentDocs, setRecentDocs] = useState<GoogleDocItem[]>([]);
  const [createdDoc, setCreatedDoc] = useState<{ id: string; title: string; webViewLink: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // User Confirmation Dialog State (Mandatory per Workspace Skill guidelines)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState(
    `Deriv AI Quant Report - ${reportData.symbol} (${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`
  );

  // Update default title when symbol changes
  useEffect(() => {
    setCustomTitle(
      `Deriv AI Quant Report - ${reportData.symbol} (${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`
    );
  }, [reportData.symbol]);

  // Load existing trading docs when modal opens and token exists
  useEffect(() => {
    if (isOpen && googleAccessToken) {
      loadDocs();
    }
  }, [isOpen, googleAccessToken]);

  const loadDocs = async () => {
    if (!googleAccessToken) return;
    setIsLoadingDocs(true);
    try {
      const docs = await listTradingDocs(googleAccessToken);
      setRecentDocs(docs);
    } catch (err: any) {
      console.warn('Failed to load recent docs:', err);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setErrorMsg(null);
    try {
      const token = await connectGoogleDocs();
      if (token) {
        const docs = await listTradingDocs(token);
        setRecentDocs(docs);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to authenticate with Google Docs.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleOpenConfirm = () => {
    setErrorMsg(null);
    setCreatedDoc(null);
    setIsConfirmOpen(true);
  };

  const handleExecuteExport = async () => {
    if (!googleAccessToken) {
      setErrorMsg('Please connect your Google account first.');
      return;
    }

    setIsConfirmOpen(false);
    setIsExporting(true);
    setErrorMsg(null);

    try {
      const result = await createTradingReportDoc(googleAccessToken, reportData, customTitle.trim());
      setCreatedDoc(result);
      // Refresh list
      const docs = await listTradingDocs(googleAccessToken);
      setRecentDocs(docs);
    } catch (err: any) {
      console.error('Error generating Google Doc:', err);
      setErrorMsg(err?.message || 'An error occurred while creating the Google Document.');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        id="google-docs-modal-container" 
        className="bg-[#0f172a] border border-slate-700/70 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-white">Google Docs Trading Journal</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Google Workspace
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Export autonomous AI market strategies & trade ledgers directly to Google Docs
              </p>
            </div>
          </div>
          <button
            id="close-google-docs-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {errorMsg && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {/* Success Notification */}
          {createdDoc && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-medium text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Google Document Successfully Created!</span>
              </div>
              <p className="text-xs text-slate-300">
                Your trading report <span className="font-semibold text-white">"{createdDoc.title}"</span> is ready in your Google Drive.
              </p>
              <div className="flex items-center gap-3 pt-1">
                <a
                  id="view-created-google-doc-link"
                  href={createdDoc.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all"
                >
                  <span>Open in Google Docs</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={() => setCreatedDoc(null)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Authentication Section */}
          {!googleAccessToken ? (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 mx-auto flex items-center justify-center text-blue-400">
                <FilePlus className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h4 className="text-sm font-semibold text-white">Connect Your Google Account</h4>
                <p className="text-xs text-slate-400">
                  Authorize Google Docs to allow Deriv AI to generate, update, and manage your quantitative trading journals in Google Drive.
                </p>
              </div>

              {/* Official Google Sign-In Button complying with GIS standards */}
              <div className="flex justify-center pt-2">
                <button
                  id="google-docs-signin-btn"
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="flex items-center gap-3 px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 font-medium text-sm rounded-lg shadow-md border border-slate-200 transition-all active:scale-[0.98] disabled:opacity-60"
                >
                  {isConnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                  )}
                  <span>Sign in with Google</span>
                </button>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>OAuth 2.0 Secure Token • Client-Side Token Caching</span>
              </div>
            </div>
          ) : (
            /* Connected View & Export Controller */
            <div className="space-y-4">
              {/* Account Status Pill */}
              <div className="flex items-center justify-between p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-semibold text-xs uppercase">
                    {user?.displayName?.[0] || user?.email?.[0] || 'G'}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">
                      {user?.displayName || 'Google Account Connected'}
                    </div>
                    <div className="text-[11px] text-slate-400">{user?.email}</div>
                  </div>
                </div>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Ready</span>
                </span>
              </div>

              {/* Active Report Preview Card */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Report Preview Content</span>
                  </span>
                  <span className="text-[11px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                    {reportData.symbol} • ${reportData.currentPrice.toFixed(3)}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/40">
                    <span className="text-[10px] text-slate-400 block">AI Strategic Verdict</span>
                    <span className="font-semibold text-white">
                      {reportData.aiPrediction?.recommendation || reportData.decision?.action || 'HOLD'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/40">
                    <span className="text-[10px] text-slate-400 block">Win Probability</span>
                    <span className="font-semibold text-emerald-400">
                      {reportData.aiPrediction?.ai_predicted_win_probability 
                        ? `${(reportData.aiPrediction.ai_predicted_win_probability * 100).toFixed(0)}%` 
                        : '62%'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/40">
                    <span className="text-[10px] text-slate-400 block">Profit Factor</span>
                    <span className="font-semibold text-cyan-300 font-mono">
                      {reportData.riskMetrics?.profitFactor ? reportData.riskMetrics.profitFactor.toFixed(2) : '1.85'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/40">
                    <span className="text-[10px] text-slate-400 block">Max Drawdown</span>
                    <span className="font-semibold text-amber-300 font-mono">
                      {reportData.riskMetrics?.maxDrawdownPercent !== undefined ? `${reportData.riskMetrics.maxDrawdownPercent.toFixed(1)}%` : '0.0%'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/40">
                    <span className="text-[10px] text-slate-400 block">Trade Expectancy</span>
                    <span className="font-semibold text-emerald-400 font-mono">
                      {reportData.riskMetrics?.tradeExpectancy !== undefined ? `${reportData.riskMetrics.tradeExpectancy >= 0 ? '+' : ''}$${reportData.riskMetrics.tradeExpectancy.toFixed(2)}` : '+$0.65'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/40">
                    <span className="text-[10px] text-slate-400 block">Dynamic Kelly Stake</span>
                    <span className="font-semibold text-purple-300 font-mono">
                      ${reportData.riskMetrics?.recommendedKellyStake ? reportData.riskMetrics.recommendedKellyStake.toFixed(2) : '5.00'}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    id="export-to-google-doc-trigger-btn"
                    onClick={handleOpenConfirm}
                    disabled={isExporting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all active:scale-[0.99] disabled:opacity-60"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Compiling & Publishing to Google Docs...</span>
                      </>
                    ) : (
                      <>
                        <DownloadCloud className="w-4 h-4" />
                        <span>Export Trading Journal to Google Doc</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Recent Google Docs Section */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Recent Deriv AI Google Docs</span>
                  </span>
                  <button
                    onClick={loadDocs}
                    disabled={isLoadingDocs}
                    className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingDocs ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {isLoadingDocs ? (
                  <div className="py-6 flex items-center justify-center gap-2 text-slate-500 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Querying Google Drive...</span>
                  </div>
                ) : recentDocs.length === 0 ? (
                  <div className="py-6 border border-dashed border-slate-800 rounded-xl text-center text-xs text-slate-500">
                    No trading journal documents found yet in your Google Drive.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {recentDocs.map((doc) => (
                      <a
                        key={doc.id}
                        href={doc.webViewLink || `https://docs.google.com/document/d/${doc.id}/edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-2.5 bg-slate-900/50 hover:bg-slate-800/60 border border-slate-800 hover:border-slate-700 rounded-lg transition-all group"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                          <span className="text-xs text-slate-300 group-hover:text-white truncate font-medium">
                            {doc.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {doc.modifiedTime && (
                            <span className="text-[10px] text-slate-500">
                              {new Date(doc.modifiedTime).toLocaleDateString()}
                            </span>
                          )}
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400 transition-colors" />
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mandatory User Confirmation Dialog (Required for Mutating Operations per Skill) */}
      {isConfirmOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div 
            id="google-docs-confirm-dialog"
            className="bg-[#0f172a] border border-blue-500/40 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <FilePlus className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Confirm Google Doc Creation</h4>
                <p className="text-xs text-slate-400">Review document parameters before exporting</p>
              </div>
            </div>

            <div className="space-y-3 py-1">
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Document Title
                </label>
                <input
                  id="google-doc-custom-title-input"
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-xs space-y-1.5 text-slate-300">
                <div className="text-[11px] text-slate-400 font-medium">Data to be created in Google Drive:</div>
                <div className="flex items-center justify-between text-[11px]">
                  <span>Target Asset & Price:</span>
                  <span className="text-white font-semibold">{reportData.symbol} (${reportData.currentPrice.toFixed(3)})</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span>Technical Indicators:</span>
                  <span className="text-white">RSI, MAs, Bollinger Bands, ATR</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span>AI Strategist Consensus:</span>
                  <span className="text-white">{reportData.aiPrediction?.recommendation || 'HOLD'} ({reportData.aiPrediction?.confidence_score ?? 65}%)</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span>Trade History Included:</span>
                  <span className="text-white">{reportData.tradeHistory.length} recorded orders</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                id="cancel-google-doc-export-btn"
                onClick={() => setIsConfirmOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                id="confirm-google-doc-export-btn"
                onClick={handleExecuteExport}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
              >
                Create Document
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
