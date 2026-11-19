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
import {
  derivWS,
  DEFAULT_DERIV_APP_ID,
  DEFAULT_DERIV_REDIRECT_URL,
} from '../lib/derivWS';
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
  const [activeTab, setActiveTab] = useState<'oauth' | 'token' | 'accounts'>('oauth');
  const [tokenInput, setTokenInput] = useState(currentCreds.token || '');
  const [appIdInput, setAppIdInput] = useState(String(currentCreds.appId || DEFAULT_DERIV_APP_ID));
  const [redirectUrlInput, setRedirectUrlInput] = useState(
    String(currentCreds.redirectUrl || DEFAULT_DERIV_REDIRECT_URL)
  );
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
      setAppIdInput(String(creds.appId || DEFAULT_DERIV_APP_ID));
      setRedirectUrlInput(String(creds.redirectUrl || DEFAULT_DERIV_REDIRECT_URL));
      setLinkedAccounts(derivWS.getLinkedAccounts());
      setTestResult(null);
      setSaveMessage(null);
      setIsOAuthWaiting(false);
    }
  }, [isOpen]);

  // Listen for strict same-origin OAuth postMessage callback from popup
  useEffect(() => {
    const handleAuthMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'DERIV_OAUTH_SUCCESS') {
        const { accounts, selectedAccountId, selectedAccount, authMethod } = event.data;
        setIsOAuthWaiting(false);
        sound.play('win');

        const effectiveAccount =
          selectedAccountId || selectedAccount?.account || (accounts && accounts[0] ? accounts[0].account : '');
        const cleanAppId = appIdInput.trim() || DEFAULT_DERIV_APP_ID;
        const cleanRedirectUrl = redirectUrlInput.trim() || DEFAULT_DERIV_REDIRECT_URL;
        derivWS.setAppAndRedirect(cleanAppId, cleanRedirectUrl);

        await derivWS.completeServerSession({
          authMethod,
          appId: cleanAppId,
          accounts: accounts || [],
          selectedAccountId: effectiveAccount,
          selectedAccount,
        });

        setLinkedAccounts(derivWS.getLinkedAccounts());
        setSaveMessage(`Successfully connected Deriv account ${effectiveAccount || ''}!`);
        setTimeout(() => {
          setSaveMessage(null);
          onClose();
        }, 1500);
      } else if (event.data?.type === 'DERIV_OAUTH_ERROR') {
        setIsOAuthWaiting(false);
        setTestResult({
          success: false,
          message: event.data.error || 'Deriv OAuth authorization failed.',
        });
      }
    };

    window.addEventListener('message', handleAuthMessage);
    return () => window.removeEventListener('message', handleAuthMessage);
  }, [appIdInput, redirectUrlInput, onClose]);

  if (!isOpen) return null;

  const currentDiagnostics = derivWS.getDiagnostics();
  const authorizedInfo = currentDiagnostics.authDetails;
  const isCurrentlyAuthorized = currentDiagnostics.hasToken && currentDiagnostics.authorized;

  // Launch Deriv OAuth 2.0 PKCE popup
  const handleLaunchDerivOAuth = async () => {
    const cleanAppId = appIdInput.trim() || DEFAULT_DERIV_APP_ID;
    const rawRedirect = redirectUrlInput.trim() || DEFAULT_DERIV_REDIRECT_URL;
    derivWS.setAppAndRedirect(cleanAppId, rawRedirect);
    setTestResult(null);
    setIsOAuthWaiting(true);
    sound.play('click');

    try {
      const res = await fetch(
        `/api/auth/deriv/url?app_id=${encodeURIComponent(cleanAppId)}&redirect_uri=${encodeURIComponent(rawRedirect)}`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        throw new Error('Failed generating PKCE authorization URL.');
      }
      const data = await res.json();
      const oauthUrl = data.url;

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
          message: 'Browser blocked popup window. Allow popups or use Direct API Token tab below.',
        });
        return;
      }

      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          setIsOAuthWaiting(false);
        }
      }, 1000);
    } catch (err: any) {
      setIsOAuthWaiting(false);
      setTestResult({
        success: false,
        message: err?.message || 'Could not start Deriv OAuth PKCE flow.',
      });
    }
  };

  // Handle pasted PKCE callback URL (?code=...&state=...) or direct PAT token
  const handleParseCallbackUrl = async () => {
    const raw = pastedUrlInput.trim();
    if (!raw) return;
    setIsTesting(true);
    setTestResult(null);

    try {
      const cleanAppId = appIdInput.trim() || DEFAULT_DERIV_APP_ID;
      const savedAccountId = localStorage.getItem('deriv_active_loginid');

      if (raw.includes('code=') && raw.includes('state=')) {
        const queryPart = raw.includes('?') ? raw.split('?')[1] : raw;
        const params = new URLSearchParams(queryPart);
        const res = await fetch('/api/auth/deriv/exchange', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: params.get('code') || '',
            state: params.get('state') || '',
            savedAccountId,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setTestResult({ success: false, message: data.error || 'OAuth code exchange failed.' });
          return;
        }
        await derivWS.completeServerSession(data);
        setLinkedAccounts(derivWS.getLinkedAccounts());
        setSaveMessage(`Connected Deriv account ${data.selectedAccountId || ''}!`);
        sound.play('win');
        setTimeout(() => {
          setSaveMessage(null);
          onClose();
        }, 1500);
      } else {
        setTokenInput(raw);
        setActiveTab('token');
        setTestResult({
          success: true,
          message: 'Token loaded into Direct API Token tab. Click Test & Connect to authenticate.',
        });
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e?.message || 'Failed processing callback parameters.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Authenticate PAT via server vault or verify legacy WS v3 token in volatile memory
  const handleTestAndConnectToken = async () => {
    const cleanToken = tokenInput.trim();
    if (!cleanToken) {
      setTestResult({ success: false, message: 'Please enter a valid Deriv API token or PAT.' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    sound.play('click');

    const cleanAppId = appIdInput.trim() || DEFAULT_DERIV_APP_ID;
    const cleanRedirectUrl = redirectUrlInput.trim() || DEFAULT_DERIV_REDIRECT_URL;
    derivWS.setAppAndRedirect(cleanAppId, cleanRedirectUrl);

    try {
      const savedAccountId = localStorage.getItem('deriv_active_loginid');
      const patRes = await fetch('/api/auth/deriv/pat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cleanToken, appId: cleanAppId, savedAccountId }),
      });
      const patData = await patRes.json();

      if (patRes.ok && patData.success) {
        await derivWS.completeServerSession(patData);
        const sel = patData.selectedAccount;
        const isVirtual = Boolean(sel?.isVirtual ?? sel?.account_type === 'demo');
        onToggleLiveMode(!isVirtual);
        setLinkedAccounts(derivWS.getLinkedAccounts());
        setTokenInput('');

        setTestResult({
          success: true,
          message: `Authenticated ${sel?.account || 'Deriv Account'} (${isVirtual ? 'DEMO' : 'REAL'}) via secure server vault.`,
        });
        setSaveMessage('Credentials verified via Deriv Options PAT vault!');
        sound.play('win');
        setTimeout(() => {
          setSaveMessage(null);
          onClose();
        }, 1500);
        return;
      }

      if (patData.legacyCandidate) {
        const res = await derivWS.testToken(cleanToken, cleanAppId);
        if (res.success && res.authorize) {
          derivWS.connectWithLegacyToken(cleanToken, cleanAppId);
          const isVirtual = Boolean(res.authorize.is_virtual);
          onToggleLiveMode(!isVirtual);
          setLinkedAccounts(derivWS.getLinkedAccounts());
          setTokenInput('');
          sound.play('win');
          setTestResult({
            success: true,
            message: `Connected legacy session ${res.authorize.loginid} • Balance: $${Number(res.authorize.balance).toFixed(2)} ${res.authorize.currency}`,
            details: res.authorize,
          });
          setSaveMessage('Credentials verified in volatile session memory!');
          setTimeout(() => {
            setSaveMessage(null);
            onClose();
          }, 1500);
          return;
        }
      }

      sound.play('alert');
      setTestResult({
        success: false,
        message: patData.error || 'Failed to authenticate token with Deriv.',
      });
    } catch (err: any) {
      sound.play('alert');
      setTestResult({
        success: false,
        message: err?.message || 'Error verifying token.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Quick switch between linked accounts via OTP server selection
  const handleSwitchLinkedAccount = async (acc: DerivLinkedAccount) => {
    sound.play('click');
    const res = await derivWS.switchAccount(acc);
    if (res.ok) {
      onToggleLiveMode(!acc.isVirtual);
      setSaveMessage(`Switched active Deriv account to ${acc.account} (${acc.currency})`);
      setTimeout(() => {
        setSaveMessage(null);
        onClose();
      }, 1200);
    } else {
      setTestResult({ success: false, message: res.error || 'Failed switching account.' });
    }
  };

  const handleResetDemoBalance = async (acc: DerivLinkedAccount) => {
    sound.play('click');
    const res = await derivWS.resetDemoBalance(acc.account_id || acc.account);
    if (res.ok) {
      sound.play('win');
      setSaveMessage(`Reset demo balance for ${acc.account}!`);
      setTimeout(() => setSaveMessage(null), 2000);
    } else {
      setTestResult({ success: false, message: res.error || 'Could not reset demo balance.' });
    }
  };

  const handleCreateDemoAccount = async () => {
    sound.play('click');
    setIsTesting(true);
    try {
      const res = await fetch('/api/deriv/accounts/demo', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setTestResult({ success: false, message: data.error || 'Failed creating demo account.' });
        return;
      }
      await derivWS.completeServerSession(data);
      setLinkedAccounts(derivWS.getLinkedAccounts());
      setSaveMessage('Created new Deriv USD Demo account!');
      sound.play('win');
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || 'Failed creating demo account.' });
    } finally {
      setIsTesting(false);
    }
  };

  // Pre-fill production gateway defaults so user only pastes their API token
  const handleLoadExample = () => {
    setAppIdInput(DEFAULT_DERIV_APP_ID);
    setRedirectUrlInput(DEFAULT_DERIV_REDIRECT_URL);
    derivWS.setRedirectUrl(DEFAULT_DERIV_REDIRECT_URL);
    sound.play('click');
  };

  const handleDisconnect = () => {
    sound.play('toggle');
    derivWS.logout();
    setTokenInput('');
    onToggleLiveMode(false);
    setSaveMessage('Disconnected from Deriv. Connect a Demo or Real account to trade.');
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
                  : 'Not Connected'}
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
                  <div className="flex items-center justify-between gap-2 text-xs font-mono">
                    <span className="text-slate-400 shrink-0">Deriv App ID:</span>
                    <input
                      type="text"
                      value={appIdInput}
                      onChange={(e) => setAppIdInput(e.target.value)}
                      placeholder={DEFAULT_DERIV_APP_ID}
                      className="w-48 bg-slate-950 border border-slate-700 text-right px-2.5 py-1 rounded-lg text-slate-200 outline-none font-mono"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs font-mono">
                    <span className="text-slate-400 shrink-0">Redirect URL:</span>
                    <input
                      type="text"
                      value={redirectUrlInput}
                      onChange={(e) => {
                        setRedirectUrlInput(e.target.value);
                        derivWS.setRedirectUrl(e.target.value);
                      }}
                      placeholder={DEFAULT_DERIV_REDIRECT_URL}
                      className="flex-1 bg-slate-950 border border-slate-700 text-right px-2.5 py-1 rounded-lg text-slate-200 outline-none font-mono text-[11px]"
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
                  If redirected manually, paste the callback URL containing ?code=...&amp;state=... to finish PKCE login:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pastedUrlInput}
                    onChange={(e) => setPastedUrlInput(e.target.value)}
                    placeholder="https://.../auth/deriv/callback?code=...&state=..."
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
                    Deriv API Token / PAT
                  </label>
                  <button
                    type="button"
                    onClick={handleLoadExample}
                    className="text-cyan-400 hover:text-cyan-300 text-[11px] underline flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    Reset Production Defaults
                  </button>
                </div>
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste your Deriv PAT or API token..."
                  className="bg-slate-950 border border-slate-700 hover:border-cyan-500/50 focus:border-cyan-500 text-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none"
                />
                <span className="text-[10px] text-slate-500 flex items-center justify-between">
                  <span>Tokens are vaulted server-side (or volatile memory only) — never written to localStorage.</span>
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
                  Deriv App ID (Default: 33zsnNh6YJ2HWm30oZZJR)
                </label>
                <input
                  type="text"
                  value={appIdInput}
                  onChange={(e) => setAppIdInput(e.target.value)}
                  placeholder="33zsnNh6YJ2HWm30oZZJR or custom registered app ID"
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

          {/* TAB 4: LINKED ACCOUNTS LIST */}
          {activeTab === 'accounts' && linkedAccounts.length > 0 && (
            <div className="flex flex-col gap-2.5 font-mono">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400 text-xs font-bold">
                  Available Accounts ({linkedAccounts.length}):
                </span>
                <button
                  type="button"
                  onClick={handleCreateDemoAccount}
                  disabled={isTesting}
                  className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-bold"
                >
                  + Create Demo Account
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {linkedAccounts.map((acc) => {
                  const isCurrent =
                    derivWS.getSelectedAccount()?.account === acc.account ||
                    authorizedInfo?.loginid === acc.account;
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

                      <div className="flex items-center gap-1.5">
                        {acc.isVirtual && (
                          <button
                            type="button"
                            onClick={() => handleResetDemoBalance(acc)}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg text-[10px] font-bold"
                            title="Reset Demo Balance"
                          >
                            Reset
                          </button>
                        )}
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
            Execution: <span className={!isCurrentlyAuthorized ? 'text-slate-400 font-bold' : isLiveMode ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
              {!isCurrentlyAuthorized ? 'NOT CONNECTED' : isLiveMode ? 'REAL MONEY' : 'DEMO ACCOUNT'}
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
