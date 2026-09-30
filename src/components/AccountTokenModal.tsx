import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  ExternalLink,
  LogIn,
  LogOut,
  RefreshCw,
  Wallet,
  ArrowRightLeft,
  Check,
  Zap,
  Globe,
  Lock,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { derivWS } from '../lib/derivWS';
import { sound } from '../lib/soundEngine';
import { DerivLinkedAccount } from '../types/trading';

interface AccountTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLiveMode: boolean;
  onToggleLiveMode: (live: boolean) => void;
}

export const AccountTokenModal: React.FC<AccountTokenModalProps> = ({
  isOpen,
  onClose,
  isLiveMode,
  onToggleLiveMode,
}) => {
  const currentCreds = derivWS.getCredentials();
  const [activeTab, setActiveTab] = useState<'oauth' | 'token' | 'virtual' | 'accounts'>('oauth');
  const [tokenInput, setTokenInput] = useState(currentCreds.token || '');
  const [appIdInput, setAppIdInput] = useState(String(currentCreds.appId || 1089));
  const [pastedUrlInput, setPastedUrlInput] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<DerivLinkedAccount[]>(derivWS.getLinkedAccounts());
  const [isOAuthWaiting, setIsOAuthWaiting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Sync state on open
  useEffect(() => {
    if (isOpen) {
      const creds = derivWS.getCredentials();
      setTokenInput(creds.token || '');
      setAppIdInput(String(creds.appId || 1089));
      setLinkedAccounts(derivWS.getLinkedAccounts());
      setTestResult(null);
      setSaveMessage(null);
      setIsOAuthWaiting(false);
    }
  }, [isOpen]);

  // Listen for OAuth postMessage callback from popup
  useEffect(() => {
    const handleAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'DERIV_OAUTH_SUCCESS') {
        const { accounts, token, account } = event.data;
        setIsOAuthWaiting(false);
        sound.play('win');

        if (Array.isArray(accounts) && accounts.length > 0) {
          derivWS.setLinkedAccounts(accounts);
          setLinkedAccounts(accounts);
        }

        const effectiveToken = token || (accounts && accounts[0] ? accounts[0].token : '');
        const cleanAppId = appIdInput.trim() || '1089';

        if (effectiveToken) {
          derivWS.setCredentials(effectiveToken, cleanAppId);
          setTokenInput(effectiveToken);
          setSaveMessage(`Successfully connected Deriv account ${account || ''}!`);
          setTimeout(() => {
            setSaveMessage(null);
            onClose();
          }, 1500);
        }
      }
    };

    window.addEventListener('message', handleAuthMessage);
    return () => window.removeEventListener('message', handleAuthMessage);
  }, [appIdInput, onClose]);

  if (!isOpen) return null;

  const currentDiagnostics = derivWS.getDiagnostics();
  const authorizedInfo = currentDiagnostics.authDetails;
  const isCurrentlyAuthorized = currentDiagnostics.hasToken && currentDiagnostics.authorized;

  // Launch Deriv OAuth popup without leaving app
  const handleLaunchDerivOAuth = () => {
    const cleanAppId = appIdInput.trim() || '1089';
    const oauthUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${encodeURIComponent(cleanAppId)}&l=en&brand=deriv`;

    setIsOAuthWaiting(true);
    sound.play('click');

    const popupWidth = 480;
    const popupHeight = 680;
    const left = window.screenX + (window.outerWidth - popupWidth) / 2;
    const top = window.screenY + (window.outerHeight - popupHeight) / 2;

    const popup = window.open(
      oauthUrl,
      'deriv_oauth_popup',
      `width=${popupWidth},height=${popupHeight},left=${left},top=${top},status=no,toolbar=no,menubar=no`
    );

    if (!popup) {
      setIsOAuthWaiting(false);
      setTestResult({
        success: false,
        message: 'Browser blocked popup window. Please allow popups or use Direct Token Login tab below.',
      });
      return;
    }

    // Monitor popup closure if user closes it manually
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        setIsOAuthWaiting(false);
      }
    }, 1000);
  };

  // Extract from pasted URL or callback string
  const handleParseCallbackUrl = () => {
    if (!pastedUrlInput.trim()) return;
    try {
      let raw = pastedUrlInput.trim();
      if (raw.includes('#')) raw = raw.split('#')[1];
      else if (raw.includes('?')) raw = raw.split('?')[1];

      const searchParams = new URLSearchParams(raw);
      const accounts: DerivLinkedAccount[] = [];
      let i = 1;
      while (searchParams.has('acct' + i) && searchParams.has('token' + i)) {
        accounts.push({
          account: searchParams.get('acct' + i)!,
          token: searchParams.get('token' + i)!,
          currency: searchParams.get('cur' + i) || 'USD',
          isVirtual: searchParams.get('acct' + i)!.startsWith('VRTC'),
        });
        i++;
      }

      const singleToken =
        searchParams.get('token1') ||
        searchParams.get('token') ||
        (accounts[0] ? accounts[0].token : raw);
      const singleAcct =
        searchParams.get('acct1') ||
        searchParams.get('acct') ||
        (accounts[0] ? accounts[0].account : 'CR_ACCOUNT');

      if (accounts.length > 0) {
        derivWS.setLinkedAccounts(accounts);
        setLinkedAccounts(accounts);
      }

      if (singleToken) {
        setTokenInput(singleToken);
        derivWS.setCredentials(singleToken, appIdInput.trim() || '1089');
        setSaveMessage(`Imported ${accounts.length > 0 ? accounts.length : 1} account(s)! Connected as ${singleAcct}.`);
        sound.play('win');
        setTimeout(() => {
          setSaveMessage(null);
          onClose();
        }, 1500);
      } else {
        setTestResult({
          success: false,
          message: 'Could not find token in pasted text. Expected format: ?acct1=...&token1=...',
        });
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        message: `Failed to parse URL: ${e?.message || 'Invalid format'}`,
      });
    }
  };

  // Test token live via WebSocket without leaving app
  const handleTestAndConnectToken = async () => {
    if (!tokenInput.trim()) {
      setTestResult({ success: false, message: 'Please enter a valid Deriv API token.' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    sound.play('click');

    const cleanAppId = appIdInput.trim() || '1089';
    const res = await derivWS.testToken(tokenInput.trim(), cleanAppId);

    setIsTesting(false);
    if (res.success && res.authorize) {
      sound.play('win');
      derivWS.setCredentials(tokenInput.trim(), cleanAppId);
      const isVirtual = Boolean(res.authorize.is_virtual);
      onToggleLiveMode(!isVirtual);

      setTestResult({
        success: true,
        message: `Connected as ${res.authorize.fullname || res.authorize.email} (${res.authorize.loginid}) • Balance: $${Number(
          res.authorize.balance
        ).toFixed(2)} ${res.authorize.currency}`,
        details: res.authorize,
      });

      setSaveMessage('Credentials verified & activated on live Deriv WebSocket!');
      setTimeout(() => {
        setSaveMessage(null);
        onClose();
      }, 1600);
    } else {
      sound.play('alert');
      setTestResult({
        success: false,
        message: res.error || 'Failed to authenticate token with Deriv WebSocket server.',
      });
    }
  };

  // Switch to standardized Virtual Account Anchor ($10 USD)
  const handleSelectVirtualAnchor = () => {
    derivWS.logout();
    setTokenInput('');
    onToggleLiveMode(false);
    sound.play('toggle');
    setSaveMessage('Switched to Standardized Virtual Demo Account ($10.00 USD Anchor with Auto-Replenishment).');
    setTimeout(() => {
      setSaveMessage(null);
      onClose();
    }, 1200);
  };

  // Quick switch between linked accounts
  const handleSwitchLinkedAccount = (acc: DerivLinkedAccount) => {
    sound.play('click');
    derivWS.switchAccount(acc);
    setTokenInput(acc.token);
    onToggleLiveMode(!acc.isVirtual);
    setSaveMessage(`Switched active Deriv account to ${acc.account} (${acc.currency})`);
    setTimeout(() => {
      setSaveMessage(null);
      onClose();
    }, 1200);
  };

  // Fill example test credentials
  const handleLoadExample = () => {
    setAppIdInput('34ipe1l5uHyeefpKPRKbL');
    setTokenInput('pat_5665fba729f270de38225d8892084a545cb2dc3118e20f3f07a05b8ad6ec435b');
    sound.play('click');
  };

  const handleDisconnect = () => {
    sound.play('toggle');
    derivWS.logout();
    setTokenInput('');
    onToggleLiveMode(false);
    setSaveMessage('Disconnected from Deriv. Running in Virtual Simulation mode.');
    setTimeout(() => {
      setSaveMessage(null);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-slate-950/90 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-rose-500/20 to-red-600/20 text-rose-400 border border-rose-500/30">
              <LogIn className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-100 font-sans tracking-tight">
                  Deriv Log In & Connect
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 font-bold">
                  IN-APP
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Log in to Deriv directly without leaving the app
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

        {/* Live Status Header Ribbon */}
        <div className="px-5 sm:px-6 py-2.5 bg-slate-950/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isCurrentlyAuthorized ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-300">
              Status:{' '}
              <strong className={isCurrentlyAuthorized ? 'text-emerald-400' : 'text-amber-400'}>
                {isCurrentlyAuthorized
                  ? `Authorized (${authorizedInfo?.loginid || 'CR_USER'})`
                  : 'Virtual Simulation'}
              </strong>
            </span>
            {authorizedInfo?.balance !== undefined && (
              <span className="text-slate-400">
                • Balance:{' '}
                <strong className="text-white">
                  ${Number(authorizedInfo.balance).toFixed(2)} {authorizedInfo.currency}
                </strong>
              </span>
            )}
          </div>

          {isCurrentlyAuthorized && (
            <button
              type="button"
              onClick={handleDisconnect}
              className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 underline"
            >
              <LogOut className="w-3 h-3" /> Disconnect
            </button>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center px-4 pt-3 bg-slate-900 border-b border-slate-800 text-xs font-mono">
          <button
            onClick={() => setActiveTab('oauth')}
            className={`flex-1 py-2.5 px-3 text-center border-b-2 font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'oauth'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Deriv 1-Click Login</span>
          </button>

          <button
            onClick={() => setActiveTab('token')}
            className={`flex-1 py-2.5 px-3 text-center border-b-2 font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'token'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Direct API Token</span>
          </button>

          <button
            onClick={() => setActiveTab('virtual')}
            className={`flex-1 py-2.5 px-3 text-center border-b-2 font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'virtual'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Virtual $10 Anchor</span>
          </button>

          {linkedAccounts.length > 0 && (
            <button
              onClick={() => setActiveTab('accounts')}
              className={`flex-1 py-2.5 px-3 text-center border-b-2 font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'accounts'
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Accounts ({linkedAccounts.length})</span>
            </button>
          )}
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex flex-col gap-4 font-sans text-xs">
          {saveMessage && (
            <div className="p-3 bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 rounded-xl font-mono text-xs flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{saveMessage}</span>
            </div>
          )}

          {testResult && (
            <div
              className={`p-3 rounded-xl font-mono text-xs flex items-start gap-2 animate-fadeIn border ${
                testResult.success
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="flex flex-col gap-1">
                <span>{testResult.message}</span>
              </div>
            </div>
          )}

          {/* TAB 1: DERIV OAUTH 1-CLICK POPUP */}
          {activeTab === 'oauth' && (
            <div className="flex flex-col gap-4">
              <div className="p-4 bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800 rounded-xl flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-rose-500/10 text-rose-400 rounded-lg border border-rose-500/30">
                    <LogIn className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-100 text-sm font-sans">
                      Seamless Deriv Authorization
                    </h4>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Authorize once on Deriv's official login screen. The app automatically captures your tokens without leaving this window.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400">Deriv App ID:</span>
                    <input
                      type="text"
                      value={appIdInput}
                      onChange={(e) => setAppIdInput(e.target.value)}
                      placeholder="1089"
                      className="w-32 bg-slate-950 border border-slate-700 text-right px-2.5 py-1 rounded-lg text-slate-200 outline-none font-mono"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleLaunchDerivOAuth}
                    disabled={isOAuthWaiting}
                    className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-mono font-bold text-xs rounded-xl shadow-lg shadow-rose-600/25 flex items-center justify-center gap-2 transition-all"
                  >
                    {isOAuthWaiting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>Awaiting Authorization in Popup Window...</span>
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" />
                        <span>Log In with Deriv (Popup Handshake)</span>
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-slate-500 text-center">
                    A small secure Deriv window will open. Upon sign in, it closes and synchronizes your Demo & Real balances automatically.
                  </p>
                </div>
              </div>

              {/* Paste Callback Helper (In case popup doesn't close or URL was copied) */}
              <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col gap-2">
                <span className="text-slate-300 font-mono font-bold text-[11px] flex items-center gap-1">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Manual Callback / Redirect URL Import (Fallback)</span>
                </span>
                <p className="text-[10px] text-slate-400 font-mono">
                  If you were redirected or have a Deriv OAuth callback URL (containing acct1=...&token1=...), paste it here to import instantly:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pastedUrlInput}
                    onChange={(e) => setPastedUrlInput(e.target.value)}
                    placeholder="https://.../?acct1=CR123&token1=... or ?token1=..."
                    className="flex-1 bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-1.5 text-xs font-mono outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleParseCallbackUrl}
                    className="px-3 py-1.5 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/40 rounded-lg font-mono font-bold text-xs"
                  >
                    Import
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DIRECT API TOKEN */}
          {activeTab === 'token' && (
            <div className="flex flex-col gap-4 font-mono">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-medium text-xs">
                    Deriv API Token
                  </label>
                  <button
                    type="button"
                    onClick={handleLoadExample}
                    className="text-cyan-400 hover:text-cyan-300 text-[11px] underline flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    Fill Example Credentials
                  </button>
                </div>
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste your Deriv API token (starts with pat_ or similar)..."
                  className="bg-slate-950 border border-slate-700 hover:border-cyan-500/50 focus:border-cyan-500 text-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none"
                />
                <span className="text-[10px] text-slate-500 flex items-center justify-between">
                  <span>Tokens are stored strictly in client memory/localStorage.</span>
                  <a
                    href="https://app.deriv.com/account/api-token"
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 hover:underline flex items-center gap-0.5 text-[10px]"
                  >
                    <span>Create token on Deriv</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-slate-300 font-medium text-xs">
                  Deriv App ID (Default: 1089)
                </label>
                <input
                  type="text"
                  value={appIdInput}
                  onChange={(e) => setAppIdInput(e.target.value)}
                  placeholder="1089 or custom registered app ID"
                  className="bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-4 py-2 text-xs outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleTestAndConnectToken}
                disabled={isTesting}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-mono font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all mt-1"
              >
                {isTesting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying Token Live with Deriv WS...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    <span>Test & Connect Deriv Live</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 3: STANDARDIZED VIRTUAL ANCHOR ($10 USD) */}
          {activeTab === 'virtual' && (
            <div className="flex flex-col gap-3 font-mono">
              <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-xl flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span className="font-bold text-sm text-emerald-300 font-sans">
                    Standardized Virtual Account Anchor: $10.00 USD
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                  The virtual environment is calibrated with a strict <strong>$10 USD initial balance</strong> and <strong>real-time auto-replenishment</strong>.
                  Whenever depleted, the system automatically triggers a top-up back to $10 USD.
                </p>
                <div className="grid grid-cols-2 gap-2 mt-1 pt-2 border-t border-emerald-500/30 text-xs">
                  <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px]">Anchor Stake:</span>
                    <div className="text-emerald-400 font-bold">$10.00 USD</div>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px]">Auto-Replenish:</span>
                    <div className="text-emerald-400 font-bold">INSTANT (&lt; $0.50)</div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSelectVirtualAnchor}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all"
              >
                <Check className="w-4 h-4" />
                <span>Switch to Virtual $10 USD Anchor</span>
              </button>
            </div>
          )}

          {/* TAB 4: LINKED ACCOUNTS LIST */}
          {activeTab === 'accounts' && linkedAccounts.length > 0 && (
            <div className="flex flex-col gap-2.5 font-mono">
              <span className="text-slate-400 text-xs font-bold">
                Available Accounts on This Token:
              </span>
              <div className="flex flex-col gap-2">
                {linkedAccounts.map((acc) => {
                  const isCurrent =
                    authorizedInfo?.loginid === acc.account ||
                    (tokenInput && acc.token === tokenInput);
                  return (
                    <div
                      key={acc.account}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                        isCurrent
                          ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-200'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-2.5 h-2.5 rounded-full ${
                            acc.isVirtual ? 'bg-amber-400' : 'bg-rose-500'
                          }`}
                        />
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs">{acc.account}</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                acc.isVirtual
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              }`}
                            >
                              {acc.isVirtual ? 'DEMO' : 'REAL'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            Currency: {acc.currency}
                            {acc.balance !== undefined ? ` • $${acc.balance.toFixed(2)}` : ''}
                          </span>
                        </div>
                      </div>

                      {isCurrent ? (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[11px] font-bold">
                          ACTIVE
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSwitchLinkedAccount(acc)}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-[11px] font-bold transition-all"
                        >
                          Switch
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3 bg-slate-950/90 border-t border-slate-800 text-xs font-mono">
          <div className="text-slate-400 text-[11px]">
            Execution: <span className={isLiveMode ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
              {isLiveMode ? 'REAL MONEY' : 'VIRTUAL ANCHOR'}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors font-bold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
