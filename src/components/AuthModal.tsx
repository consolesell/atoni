import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LogIn,
  UserPlus,
  ShieldCheck,
  Mail,
  Lock,
  X,
  ExternalLink,
  Key,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Layers,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { derivWS } from '../lib/derivWS';
import { sound } from '../lib/soundEngine';
import { DerivLinkedAccount } from '../types/trading';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const {
    user,
    userProfile,
    signInWithGoogle,
    signInEmail,
    signUpEmail,
    signInWithDerivOAuth,
    updateAccountMode,
  } = useAuth();

  // Active sub-tab: 'deriv_oauth' (primary) | 'cloud_email'
  const [activeTab, setActiveTab] = useState<'deriv_oauth' | 'cloud_email'>('deriv_oauth');
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Deriv OAuth states
  const [isOAuthWaiting, setIsOAuthWaiting] = useState(false);
  const [appIdInput, setAppIdInput] = useState<string>(() => {
    return localStorage.getItem('deriv_app_id') || '1089';
  });
  const [showAdvancedAppId, setShowAdvancedAppId] = useState(false);
  const [manualCallbackInput, setManualCallbackInput] = useState('');
  const [showManualPaste, setShowManualPaste] = useState(false);

  // Current Deriv connection diagnostics
  const currentDiagnostics = derivWS.getDiagnostics();
  const linkedAccounts = derivWS.getLinkedAccounts();
  const isCurrentlyAuthorized = currentDiagnostics.hasToken && currentDiagnostics.authorized;

  // Check for direct redirect callback parameters in current URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(
        window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash
      );
      const params = new URLSearchParams();
      urlParams.forEach((v, k) => params.set(k, v));
      hashParams.forEach((v, k) => params.set(k, v));

      if (params.has('token1') || params.has('acct1') || params.has('token')) {
        const accounts: DerivLinkedAccount[] = [];
        let i = 1;
        while (params.has('acct' + i) && params.has('token' + i)) {
          accounts.push({
            account: params.get('acct' + i)!,
            token: params.get('token' + i)!,
            currency: params.get('cur' + i) || 'USD',
            isVirtual: params.get('acct' + i)!.startsWith('VRTC'),
          });
          i++;
        }
        const token = params.get('token1') || params.get('token') || (accounts[0]?.token);
        const acct = params.get('acct1') || params.get('acct') || (accounts[0]?.account || 'CR_USER');
        if (token) {
          const cleanAppId = appIdInput.trim() || '1089';
          localStorage.setItem('deriv_api_token', token);
          localStorage.setItem('deriv_active_loginid', acct);
          localStorage.setItem('deriv_app_id', cleanAppId);
          if (accounts.length > 0) {
            localStorage.setItem('deriv_linked_accounts', JSON.stringify(accounts));
            derivWS.setLinkedAccounts(accounts);
          }
          derivWS.setCredentials(token, cleanAppId);
          derivWS.send({ authorize: token });
          signInWithDerivOAuth(accounts, token, acct, cleanAppId);
          sound.play('win');
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    } catch (e) {
      console.warn('URL OAuth check notice:', e);
    }
  }, [appIdInput, signInWithDerivOAuth]);

  // Listen for Deriv OAuth postMessage callbacks from popup
  useEffect(() => {
    if (!isOpen) return;

    const handleOAuthMessage = async (event: MessageEvent) => {
      // Validate origin if available
      const origin = event.origin;
      if (
        origin &&
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost') &&
        !origin.includes('127.0.0.1') &&
        !origin.includes('deriv.com')
      ) {
        // Skip unknown origins
        return;
      }

      if (event.data?.type === 'DERIV_OAUTH_SUCCESS') {
        const { accounts, primaryToken, primaryAccount, currency } = event.data;
        setIsOAuthWaiting(false);
        setLoading(true);

        try {
          const cleanAppId = appIdInput.trim() || '1089';

          // 1. Sync accounts to WebSocket engine and localStorage
          if (Array.isArray(accounts) && accounts.length > 0) {
            derivWS.setLinkedAccounts(accounts);
            try {
              localStorage.setItem('deriv_linked_accounts', JSON.stringify(accounts));
            } catch (e) {}
          }

          // 2. Authorize token in WebSocket and securely save to localStorage
          if (primaryToken) {
            try {
              localStorage.setItem('deriv_api_token', primaryToken);
              localStorage.setItem('deriv_active_loginid', primaryAccount || 'CR_USER');
              localStorage.setItem('deriv_app_id', cleanAppId);
            } catch (e) {}
            derivWS.setCredentials(primaryToken, cleanAppId);
            derivWS.send({ authorize: primaryToken });
          }

          // 3. Save into AuthContext (application state & Firestore/local profile)
          await signInWithDerivOAuth(
            accounts || [],
            primaryToken || '',
            primaryAccount || 'CR_USER',
            cleanAppId
          );

          sound.play('win');
          setSuccessMsg(
            `Successfully connected ${primaryAccount || 'Deriv Account'}! (${accounts?.length || 1} account(s) linked)`
          );

          setTimeout(() => {
            setSuccessMsg(null);
            onClose();
          }, 1400);
        } catch (err: any) {
          console.error('Failed to finalize Deriv OAuth login:', err);
          setError(err?.message || 'Failed to finalize Deriv login.');
        } finally {
          setLoading(false);
        }
      } else if (event.data?.type === 'DERIV_OAUTH_ERROR') {
        setIsOAuthWaiting(false);
        setError(`Deriv Authorization Error: ${event.data.error || 'Authentication rejected'}`);
        sound.play('alert');
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [isOpen, appIdInput, signInWithDerivOAuth, onClose]);

  if (!isOpen) return null;

  // Launch Deriv OAuth Popup
  const handleLaunchDerivOAuth = async () => {
    setError(null);
    setSuccessMsg(null);
    const cleanAppId = appIdInput.trim() || '1089';

    try {
      setIsOAuthWaiting(true);
      sound.play('click');

      // 1. Attempt to fetch authorize URL from server API
      let oauthUrl = '';
      try {
        const res = await fetch(`/api/auth/deriv/url?app_id=${encodeURIComponent(cleanAppId)}`);
        if (res.ok) {
          const data = await res.json();
          oauthUrl = data.url;
        }
      } catch (err) {
        console.warn('Fallback to direct client OAuth URL:', err);
      }

      // If server route didn't return, build directly using current origin
      if (!oauthUrl) {
        const redirectUri = `${window.location.origin}/auth/deriv/callback`;
        const params = new URLSearchParams({
          app_id: cleanAppId,
          l: 'en',
          brand: 'deriv',
          redirect_uri: redirectUri,
        });
        oauthUrl = `https://oauth.deriv.com/oauth2/authorize?${params.toString()}`;
      }

      // 2. Open provider's authorize URL directly in popup
      const popupWidth = 520;
      const popupHeight = 720;
      const left = window.screenX + (window.outerWidth - popupWidth) / 2;
      const top = window.screenY + (window.outerHeight - popupHeight) / 2;

      const popup = window.open(
        oauthUrl,
        'deriv_oauth_popup',
        `width=${popupWidth},height=${popupHeight},left=${left},top=${top},status=no,toolbar=no,menubar=no,scrollbars=yes`
      );

      if (!popup) {
        setIsOAuthWaiting(false);
        setError('Popup was blocked by your browser. Please allow popups or use manual token paste below.');
        setShowManualPaste(true);
        return;
      }

      // Monitor popup closure in case user closes it before authenticating
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          setIsOAuthWaiting(false);
        }
      }, 1000);
    } catch (err: any) {
      console.error('Deriv OAuth launch failed:', err);
      setIsOAuthWaiting(false);
      setError(err?.message || 'Could not launch Deriv OAuth window.');
    }
  };

  // Parse manual callback URL or pasted token in case popup was blocked
  const handleParseManualCallback = async () => {
    if (!manualCallbackInput.trim()) return;
    setError(null);
    try {
      let raw = manualCallbackInput.trim();
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

      if (!singleToken) {
        throw new Error('No valid token found in pasted string. Format: ?acct1=...&token1=...');
      }

      const cleanAppId = appIdInput.trim() || '1089';
      if (accounts.length > 0) {
        derivWS.setLinkedAccounts(accounts);
      }
      derivWS.setCredentials(singleToken, cleanAppId);
      derivWS.send({ authorize: singleToken });

      await signInWithDerivOAuth(accounts, singleToken, singleAcct, cleanAppId);
      sound.play('win');
      setSuccessMsg(`Imported ${singleAcct} successfully!`);
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'Failed to parse manual callback');
    }
  };

  // Email / Password submission
  const handleSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isSignUp) {
        await signUpEmail(email, password);
      } else {
        await signInEmail(email, password);
      }
      sound.play('win');
      onClose();
    } catch (err: any) {
      console.error('Auth error:', err);
      let msg = err.message || 'Authentication failed';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        msg = 'Invalid email or password credentials.';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = 'An account with this email already exists. Please log in.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password should be at least 6 characters.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Google Sign-In
  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      sound.play('win');
      onClose();
    } catch (err: any) {
      console.error('Google Sign In error:', err);
      setError(err.message || 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl p-6 text-slate-100 overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 flex items-center justify-center">
            {/* Deriv Logo Glyph */}
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" fillOpacity="0" />
              <circle cx="12" cy="12" r="10" fill="#ef4444" fillOpacity="0.15" stroke="#ef4444" strokeWidth="1.5" />
              <path d="M8 8l8 4-8 4V8z" fill="#ef4444" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-100">
                {activeTab === 'deriv_oauth' ? 'Deriv Authentication' : 'Cloud Terminal Account'}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                OAuth 2.0
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Securely authenticate your Deriv real & demo accounts without leaving the app
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center p-1 bg-slate-950/70 rounded-xl border border-slate-800 mb-5 text-xs font-semibold">
          <button
            onClick={() => {
              setActiveTab('deriv_oauth');
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
              activeTab === 'deriv_oauth'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-950/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Deriv OAuth 2.0 (Official)</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('cloud_email');
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
              activeTab === 'cloud_email'
                ? 'bg-slate-800 text-slate-100 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>Google & Email</span>
          </button>
        </div>

        {/* Error & Success Banners */}
        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <div>
              <span className="font-semibold">Notice:</span> {error}
            </div>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* TAB 1: DERIV OAUTH 2.0 LOGIN */}
        {activeTab === 'deriv_oauth' && (
          <div className="space-y-4">
            {/* If currently authorized, display connected banner */}
            {isCurrentlyAuthorized && currentDiagnostics.authDetails && (
              <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold text-xs">
                    ✓
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                      <span>Connected: {currentDiagnostics.authDetails.loginid}</span>
                      <span className="px-1.5 py-0.2 bg-emerald-500/20 text-[10px] rounded text-emerald-400 font-mono">
                        {currentDiagnostics.authDetails.is_virtual ? 'DEMO' : 'REAL'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Balance: ${Number(currentDiagnostics.authDetails.balance || 0).toFixed(2)}{' '}
                      {currentDiagnostics.authDetails.currency || 'USD'}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    derivWS.logout();
                    sound.play('toggle');
                  }}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 rounded-lg transition-colors"
                >
                  Disconnect
                </button>
              </div>
            )}

            {/* Waiting for OAuth Popup State */}
            {isOAuthWaiting ? (
              <div className="p-5 bg-slate-950/90 border border-rose-500/40 rounded-xl text-center space-y-3.5 shadow-xl animate-in fade-in">
                <div className="relative inline-flex items-center justify-center">
                  <span className="w-10 h-10 rounded-full border-2 border-rose-500 border-t-transparent animate-spin inline-block"></span>
                  <div className="absolute w-4 h-4 rounded-full bg-rose-500 animate-pulse"></div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    Awaiting Deriv OAuth Approval in Popup...
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                    Please log into your official Deriv account in the opened window. Once approved, you
                    will be seamlessly authenticated here without refreshing.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    onClick={handleLaunchDerivOAuth}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Re-open Popup</span>
                  </button>
                  <button
                    onClick={() => setIsOAuthWaiting(false)}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs rounded-lg border border-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Premier Deriv OAuth Button */
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleLaunchDerivOAuth}
                  disabled={loading}
                  aria-label="Connect Deriv Account"
                  title="Connect Deriv Account (OAuth 2.0)"
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-rose-600 via-rose-500 to-red-600 hover:from-rose-500 hover:to-red-500 active:scale-[0.99] text-white font-bold text-sm rounded-xl transition-all shadow-xl shadow-rose-950/60 flex items-center justify-between group border border-rose-400/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center border border-white/20">
                      <ExternalLink className="w-4 h-4 text-white group-hover:rotate-12 transition-transform" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold flex items-center gap-1.5">
                        <span>Connect Deriv Account</span>
                        <span className="text-[10px] px-1.5 py-0.2 bg-white/20 rounded font-normal">
                          OAuth 2.0
                        </span>
                      </div>
                      <div className="text-[11px] font-normal text-rose-100/80">
                        Official Deriv Callback • Instant Account & Token Sync
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-white/80 group-hover:translate-x-1 transition-transform" />
                </button>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-400 flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p>
                    Connecting via Deriv OAuth grants autonomous subagents authorized execution capabilities for your
                    demo or real balance without storing your password.
                  </p>
                </div>
              </div>
            )}

            {/* Linked Accounts Switcher if available */}
            {linkedAccounts.length > 1 && (
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-rose-400" />
                  <span>Linked Deriv Accounts ({linkedAccounts.length})</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {linkedAccounts.map((acc) => {
                    const isSelected = currentDiagnostics.authDetails?.loginid === acc.account;
                    return (
                      <button
                        key={acc.account}
                        onClick={() => {
                          derivWS.switchAccount(acc);
                          sound.play('click');
                        }}
                        className={`p-2 rounded-lg text-left text-xs font-mono transition-all border ${
                          isSelected
                            ? 'bg-rose-500/20 border-rose-500/50 text-rose-200'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="font-bold flex items-center justify-between">
                          <span>{acc.account}</span>
                          <span
                            className={`text-[9px] px-1 rounded ${
                              acc.isVirtual ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            {acc.isVirtual ? 'DEMO' : 'REAL'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500">{acc.currency || 'USD'}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Advanced Deriv App ID Config */}
            <div className="border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setShowAdvancedAppId(!showAdvancedAppId)}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvancedAppId ? 'rotate-180' : ''}`} />
                <span>Advanced: Custom Deriv App ID (Current: {appIdInput})</span>
              </button>

              {showAdvancedAppId && (
                <div className="mt-2.5 p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2 text-xs animate-in fade-in">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    Deriv Application ID (Registered OAuth App)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={appIdInput}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        setAppIdInput(val);
                        localStorage.setItem('deriv_app_id', val);
                      }}
                      placeholder="1089"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-rose-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setAppIdInput('1089');
                        localStorage.setItem('deriv_app_id', '1089');
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px]"
                    >
                      Reset Default
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Default 1089 is Deriv's official community testing app ID.
                  </p>
                </div>
              )}
            </div>

            {/* Manual Callback Paste Fallback */}
            <div>
              <button
                type="button"
                onClick={() => setShowManualPaste(!showManualPaste)}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
              >
                <Key className="w-3.5 h-3.5 text-slate-500" />
                <span>{showManualPaste ? 'Hide manual token import' : 'Popup blocked? Paste callback URL or API token'}</span>
              </button>

              {showManualPaste && (
                <div className="mt-2.5 p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2 text-xs animate-in fade-in">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    Paste OAuth Callback URL or API Token
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={manualCallbackInput}
                      onChange={(e) => setManualCallbackInput(e.target.value)}
                      placeholder="https://.../auth/deriv/callback?acct1=...&token1=... OR a1-..."
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-rose-500"
                    />
                    <button
                      type="button"
                      onClick={handleParseManualCallback}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold"
                    >
                      Import
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: EMAIL / GOOGLE SIGN IN */}
        {activeTab === 'cloud_email' && (
          <div className="space-y-4">
            <form onSubmit={handleSubmitEmail} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="trader@deriv.com"
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl py-2 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl py-2 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-all shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="inline-block animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : isSignUp ? (
                  <>
                    <UserPlus className="w-4 h-4" /> Create Cloud Account
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" /> Sign In with Email
                  </>
                )}
              </button>
            </form>

            <div className="relative my-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-slate-900 px-3 text-slate-500 font-medium">Or continue with</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700/80 active:bg-slate-700 text-slate-200 font-medium text-xs rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2"
            >
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
              <span>Google Cloud Identity</span>
            </button>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                }}
                className="text-xs text-slate-400 hover:text-emerald-400 transition-colors"
              >
                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account yet? Create one"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const AccountModeSwitcher: React.FC = () => {
  const { userProfile, updateAccountMode } = useAuth();
  const isReal = userProfile?.accountMode === 'REAL';

  return (
    <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
      <button
        onClick={() => updateAccountMode('DEMO')}
        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
          !isReal
            ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
        DEMO
      </button>
      <button
        onClick={() => updateAccountMode('REAL')}
        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
          isReal
            ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
        REAL
      </button>
    </div>
  );
};
