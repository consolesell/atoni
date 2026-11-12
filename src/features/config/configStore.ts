import { create } from 'zustand';
import { TerminalConfig, DEFAULT_TERMINAL_CONFIG, validateTerminalConfig } from '../../config/terminalConfig';

interface ConfigState {
  config: TerminalConfig;
  updateConsensusConfig: (updates: Partial<TerminalConfig['consensus']>) => void;
  updateRiskConfig: (updates: Partial<TerminalConfig['risk']>) => void;
  updateMarketConfig: (updates: Partial<TerminalConfig['market']>) => void;
  updateAutonomyConfig: (updates: Partial<TerminalConfig['autonomy']>) => void;
  resetToDefaults: () => void;
}

const STORAGE_KEY = 'sbatomic_terminal_config_v4';

function loadPersistedConfig(): TerminalConfig {
  if (typeof window === 'undefined') return DEFAULT_TERMINAL_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TERMINAL_CONFIG;
    return validateTerminalConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_TERMINAL_CONFIG;
  }
}

function persistConfig(cfg: TerminalConfig) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch (err) {
    console.warn('[configStore] Failed to persist config to localStorage:', err);
  }
}

export const useConfigStore = create<ConfigState>((set) => ({
  config: loadPersistedConfig(),

  updateConsensusConfig: (updates) =>
    set((state) => {
      const nextConfig = validateTerminalConfig({
        ...state.config,
        consensus: { ...state.config.consensus, ...updates },
      });
      persistConfig(nextConfig);
      return { config: nextConfig };
    }),

  updateRiskConfig: (updates) =>
    set((state) => {
      const nextConfig = validateTerminalConfig({
        ...state.config,
        risk: { ...state.config.risk, ...updates },
      });
      persistConfig(nextConfig);
      return { config: nextConfig };
    }),

  updateMarketConfig: (updates) =>
    set((state) => {
      const nextConfig = validateTerminalConfig({
        ...state.config,
        market: { ...state.config.market, ...updates },
      });
      persistConfig(nextConfig);
      return { config: nextConfig };
    }),

  updateAutonomyConfig: (updates) =>
    set((state) => {
      const nextConfig = validateTerminalConfig({
        ...state.config,
        autonomy: { ...state.config.autonomy, ...updates },
      });
      persistConfig(nextConfig);
      return { config: nextConfig };
    }),

  resetToDefaults: () => {
    persistConfig(DEFAULT_TERMINAL_CONFIG);
    set({ config: DEFAULT_TERMINAL_CONFIG });
  },
}));
