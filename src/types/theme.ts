export type ThemeMode =
  | 'dark_neon'
  | 'ocean'
  | 'forest'
  | 'sunset'
  | 'light'
  | 'purple';

export interface ThemeConfig {
  id: ThemeMode;
  name: string;
  subtitle: string;
  tagline: string;
  quote: string;
  isDark: boolean;
  accentColors: string[];
  defaultAccent: string;
  // CSS styling tokens
  bgApp: string;
  bgCard: string;
  bgCardHover: string;
  borderColor: string;
  borderAccent: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  callButtonBg: string;
  putButtonBg: string;
  pillBg: string;
  glowColor: string;
}

export const THEMES: Record<ThemeMode, ThemeConfig> = {
  dark_neon: {
    id: 'dark_neon',
    name: 'Dark Neon',
    subtitle: 'Bold. Modern. Focused.',
    tagline: 'Neon vibes. Better decisions.',
    quote: 'Neon vibes. Better decisions.',
    isDark: true,
    accentColors: ['#00f0ff', '#3b82f6', '#a855f7', '#ff007a'],
    defaultAccent: '#00f0ff',
    bgApp: '#020617',
    bgCard: '#080f20',
    bgCardHover: '#0f1c3a',
    borderColor: '#1e293b',
    borderAccent: 'rgba(0, 240, 255, 0.4)',
    textPrimary: '#f8fafc',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    callButtonBg: '#00f0ff',
    putButtonBg: '#ff007a',
    pillBg: 'rgba(0, 240, 255, 0.12)',
    glowColor: 'rgba(0, 240, 255, 0.25)',
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean Blue',
    subtitle: 'Calm. Clean. Confident.',
    tagline: 'Trade with clarity.',
    quote: 'Trade with clarity.',
    isDark: true,
    accentColors: ['#0ea5e9', '#38bdf8', '#06b6d4', '#2563eb'],
    defaultAccent: '#0ea5e9',
    bgApp: '#071326',
    bgCard: '#0c213d',
    bgCardHover: '#133054',
    borderColor: '#1a3b66',
    borderAccent: 'rgba(14, 165, 233, 0.4)',
    textPrimary: '#f0f9ff',
    textSecondary: '#93c5fd',
    textMuted: '#60a5fa',
    callButtonBg: '#0284c7',
    putButtonBg: '#f43f5e',
    pillBg: 'rgba(14, 165, 233, 0.15)',
    glowColor: 'rgba(14, 165, 233, 0.25)',
  },
  forest: {
    id: 'forest',
    name: 'Forest Green',
    subtitle: 'Natural. Balanced. Sharp.',
    tagline: 'Grow your opportunities.',
    quote: 'Grow your opportunities.',
    isDark: true,
    accentColors: ['#10b981', '#34d399', '#a3e635', '#eab308'],
    defaultAccent: '#10b981',
    bgApp: '#041610',
    bgCard: '#09281e',
    bgCardHover: '#0f3c2e',
    borderColor: '#144b39',
    borderAccent: 'rgba(16, 185, 129, 0.4)',
    textPrimary: '#f0fdf4',
    textSecondary: '#86efac',
    textMuted: '#4ade80',
    callButtonBg: '#10b981',
    putButtonBg: '#f43f5e',
    pillBg: 'rgba(16, 185, 129, 0.15)',
    glowColor: 'rgba(16, 185, 129, 0.25)',
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset Orange',
    subtitle: 'Warm. Energetic. Inspired.',
    tagline: 'Bright moves. Bigger dreams.',
    quote: 'Bright moves. Bigger dreams.',
    isDark: true,
    accentColors: ['#f97316', '#fbbf24', '#f43f5e', '#fdba74'],
    defaultAccent: '#f97316',
    bgApp: '#160b08',
    bgCard: '#26130e',
    bgCardHover: '#381c15',
    borderColor: '#422019',
    borderAccent: 'rgba(249, 115, 22, 0.4)',
    textPrimary: '#fff7ed',
    textSecondary: '#fed7aa',
    textMuted: '#fb923c',
    callButtonBg: '#f97316',
    putButtonBg: '#e11d48',
    pillBg: 'rgba(249, 115, 22, 0.15)',
    glowColor: 'rgba(249, 115, 22, 0.25)',
  },
  light: {
    id: 'light',
    name: 'Light Mode',
    subtitle: 'Simple. Fresh. Productive.',
    tagline: 'Less distraction. More focus.',
    quote: 'Less distraction. More focus.',
    isDark: false,
    accentColors: ['#0284c7', '#0d9488', '#64748b', '#1e3a8a'],
    defaultAccent: '#0284c7',
    bgApp: '#f1f5f9',
    bgCard: '#ffffff',
    bgCardHover: '#f8fafc',
    borderColor: '#cbd5e1',
    borderAccent: 'rgba(2, 132, 199, 0.4)',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#94a3b8',
    callButtonBg: '#0284c7',
    putButtonBg: '#e11d48',
    pillBg: 'rgba(2, 132, 199, 0.1)',
    glowColor: 'rgba(2, 132, 199, 0.15)',
  },
  purple: {
    id: 'purple',
    name: 'Purple Pro',
    subtitle: 'Premium. Stylish. Next Level.',
    tagline: 'Premium tools for serious traders.',
    quote: 'Premium tools for serious traders.',
    isDark: true,
    accentColors: ['#a855f7', '#ec4899', '#7c3aed', '#c084fc'],
    defaultAccent: '#a855f7',
    bgApp: '#0c0618',
    bgCard: '#1a0c33',
    bgCardHover: '#2a1452',
    borderColor: '#351a66',
    borderAccent: 'rgba(168, 85, 247, 0.4)',
    textPrimary: '#faf5ff',
    textSecondary: '#d8b4fe',
    textMuted: '#a855f7',
    callButtonBg: '#a855f7',
    putButtonBg: '#ec4899',
    pillBg: 'rgba(168, 85, 247, 0.15)',
    glowColor: 'rgba(168, 85, 247, 0.25)',
  },
};

export interface ChartVisualSettings {
  showCandles: boolean;
  showGrid: boolean;
  showIndicators: boolean;
  showVolume: boolean;
}
