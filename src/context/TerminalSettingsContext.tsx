import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  TerminalSettings,
  DEFAULT_TERMINAL_SETTINGS,
} from '../types/settings';
import { sound } from '../lib/soundEngine';
import { voice, AGENT_PERSONAS, AgentVoicePersonaId } from '../lib/voiceEngine';
import { derivWS } from '../lib/derivWS';

const STORAGE_KEY = 'terminal_settings_v4';

interface TerminalSettingsContextType {
  settings: TerminalSettings;
  updateSettings: (updates: Partial<TerminalSettings>) => void;
  updateGeneral: (updates: Partial<TerminalSettings['general']>) => void;
  updateRisk: (updates: Partial<TerminalSettings['risk']>) => void;
  updateTrailingStop: (updates: Partial<TerminalSettings['trailingStop']>) => void;
  updateIndicators: (updates: Partial<TerminalSettings['indicators']>) => void;
  updateAI: (updates: Partial<TerminalSettings['ai']>) => void;
  updateAudio: (updates: Partial<TerminalSettings['audio']>) => void;
  updateConnection: (updates: Partial<TerminalSettings['connection']>) => void;
  updateInterface: (updates: Partial<TerminalSettings['interface']>) => void;
  resetToDefaults: () => void;
  exportSettingsJSON: () => string;
  importSettingsJSON: (jsonStr: string) => { success: boolean; error?: string };
}

const TerminalSettingsContext = createContext<TerminalSettingsContextType | null>(null);

function loadStoredSettings(): TerminalSettings {
  if (typeof window === 'undefined') return DEFAULT_TERMINAL_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TERMINAL_SETTINGS;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        ...DEFAULT_TERMINAL_SETTINGS,
        ...parsed,
        general: { ...DEFAULT_TERMINAL_SETTINGS.general, ...(parsed.general || {}) },
        risk: { ...DEFAULT_TERMINAL_SETTINGS.risk, ...(parsed.risk || {}) },
        trailingStop: { ...DEFAULT_TERMINAL_SETTINGS.trailingStop, ...(parsed.trailingStop || {}) },
        indicators: { ...DEFAULT_TERMINAL_SETTINGS.indicators, ...(parsed.indicators || {}) },
        ai: { ...DEFAULT_TERMINAL_SETTINGS.ai, ...(parsed.ai || {}) },
        audio: { ...DEFAULT_TERMINAL_SETTINGS.audio, ...(parsed.audio || {}) },
        connection: { ...DEFAULT_TERMINAL_SETTINGS.connection, ...(parsed.connection || {}) },
        interface: { ...DEFAULT_TERMINAL_SETTINGS.interface, ...(parsed.interface || {}) },
      };
    }
  } catch (e) {
    console.warn('Failed parsing stored terminal settings, falling back to defaults:', e);
  }
  return DEFAULT_TERMINAL_SETTINGS;
}

export const TerminalSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<TerminalSettings>(loadStoredSettings);

  // Sync settings with runtime subsystems (sound, voice, derivWS)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}

    // 1. Sync Audio & Voice Engines
    sound.setEnabled(settings.audio.soundEnabled);
    sound.setVolume((settings.audio.soundVolume ?? 80) / 100);
    voice.setEnabled(settings.audio.voiceEnabled);
    voice.setRateMultiplier(settings.audio.voiceRate);
    voice.setPitchMultiplier(settings.audio.voicePitch);
    if (settings.audio.voicePersona && (AGENT_PERSONAS as any)[settings.audio.voicePersona]) {
      voice.setPersona(settings.audio.voicePersona as AgentVoicePersonaId, false);
    }

    // 2. Sync Deriv App ID if changed
    const currentCreds = derivWS.getCredentials();
    if (settings.connection.derivAppId && currentCreds.appId !== settings.connection.derivAppId) {
      derivWS.setCredentials(currentCreds.token || '', settings.connection.derivAppId);
    }
  }, [settings]);

  const updateSettings = useCallback((updates: Partial<TerminalSettings>) => {
    setSettings((prev) => ({
      ...prev,
      ...updates,
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const updateGeneral = useCallback((updates: Partial<TerminalSettings['general']>) => {
    setSettings((prev) => ({
      ...prev,
      general: { ...prev.general, ...updates },
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const updateRisk = useCallback((updates: Partial<TerminalSettings['risk']>) => {
    setSettings((prev) => ({
      ...prev,
      risk: { ...prev.risk, ...updates },
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const updateTrailingStop = useCallback((updates: Partial<TerminalSettings['trailingStop']>) => {
    setSettings((prev) => ({
      ...prev,
      trailingStop: { ...prev.trailingStop, ...updates },
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const updateIndicators = useCallback((updates: Partial<TerminalSettings['indicators']>) => {
    setSettings((prev) => ({
      ...prev,
      indicators: { ...prev.indicators, ...updates },
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const updateAI = useCallback((updates: Partial<TerminalSettings['ai']>) => {
    setSettings((prev) => ({
      ...prev,
      ai: { ...prev.ai, ...updates },
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const updateAudio = useCallback((updates: Partial<TerminalSettings['audio']>) => {
    setSettings((prev) => ({
      ...prev,
      audio: { ...prev.audio, ...updates },
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const updateConnection = useCallback((updates: Partial<TerminalSettings['connection']>) => {
    setSettings((prev) => ({
      ...prev,
      connection: { ...prev.connection, ...updates },
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const updateInterface = useCallback((updates: Partial<TerminalSettings['interface']>) => {
    setSettings((prev) => ({
      ...prev,
      interface: { ...prev.interface, ...updates },
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettings({
      ...DEFAULT_TERMINAL_SETTINGS,
      updatedAt: new Date().toISOString(),
    });
    sound.play('toggle');
  }, []);

  const exportSettingsJSON = useCallback(() => {
    return JSON.stringify(settings, null, 2);
  }, [settings]);

  const importSettingsJSON = useCallback((jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object') {
        return { success: false, error: 'Parsed JSON is not an object.' };
      }
      setSettings((prev) => ({
        ...prev,
        ...parsed,
        general: { ...prev.general, ...(parsed.general || {}) },
        risk: { ...prev.risk, ...(parsed.risk || {}) },
        trailingStop: { ...prev.trailingStop, ...(parsed.trailingStop || {}) },
        indicators: { ...prev.indicators, ...(parsed.indicators || {}) },
        ai: { ...prev.ai, ...(parsed.ai || {}) },
        audio: { ...prev.audio, ...(parsed.audio || {}) },
        connection: { ...prev.connection, ...(parsed.connection || {}) },
        interface: { ...prev.interface, ...(parsed.interface || {}) },
        updatedAt: new Date().toISOString(),
      }));
      sound.play('win');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Invalid JSON format' };
    }
  }, []);

  return (
    <TerminalSettingsContext.Provider
      value={{
        settings,
        updateSettings,
        updateGeneral,
        updateRisk,
        updateTrailingStop,
        updateIndicators,
        updateAI,
        updateAudio,
        updateConnection,
        updateInterface,
        resetToDefaults,
        exportSettingsJSON,
        importSettingsJSON,
      }}
    >
      {children}
    </TerminalSettingsContext.Provider>
  );
};

export const useTerminalSettings = (): TerminalSettingsContextType => {
  const context = useContext(TerminalSettingsContext);
  if (!context) {
    throw new Error('useTerminalSettings must be used within a TerminalSettingsProvider');
  }
  return context;
};
