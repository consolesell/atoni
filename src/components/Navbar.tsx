import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { sound } from '../lib/soundEngine';
import { voice, AGENT_PERSONAS } from '../lib/voiceEngine';
import { voiceInput } from '../lib/voiceInputEngine';
import { autoSyncEngine } from '../lib/autoSyncEngine';
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

            {/* Deriv In-App Login Button */}
            <button
              onClick={() => {
                onOpenTokenModal();
                sound.play('click');
              }}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-xs font-mono font-bold transition-all border shadow-sm ${
                isAuthorized
                  ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/40'
                  : 'bg-gradient-to-r from-rose-600/20 to-red-600/20 hover:from-rose-600/30 hover:to-red-600/30 text-rose-400 hover:text-rose-200 border-rose-500/40'
              }`}
              title="Log in to Deriv without leaving the app"
            >
              <div className="flex items-center gap-1">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isAuthorized ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                  }`}
                />
                <LogIn className="w-3 h-3 text-rose-400" />
              </div>
              <span className="truncate max-w-[80px] sm:max-w-[120px]">
                {isAuthorized ? loginid || 'DERIV' : 'DERIV LOGIN'}
              </span>
            </button>

            {/* Desktop Only Buttons */}
            <div className="hidden lg:flex items-center gap-1.5">
              <AccountModeSwitcher />

              {/* Brain Anatomy Modal Trigger */}
              {onOpenBrainModal && (
                <button
                  onClick={() => {
                    onOpenBrainModal();
                    sound.play('click');
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold font-mono bg-purple-950/60 hover:bg-purple-900/60 text-purple-300 border border-purple-800/60 transition-all shadow-sm"
                  title="SBAgent Brain Anatomy & Cognitive Graph"
                >
                  <Brain className="w-3.5 h-3.5 text-purple-400" />
                  <span className="hidden xl:inline">BRAIN</span>
                </button>
              )}

              {/* Google Keep Trading Notes Trigger */}
              {onOpenGoogleKeepModal && (
                <button
                  onClick={() => {
                    onOpenGoogleKeepModal();
                    sound.play('click');
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold font-mono bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-800/60 transition-all shadow-sm"
                  title="Google Keep & Trading Notes"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden xl:inline">KEEP NOTES</span>
                </button>
              )}

              {/* Google Docs Report Trigger */}
              {onOpenGoogleDocsModal && (
                <button
                  onClick={() => {
                    onOpenGoogleDocsModal();
                    sound.play('click');
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold font-mono bg-blue-950/60 hover:bg-blue-900/60 text-blue-300 border border-blue-800/60 transition-all shadow-sm"
                  title="Google Docs Intelligence Reports"
                >
                  <FileCode className="w-3.5 h-3.5 text-blue-400" />
                  <span className="hidden xl:inline">DOCS</span>
                </button>
              )}

              {/* Bot Toggle Button */}
              <button
                onClick={onToggleBot}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold font-mono transition-all ${
                  botEnabled
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/30'
                    : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                <span>BOT: {botEnabled ? 'ON' : 'OFF'}</span>
              </button>

              {/* Alerts */}
              {onOpenAlertsModal && (
                <button
                  onClick={onOpenAlertsModal}
                  className="relative p-1.5 rounded-xl bg-slate-900 text-slate-300 border border-slate-800 hover:text-white"
                  title="Alerts"
                >
                  <Bell className="w-4 h-4 text-amber-400" />
                  {activeAlertsCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 text-slate-950 font-mono text-[8px] font-bold flex items-center justify-center">
                      {activeAlertsCount}
                    </span>
                  )}
                </button>
              )}

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

            {/* Quick Settings Button */}
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

            {/* Fullscreen Workspace Expansion Trigger */}
            {onOpenFullscreenWorkspace && (
              <button
                onClick={() => {
                  onOpenFullscreenWorkspace();
                  sound.play('click');
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 sm:py-2 rounded-xl text-xs font-semibold font-mono bg-cyan-950/70 hover:bg-cyan-900/70 text-cyan-300 border border-cyan-600/50 hover:border-cyan-400 transition-all shadow-sm shadow-cyan-950/30"
                title="Expand Fullscreen Workspace"
                aria-label="Fullscreen Workspace"
              >
                <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden md:inline">FULLSCREEN</span>
              </button>
            )}

            {/* Settings Gear Drawer Trigger (Universal) */}
            {onOpenSettings && (
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

            {/* Themes & Visuals Quick Trigger (6 Custom Themes) */}
            {onOpenTheme && (
              <button
                onClick={() => {
                  onOpenTheme();
                  sound.play('click');
                }}
                className="p-2 sm:p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-pink-400 border border-slate-800 transition-colors shadow-sm relative group"
                title="Themes & Visuals (Dark Neon, Ocean, Forest, Sunset, Light, Purple)"
                aria-label="Themes & Visuals"
              >
                <Palette className="w-4 h-4 text-pink-400 group-hover:rotate-12 transition-transform" />
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
