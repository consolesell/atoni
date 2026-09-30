import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeMode, THEMES, ThemeConfig, ChartVisualSettings } from '../types/theme';

interface ThemeContextType {
  themeMode: ThemeMode;
  theme: ThemeConfig;
  accentColor: string;
  visualSettings: ChartVisualSettings;
  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (color: string) => void;
  setVisualSettings: (settings: Partial<ChartVisualSettings>) => void;
  toggleVisualSetting: (key: keyof ChartVisualSettings) => void;
}

const STORAGE_THEME_KEY = 'sbatomic_theme_mode_v2';
const STORAGE_ACCENT_KEY = 'sbatomic_theme_accent_v2';
const STORAGE_VISUALS_KEY = 'sbatomic_theme_visuals_v2';

const DEFAULT_VISUALS: ChartVisualSettings = {
  showCandles: true,
  showGrid: true,
  showIndicators: true,
  showVolume: true,
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_THEME_KEY);
      if (saved && saved in THEMES) return saved as ThemeMode;
    } catch (e) {
      console.warn('Could not read saved theme', e);
    }
    return 'dark_neon';
  });

  const activeTheme = THEMES[themeMode] || THEMES.dark_neon;

  const [accentColor, setAccentColorState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_ACCENT_KEY);
      if (saved) return saved;
    } catch (e) {
      console.warn('Could not read saved accent', e);
    }
    return activeTheme.defaultAccent;
  });

  const [visualSettings, setVisualSettingsState] = useState<ChartVisualSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_VISUALS_KEY);
      if (saved) return { ...DEFAULT_VISUALS, ...JSON.parse(saved) };
    } catch (e) {
      console.warn('Could not read saved visuals', e);
    }
    return DEFAULT_VISUALS;
  });

  // When theme changes, if current accent is not in new theme accents, fallback to default
  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      localStorage.setItem(STORAGE_THEME_KEY, mode);
    } catch (e) {}

    const newTheme = THEMES[mode];
    if (newTheme && !newTheme.accentColors.includes(accentColor)) {
      setAccentColor(newTheme.defaultAccent);
    }
  };

  const setAccentColor = (color: string) => {
    setAccentColorState(color);
    try {
      localStorage.setItem(STORAGE_ACCENT_KEY, color);
    } catch (e) {}
  };

  const setVisualSettings = (settings: Partial<ChartVisualSettings>) => {
    setVisualSettingsState((prev) => {
      const updated = { ...prev, ...settings };
      try {
        localStorage.setItem(STORAGE_VISUALS_KEY, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const toggleVisualSetting = (key: keyof ChartVisualSettings) => {
    setVisualSettings({ [key]: !visualSettings[key] });
  };

  // Sync CSS variables and document classes
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    // Remove older theme classes
    Object.keys(THEMES).forEach((t) => {
      body.classList.remove(`theme-${t}`);
    });
    body.classList.add(`theme-${themeMode}`);

    if (activeTheme.isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }

    // Set dynamic CSS properties
    root.style.setProperty('--app-bg', activeTheme.bgApp);
    root.style.setProperty('--app-card', activeTheme.bgCard);
    root.style.setProperty('--app-card-hover', activeTheme.bgCardHover);
    root.style.setProperty('--app-border', activeTheme.borderColor);
    root.style.setProperty('--app-border-accent', activeTheme.borderAccent);
    root.style.setProperty('--app-accent', accentColor);
    root.style.setProperty('--app-text-primary', activeTheme.textPrimary);
    root.style.setProperty('--app-text-secondary', activeTheme.textSecondary);
    root.style.setProperty('--app-call-btn', activeTheme.callButtonBg);
    root.style.setProperty('--app-put-btn', activeTheme.putButtonBg);

    body.style.backgroundColor = activeTheme.bgApp;
    body.style.color = activeTheme.textPrimary;
  }, [themeMode, activeTheme, accentColor]);

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        theme: activeTheme,
        accentColor,
        visualSettings,
        setThemeMode,
        setAccentColor,
        setVisualSettings,
        toggleVisualSetting,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
