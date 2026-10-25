import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Bot,
  Key,
  Volume2,
  VolumeX,
  Zap,
  TrendingUp,
  Sparkles,
  HelpCircle,
  LogIn,
  LogOut,
  Brain,
  FileCode,
  FileText,
  Bell,
  RefreshCw,
  Settings,
  Sliders,
  Clock,
  Maximize2,
  BarChart3,
  Palette,
  Headphones,
  Radio,
  Mic,
  MicOff,
  ChevronDown,
  Wrench,
} from 'lucide-react';
import { sound } from '../lib/soundEngine';
import { voice, AGENT_PERSONAS } from '../lib/voiceEngine';
import { voiceInput } from '../lib/voiceInputEngine';
import { autoSyncEngine } from '../lib/autoSyncEngine';
import { derivWS } from '../lib/derivWS';
import { useAuth } from '../context/AuthContext';
import { AccountModeSwitcher } from './AuthModal';
import { VoiceWaveform } from './VoiceWaveformIndicator';

interface NavbarProps {
  balance: number;
  currency: string;
  isLiveMode: boolean;
  isAuthorized: boolean;
  loginid: string | null;
  botEnabled: boolean;
  onToggleBot: () => void;
  onOpenTokenModal: () => void;
  onOpenHelpModal: () => void;
  onOpenAuthModal: () => void;
  onOpenSubAgentModal: () => void;
  onOpenEvolutionModal: () => void;
  onOpenGoogleDocsModal: () => void;
  onOpenGoogleKeepModal?: () => void;
  onOpenBrainModal?: () => void;
  onOpenAlertsModal?: () => void;
  activeAlertsCount?: number;
  onRefreshBalance?: () => void;
  isRefreshingBalance?: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
  isAutonomousRunning: boolean;
  onOpenQuickSettings?: () => void;
  onTriggerAutoSync?: () => void;
  onOpenSettings?: () => void;
  onOpenTheme?: () => void;
  onOpenFullscreenWorkspace?: () => void;
  onOpenTourModal?: () => void;
  onOpenAuditLogModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  balance,
  currency,
  isLiveMode,
  isAuthorized,
  loginid,
  botEnabled,
  onToggleBot,
  onOpenTokenModal,
  onOpenHelpModal,
  onOpenAuthModal,
  onOpenSubAgentModal,
  onOpenEvolutionModal,
  onOpenGoogleDocsModal,
  onOpenGoogleKeepModal,
  onOpenBrainModal,
  onOpenAlertsModal,
  activeAlertsCount = 0,
  onRefreshBalance,
  isRefreshingBalance = false,
  activeTab,
  onTabChange,
  isAutonomousRunning,
  onOpenQuickSettings,
  onTriggerAutoSync,
  onOpenSettings,
  onOpenTheme,
  onOpenFullscreenWorkspace,
  onOpenTourModal,
  onOpenAuditLogModal,
}) => {
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [voiceState, setVoiceState] = useState(voice.getState());
  const [isVoiceListening, setIsVoiceListening] = useState(voiceInput.getIsListening());
  const [syncState, setSyncState] = useState<{
    nextSyncSeconds: number;
    isSyncing: boolean;
    lastSyncTime: number | null;
  }>({ nextSyncSeconds: 600, isSyncing: false, lastSyncTime: null });
  const { user, userProfile, logout } = useAuth();
  const [isAccountsDropdownOpen, setIsAccountsDropdownOpen] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState(() => derivWS.getLinkedAccounts());
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setIsToolsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const unsubWs = derivWS.subscribe((msg) => {
      if (msg.msg_type === 'linked_accounts_updated' || msg.msg_type === 'authorize_success') {
        setLinkedAccounts(derivWS.getLinkedAccounts());
      }
    });
    return () => {
      unsubWs();
    };
  }, []);

  useEffect(() => {
    const unsub = voice.subscribeState((st) => setVoiceState(st));
    const unsubVoiceInput = voiceInput.subscribe((listening) => setIsVoiceListening(listening));
    const unsubSync = autoSyncEngine.subscribe((st) => {
      setSyncState({
        nextSyncSeconds: st.nextSyncSeconds,
        isSyncing: st.isSyncing,
        lastSyncTime: st.lastSyncTime,
      });
    });
    return () => {
      unsub();
      unsubVoiceInput();
      unsubSync();
    };
  }, []);

  const toggleVoiceCommand = () => {
    sound.play('click');
    voiceInput.toggle();
  };

  const toggleVoice = () => {
    const next = !voiceState.isEnabled;
    voice.setEnabled(next);
    sound.play('toggle');
  };

  const toggleSound = () => {
    const next = !audioEnabled;
    setAudioEnabled(next);
    sound.setEnabled(next);
    if (next) sound.play('click');
  };

  const isReal = userProfile?.accountMode === 'REAL' || isLiveMode;

  return (
    <header className="sticky top-0 z-40 w-full bg-slate-950/95 border-b border-slate-800/80 backdrop-blur-md px-3 sm:px-4 py-2 sm:py-2.5 pt-safe">
      <div className="max-w-7xl mx-auto flex flex-col gap-2">
        {/* Main Navbar Top Row */}
        <div className="flex items-center justify-between gap-2.5">
          {/* Brand Logo & Mobile Status */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 font-bold shrink-0">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-sm sm:text-base tracking-tight text-white font-sans">
                  sbatomic<span className="text-cyan-400">4.1</span>
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  <Sparkles className="w-2.5 h-2.5" /> sbagent
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  ONLINE
                </span>
                <span className="text-slate-600">•</span>
                <span className={isReal ? 'text-rose-400 font-bold' : 'text-amber-400 font-semibold'}>
                  {isReal ? 'REAL' : 'DEMO'}
                </span>
              </div>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center p-1 bg-slate-900/90 rounded-xl border border-slate-800 text-xs font-medium">
            <button
              onClick={() => onTabChange('terminal')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'terminal'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Terminal
            </button>
            <button
              onClick={() => onTabChange('analytics')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'analytics'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Multi-Agent & Indicators
            </button>
            <button
              onClick={() => onTabChange('markets')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'markets'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Markets & Win Rates
            </button>
            <button
              onClick={() => onTabChange('blackbox')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'blackbox'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Brain className="w-3.5 h-3.5 text-cyan-400" />
              Blackbox Hub
            </button>
            <button
              onClick={() => onTabChange('copilot')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'copilot'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              sbagent Co-Pilot
            </button>
          </nav>

          {/* Right Action Items */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Balance Pill */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 sm:px-3 py-1 sm:py-1.5 shadow-sm">
              <div className="text-right">
                <div className="font-mono font-bold text-xs sm:text-sm text-slate-100">
                  $
                  {balance
                    ? balance.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : '10,000.00'}
                </div>
              </div>
              {onRefreshBalance && (
                <button
                  onClick={onRefreshBalance}
                  disabled={isRefreshingBalance}
                  className="p-1 text-slate-400 hover:text-cyan-300 rounded-lg hover:bg-slate-800 transition-colors"
                  title="Refresh balance"
                >
                  <RefreshCw
                    className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${
                      isRefreshingBalance ? 'animate-spin text-cyan-400' : ''
                    }`}
                  />
                </button>
              )}
            </div>

            {/* Deriv Log In / Log Out & Multi-Account Switcher */}
            {isAuthorized ? (
              <div className="relative flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-0.5 shadow-sm">
                <button
                  onClick={() => {
                    if (linkedAccounts.length > 1) {
                      setIsAccountsDropdownOpen(!isAccountsDropdownOpen);
                    } else {
                      onOpenTokenModal();
                    }
                    sound.play('click');
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-mono font-bold text-slate-200 hover:text-white transition-all hover:bg-slate-800"
                  title="Switch Active Deriv Account"
                >
                  <span className={`w-2 h-2 rounded-full ${isReal ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  <span className="truncate max-w-[80px] sm:max-w-[110px] text-slate-100 font-bold">
                    {loginid || 'DERIV'}
                  </span>
                  {linkedAccounts.length > 1 && (
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  )}
                </button>

                {/* Disconnect / Logout Button */}
                <button
                  onClick={() => {
                    derivWS.logout();
                    sound.play('click');
                  }}
                  className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                  title="Log Out / Disconnect Deriv Account (Return to Demo Sandbox)"
                  aria-label="Disconnect Deriv Account"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400" />
                </button>

                {/* Multi-Account Dropdown Menu */}
                {isAccountsDropdownOpen && linkedAccounts.length > 1 && (
                  <div className="absolute top-full right-0 mt-1.5 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 z-40 text-xs font-mono">
                    <div className="px-2 py-1 text-[10px] text-slate-500 uppercase font-bold">
                      Linked Deriv Accounts
                    </div>
                    {linkedAccounts.map((acc) => {
                      const isActive = acc.account === loginid;
                      return (
                        <button
                          key={acc.account}
                          onClick={() => {
                            if (acc.token) {
                              derivWS.setCredentials(acc.token);
                              localStorage.setItem('deriv_active_loginid', acc.account);
                            }
                            setIsAccountsDropdownOpen(false);
                            sound.play('trade');
                          }}
                          className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                            isActive
                              ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                              : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span className="truncate">{acc.account}</span>
                          <span className={`text-[9px] px-1 rounded ${acc.isVirtual ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300 font-bold'}`}>
                            {acc.isVirtual ? 'DEMO' : 'REAL'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => {
                  onOpenTokenModal();
                  sound.play('click');
                }}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-xs font-mono font-bold transition-all border shadow-sm bg-gradient-to-r from-emerald-600/20 to-teal-600/20 hover:from-emerald-600/30 hover:to-teal-600/30 text-emerald-400 hover:text-emerald-200 border-emerald-500/40"
                title="Connect Deriv Real or Virtual Account"
              >
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <LogIn className="w-3 h-3 text-emerald-400" />
                </div>
                <span className="truncate font-bold">CONNECT DERIV</span>
              </button>
            )}

            {/* Desktop Only Buttons & Controls */}
            <div className="hidden lg:flex items-center gap-1.5">
              <AccountModeSwitcher />

              {/* Unified Tools Dropdown Menu */}
              <div className="relative" ref={toolsMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsToolsMenuOpen(!isToolsMenuOpen);
                    sound.play('click');
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border shadow-sm ${
                    isToolsMenuOpen
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-cyan-950/40'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800'
                  }`}
                  title="Open Autonomous Intelligence, Reports & Audits Tools"
                  aria-expanded={isToolsMenuOpen}
                >
                  <Wrench className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="tracking-wide">TOOLS</span>
                  {activeAlertsCount > 0 && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  )}
                  <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isToolsMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isToolsMenuOpen && (
                  <div className="absolute top-full right-0 mt-2 w-72 bg-slate-950/98 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150 font-mono text-xs">
                    {/* Category 1: Intelligence */}
                    <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      Autonomous Intelligence
                    </div>
                    {onOpenBrainModal && (
                      <button
                        onClick={() => {
                          onOpenBrainModal();
                          setIsToolsMenuOpen(false);
                          sound.play('click');
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-purple-950/40 hover:border-purple-800/50 border border-transparent transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <Brain className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
                          <span className="font-medium">Brain Anatomy</span>
                        </div>
                        <span className="text-[10px] text-purple-400/80">Cognitive</span>
                      </button>
                    )}
                    {onOpenSubAgentModal && (
                      <button
                        onClick={() => {
                          onOpenSubAgentModal();
                          setIsToolsMenuOpen(false);
                          sound.play('click');
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-cyan-950/40 hover:border-cyan-800/50 border border-transparent transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <Bot className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                          <span className="font-medium">Subagent Editor</span>
                        </div>
                        <span className="text-[10px] text-cyan-400/80">Nodes</span>
                      </button>
                    )}
                    {onOpenEvolutionModal && (
                      <button
                        onClick={() => {
                          onOpenEvolutionModal();
                          setIsToolsMenuOpen(false);
                          sound.play('click');
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-emerald-950/40 hover:border-emerald-800/50 border border-transparent transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                          <span className="font-medium">Strategy Evolution</span>
                        </div>
                        <span className="text-[10px] text-emerald-400/80">Genetic</span>
                      </button>
                    )}

                    {/* Category 2: Reporting & Notes */}
                    <div className="border-t border-slate-800/80 my-1.5" />
                    <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      Reporting & Notes
                    </div>
                    {onOpenGoogleDocsModal && (
                      <button
                        onClick={() => {
                          onOpenGoogleDocsModal();
                          setIsToolsMenuOpen(false);
                          sound.play('click');
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-blue-950/40 hover:border-blue-800/50 border border-transparent transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <FileCode className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                          <span className="font-medium">Google Docs Reports</span>
                        </div>
                        <span className="text-[10px] text-blue-400/80">Export</span>
                      </button>
                    )}
                    {onOpenGoogleKeepModal && (
                      <button
                        onClick={() => {
                          onOpenGoogleKeepModal();
                          setIsToolsMenuOpen(false);
                          sound.play('click');
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-amber-950/40 hover:border-amber-800/50 border border-transparent transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                          <span className="font-medium">Google Keep Notes</span>
                        </div>
                        <span className="text-[10px] text-amber-400/80">Sync</span>
                      </button>
                    )}

                    {/* Category 3: Audits & Telemetry */}
                    <div className="border-t border-slate-800/80 my-1.5" />
                    <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      Audits & Telemetry
                    </div>
                    {onOpenAuditLogModal && (
                      <button
                        onClick={() => {
                          onOpenAuditLogModal();
                          setIsToolsMenuOpen(false);
                          sound.play('click');
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900 border border-transparent transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-400 group-hover:scale-110 transition-transform" />
                          <span className="font-medium">Structured Audit Log</span>
                        </div>
                        <span className="text-[10px] text-slate-500">Trace</span>
                      </button>
                    )}
                    {onOpenAlertsModal && (
                      <button
                        onClick={() => {
                          onOpenAlertsModal();
                          setIsToolsMenuOpen(false);
                          sound.play('click');
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-amber-950/40 border border-transparent transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <Bell className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                          <span className="font-medium">Alert Center</span>
                        </div>
                        {activeAlertsCount > 0 ? (
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-bold text-[9px]">
                            {activeAlertsCount}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">0</span>
                        )}
                      </button>
                    )}

                    {/* Category 4: System & Display */}
                    <div className="border-t border-slate-800/80 my-1.5" />
                    <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      System & Display
                    </div>
                    {onOpenTheme && (
                      <button
                        onClick={() => {
                          onOpenTheme();
                          setIsToolsMenuOpen(false);
                          sound.play('click');
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-pink-950/40 border border-transparent transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <Palette className="w-4 h-4 text-pink-400 group-hover:scale-110 transition-transform" />
                          <span className="font-medium">Visual Themes</span>
                        </div>
                        <span className="text-[10px] text-pink-400/80">6 Themes</span>
                      </button>
                    )}
                    {(onOpenTourModal || onOpenHelpModal) && (
                      <button
                        onClick={() => {
                          if (onOpenTourModal) onOpenTourModal();
                          else onOpenHelpModal();
                          setIsToolsMenuOpen(false);
                          sound.play('click');
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-cyan-950/40 border border-transparent transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <HelpCircle className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                          <span className="font-medium">Guided Platform Tour</span>
                        </div>
                        <span className="text-[10px] text-cyan-400/80">Help</span>
                      </button>
                    )}
                    {onOpenFullscreenWorkspace && (
                      <button
                        onClick={() => {
                          onOpenFullscreenWorkspace();
                          setIsToolsMenuOpen(false);
                          sound.play('click');
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900 border border-transparent transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <Maximize2 className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                          <span className="font-medium">Fullscreen Workspace</span>
                        </div>
                        <span className="text-[10px] text-slate-500">Expand</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Bot Toggle Status Button */}
              <button
                onClick={onToggleBot}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold font-mono transition-all ${
                  botEnabled
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/30'
                    : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                }`}
                title={botEnabled ? 'Bot Active - Click to stop autonomous trading' : 'Bot Idle - Click to start autonomous trading'}
              >
                <Bot className="w-3.5 h-3.5" />
                <span>BOT: {botEnabled ? 'ON' : 'OFF'}</span>
              </button>

              {/* Agent Voice Output Toggle with live speaking wave indicator */}
              <button
                onClick={toggleVoice}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono transition-all border ${
                  voiceState.isSpeaking
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 shadow-md shadow-cyan-500/30'
                    : voiceState.isEnabled
                    ? 'bg-slate-900 text-cyan-300 border-slate-800 hover:border-cyan-500/40'
                    : 'bg-slate-900 text-slate-500 border-slate-850 hover:text-slate-400'
                }`}
                title={
                  voiceState.isSpeaking
                    ? 'Agent Voice is speaking (click to mute)'
                    : voiceState.isEnabled
                    ? 'Agent Voice: Enabled (click to mute)'
                    : 'Agent Voice: Muted (click to enable)'
                }
              >
                <Headphones className={`w-3.5 h-3.5 ${voiceState.isSpeaking ? 'animate-bounce text-cyan-300' : ''}`} />
                {voiceState.isSpeaking ? (
                  <div className="flex items-center gap-1.5">
                    <VoiceWaveform barCount={6} height="xs" color="cyan" active={true} speedMultiplier={voiceState.rateMultiplier} />
                    <span className="hidden xl:inline text-[10px] font-bold text-cyan-300 tracking-wider">
                      TALKING
                    </span>
                  </div>
                ) : (
                  <span className="hidden xl:inline text-[10px] font-bold">
                    VOICE: {voiceState.isEnabled ? 'ON' : 'OFF'}
                  </span>
                )}
              </button>

              {/* Hands-Free Voice Command Microphone Trigger */}
              <button
                onClick={toggleVoiceCommand}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono transition-all border ${
                  isVoiceListening
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/60 shadow-md shadow-rose-500/30 animate-pulse'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-cyan-500/40 hover:text-cyan-300'
                }`}
                title={isVoiceListening ? 'Stop Voice Command Listening' : 'Voice Command: Say "Open Rise" or "Set target to 10 minutes"'}
              >
                <Mic className={`w-3.5 h-3.5 ${isVoiceListening ? 'text-rose-400 animate-bounce' : 'text-cyan-400'}`} />
                <span className="hidden xl:inline text-[10px] font-bold">
                  {isVoiceListening ? 'MIC ACTIVE' : 'VOICE TRADING'}
                </span>
              </button>

              {/* Audio Chime */}
              <button
                onClick={toggleSound}
                className="p-1.5 rounded-xl bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                title="Audio Sound Effects"
              >
                {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </div>

            {/* 10-Min Auto-Sync Indicator & Instant Trigger */}
            <button
              onClick={() => {
                if (onTriggerAutoSync) {
                  onTriggerAutoSync();
                } else {
                  autoSyncEngine.triggerSync();
                }
                sound.play('click');
              }}
              disabled={syncState.isSyncing}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border shadow-sm ${
                syncState.isSyncing
                  ? 'bg-amber-500/25 text-amber-300 border-amber-500/60 animate-pulse'
                  : 'bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border-amber-600/40 hover:border-amber-400'
              }`}
              title="10-Minute Intelligent Auto-Sync to Google Keep, Drive & Firestore (Click to Sync Now)"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${syncState.isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden xl:inline text-[10px] text-amber-400/80">AUTO-SYNC:</span>
              <span className="text-[11px] font-mono font-bold">
                {syncState.isSyncing
                  ? 'SYNCING...'
                  : `${Math.floor(syncState.nextSyncSeconds / 60)}:${(syncState.nextSyncSeconds % 60).toString().padStart(2, '0')}`}
              </span>
            </button>

            {/* Settings Trigger */}
            {onOpenQuickSettings && (
              <button
                onClick={() => {
                  onOpenQuickSettings();
                  sound.play('click');
                }}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold font-mono bg-cyan-950/80 hover:bg-cyan-900/90 text-cyan-300 border border-cyan-500/50 hover:border-cyan-400 transition-all shadow-sm shadow-cyan-950/40 active:scale-95"
                title="Quick Execution, AI Gate & Stake Settings"
                aria-label="Quick Settings"
              >
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[11px] sm:text-xs font-bold tracking-tight">SETTINGS</span>
              </button>
            )}

            {/* Universal Settings Drawer Trigger */}
            {onOpenSettings && !onOpenQuickSettings && (
              <button
                onClick={() => {
                  onOpenSettings();
                  sound.play('click');
                }}
                className="p-2 sm:p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-cyan-400 border border-slate-800 transition-colors shadow-sm"
                title="Open Settings Drawer"
                aria-label="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            {/* User Auth Profile */}
            {user ? (
              <div className="hidden sm:flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-[10px] font-bold">
                  {user.displayName ? user.displayName[0].toUpperCase() : 'U'}
                </div>
                <button
                  onClick={logout}
                  className="p-1 text-slate-400 hover:text-rose-400"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuthModal}
                className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-sm"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Auth</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation Pills Row (Shown on < 768px) */}
        <div className="flex md:hidden items-center justify-between gap-1 p-1 bg-slate-900/90 rounded-xl border border-slate-800 text-xs font-medium">
          <button
            onClick={() => onTabChange('terminal')}
            className={`flex-1 py-1 rounded-lg text-center font-mono font-bold transition-all text-[11px] flex items-center justify-center gap-1 ${
              activeTab === 'terminal'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-3 h-3" />
            <span>Terminal</span>
          </button>
          <button
            onClick={() => onTabChange('analytics')}
            className={`flex-1 py-1 rounded-lg text-center font-mono font-bold transition-all text-[11px] flex items-center justify-center gap-1 ${
              activeTab === 'analytics'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-3 h-3" />
            <span>Analytics</span>
          </button>
          <button
            onClick={() => onTabChange('markets')}
            className={`flex-1 py-1 rounded-lg text-center font-mono font-bold transition-all text-[11px] flex items-center justify-center gap-1 ${
              activeTab === 'markets'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-3 h-3" />
            <span>Markets</span>
          </button>
          <button
            onClick={() => onTabChange('blackbox')}
            className={`flex-1 py-1 rounded-lg text-center font-mono font-bold transition-all text-[11px] flex items-center justify-center gap-1 ${
              activeTab === 'blackbox'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Brain className="w-3 h-3" />
            <span>Blackbox</span>
          </button>
          <button
            onClick={() => onTabChange('copilot')}
            className={`flex-1 py-1 rounded-lg text-center font-mono font-bold transition-all text-[11px] flex items-center justify-center gap-1 ${
              activeTab === 'copilot'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>Copilot</span>
          </button>
        </div>
      </div>
    </header>
  );
};
