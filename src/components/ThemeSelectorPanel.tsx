import React from 'react';
import {
  Sparkles,
  Waves,
  Leaf,
  Sun,
  SunMedium,
  Gem,
  Check,
  Eye,
  Activity,
  Layers,
  BarChart2,
  Grid,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { ThemeMode, THEMES } from '../types/theme';
import { sound } from '../lib/soundEngine';

export const ThemeSelectorPanel: React.FC = () => {
  const {
    themeMode,
    theme,
    accentColor,
    visualSettings,
    setThemeMode,
    setAccentColor,
    toggleVisualSetting,
  } = useTheme();

  const themeList: {
    id: ThemeMode;
    label: string;
    description: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'dark_neon',
      label: 'Dark Neon',
      description: 'Bold. Modern. Focused.',
      icon: <Sparkles className="w-4 h-4 text-cyan-400" />,
    },
    {
      id: 'ocean',
      label: 'Ocean Blue',
      description: 'Calm. Clean. Confident.',
      icon: <Waves className="w-4 h-4 text-sky-400" />,
    },
    {
      id: 'forest',
      label: 'Forest Green',
      description: 'Natural. Balanced. Sharp.',
      icon: <Leaf className="w-4 h-4 text-emerald-400" />,
    },
    {
      id: 'sunset',
      label: 'Sunset Orange',
      description: 'Warm. Energetic. Inspired.',
      icon: <Sun className="w-4 h-4 text-orange-400" />,
    },
    {
      id: 'light',
      label: 'Light Mode',
      description: 'Simple. Fresh. Productive.',
      icon: <SunMedium className="w-4 h-4 text-amber-500" />,
    },
    {
      id: 'purple',
      label: 'Purple Pro',
      description: 'Premium. Stylish. Next Level.',
      icon: <Gem className="w-4 h-4 text-purple-400" />,
    },
  ];

  const getThemeQuoteIcon = (mode: ThemeMode) => {
    switch (mode) {
      case 'dark_neon':
        return <Sparkles className="w-5 h-5 text-cyan-400" />;
      case 'ocean':
        return <Waves className="w-5 h-5 text-sky-400" />;
      case 'forest':
        return <Leaf className="w-5 h-5 text-emerald-400" />;
      case 'sunset':
        return <Sun className="w-5 h-5 text-orange-400" />;
      case 'light':
        return <SunMedium className="w-5 h-5 text-amber-500" />;
      case 'purple':
        return <Gem className="w-5 h-5 text-purple-400" />;
    }
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Theme Header & Tagline */}
      <div
        className="p-3.5 rounded-xl border transition-all flex items-center justify-between"
        style={{
          backgroundColor: theme.bgCard,
          borderColor: theme.borderColor,
          boxShadow: `0 4px 20px ${theme.glowColor}`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="p-2.5 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: `${accentColor}20`,
              color: accentColor,
            }}
          >
            {getThemeQuoteIcon(themeMode)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm" style={{ color: theme.textPrimary }}>
                {theme.name}
              </span>
              <span
                className="px-2 py-0.5 rounded text-[10px] font-mono font-bold"
                style={{
                  backgroundColor: `${accentColor}25`,
                  color: accentColor,
                }}
              >
                ACTIVE
              </span>
            </div>
            <p className="text-[11px]" style={{ color: theme.textSecondary }}>
              {theme.subtitle}
            </p>
          </div>
        </div>
      </div>

      {/* Theme Selector Radio List (Exactly like uploaded image) */}
      <div
        className="p-4 rounded-xl border space-y-2.5"
        style={{
          backgroundColor: theme.bgCard,
          borderColor: theme.borderColor,
        }}
      >
        <div className="flex items-center justify-between pb-1 border-b" style={{ borderColor: theme.borderColor }}>
          <span className="font-bold text-xs uppercase tracking-wider" style={{ color: theme.textSecondary }}>
            Theme
          </span>
          <span className="font-mono text-[10px]" style={{ color: theme.textMuted }}>
            Select color profile
          </span>
        </div>

        <div className="space-y-1.5 pt-1">
          {themeList.map((t) => {
            const isSelected = themeMode === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setThemeMode(t.id);
                  sound.play('click');
                }}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all text-left ${
                  isSelected ? 'ring-1' : 'hover:opacity-90'
                }`}
                style={{
                  backgroundColor: isSelected ? `${accentColor}15` : 'transparent',
                  borderColor: isSelected ? accentColor : theme.borderColor,
                }}
              >
                <div className="flex items-center gap-3">
                  {/* Radio circle */}
                  <div
                    className="w-4 h-4 rounded-full border flex items-center justify-center transition-all"
                    style={{
                      borderColor: isSelected ? accentColor : theme.textMuted,
                      backgroundColor: isSelected ? accentColor : 'transparent',
                    }}
                  >
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                  </div>

                  <div>
                    <span
                      className="font-bold text-xs block"
                      style={{ color: isSelected ? theme.textPrimary : theme.textSecondary }}
                    >
                      {t.label}
                    </span>
                    <span className="text-[10px]" style={{ color: theme.textMuted }}>
                      {t.description}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {THEMES[t.id].accentColors.map((color, idx) => (
                    <span
                      key={idx}
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Accent Color Palette Selector (Exactly like uploaded image) */}
      <div
        className="p-4 rounded-xl border space-y-3"
        style={{
          backgroundColor: theme.bgCard,
          borderColor: theme.borderColor,
        }}
      >
        <div className="flex items-center justify-between">
          <span className="font-bold text-xs uppercase tracking-wider" style={{ color: theme.textSecondary }}>
            Accent Color
          </span>
          <span className="font-mono text-[10px] font-bold" style={{ color: accentColor }}>
            {accentColor.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-3 pt-1">
          {theme.accentColors.map((color, idx) => {
            const isSelected = accentColor.toLowerCase() === color.toLowerCase();
            return (
              <button
                key={idx}
                onClick={() => {
                  setAccentColor(color);
                  sound.play('click');
                }}
                className={`relative w-8 h-8 rounded-full transition-transform hover:scale-110 flex items-center justify-center shadow-md ${
                  isSelected ? 'ring-2 ring-offset-2 ring-white scale-105' : 'opacity-80 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: color,
                  boxShadow: isSelected ? `0 0 12px ${color}` : undefined,
                }}
                title={`Accent: ${color}`}
              >
                {isSelected && <Check className="w-4 h-4 text-white drop-shadow" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Display & Chart Visual Toggles (Candles, Grid, Indicators, Volume) */}
      <div
        className="p-4 rounded-xl border space-y-3"
        style={{
          backgroundColor: theme.bgCard,
          borderColor: theme.borderColor,
        }}
      >
        <div className="flex items-center justify-between pb-1 border-b" style={{ borderColor: theme.borderColor }}>
          <span className="font-bold text-xs uppercase tracking-wider" style={{ color: theme.textSecondary }}>
            Visual Layers & Chart
          </span>
          <span className="font-mono text-[10px]" style={{ color: theme.textMuted }}>
            Live chart overlay
          </span>
        </div>

        <div className="space-y-2.5">
          {/* Candles */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4" style={{ color: accentColor }} />
              <span className="font-medium text-xs" style={{ color: theme.textPrimary }}>
                Candles
              </span>
            </div>
            <button
              onClick={() => {
                toggleVisualSetting('showCandles');
                sound.play('toggle');
              }}
              className="w-11 h-6 rounded-full transition-colors relative"
              style={{
                backgroundColor: visualSettings.showCandles ? accentColor : theme.borderColor,
              }}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  visualSettings.showCandles ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          {/* Grid */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Grid className="w-4 h-4" style={{ color: accentColor }} />
              <span className="font-medium text-xs" style={{ color: theme.textPrimary }}>
                Grid
              </span>
            </div>
            <button
              onClick={() => {
                toggleVisualSetting('showGrid');
                sound.play('toggle');
              }}
              className="w-11 h-6 rounded-full transition-colors relative"
              style={{
                backgroundColor: visualSettings.showGrid ? accentColor : theme.borderColor,
              }}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  visualSettings.showGrid ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          {/* Indicators */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4" style={{ color: accentColor }} />
              <span className="font-medium text-xs" style={{ color: theme.textPrimary }}>
                Indicators
              </span>
            </div>
            <button
              onClick={() => {
                toggleVisualSetting('showIndicators');
                sound.play('toggle');
              }}
              className="w-11 h-6 rounded-full transition-colors relative"
              style={{
                backgroundColor: visualSettings.showIndicators ? accentColor : theme.borderColor,
              }}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  visualSettings.showIndicators ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4" style={{ color: accentColor }} />
              <span className="font-medium text-xs" style={{ color: theme.textPrimary }}>
                Volume
              </span>
            </div>
            <button
              onClick={() => {
                toggleVisualSetting('showVolume');
                sound.play('toggle');
              }}
              className="w-11 h-6 rounded-full transition-colors relative"
              style={{
                backgroundColor: visualSettings.showVolume ? accentColor : theme.borderColor,
              }}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  visualSettings.showVolume ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Theme Bottom Card & Slogan (Exactly as in the screenshot) */}
      <div
        className="p-3.5 rounded-xl border flex items-center justify-between transition-all"
        style={{
          backgroundColor: theme.bgCard,
          borderColor: theme.borderColor,
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="p-2 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: `${accentColor}15`,
              color: accentColor,
            }}
          >
            {getThemeQuoteIcon(themeMode)}
          </div>
          <div>
            <div className="font-bold text-xs" style={{ color: theme.textPrimary }}>
              {theme.tagline}
            </div>
            <div className="text-[10px] font-mono" style={{ color: theme.textMuted }}>
              Deriv Synthetic Suite • High Frequency Interface
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
