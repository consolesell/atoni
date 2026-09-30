export type NoteColor = 'default' | 'amber' | 'emerald' | 'cyan' | 'rose' | 'purple' | 'blue';

export interface NoteChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface TradingNote {
  id: string;
  uid?: string;
  title: string;
  content: string;
  color: NoteColor;
  isPinned: boolean;
  tags: string[];
  checklist?: NoteChecklistItem[];
  createdAt: string;
  updatedAt: string;
  symbol?: string;
  marketRegime?: string;
  tradeId?: string;
}

export const NOTE_COLOR_CLASSES: Record<NoteColor, {
  bg: string;
  border: string;
  dot: string;
  name: string;
}> = {
  default: {
    bg: 'bg-slate-900/90 hover:bg-slate-850',
    border: 'border-slate-800',
    dot: 'bg-slate-400',
    name: 'Default',
  },
  amber: {
    bg: 'bg-amber-950/40 hover:bg-amber-950/60',
    border: 'border-amber-500/40',
    dot: 'bg-amber-400',
    name: 'Amber',
  },
  emerald: {
    bg: 'bg-emerald-950/40 hover:bg-emerald-950/60',
    border: 'border-emerald-500/40',
    dot: 'bg-emerald-400',
    name: 'Emerald',
  },
  cyan: {
    bg: 'bg-cyan-950/40 hover:bg-cyan-950/60',
    border: 'border-cyan-500/40',
    dot: 'bg-cyan-400',
    name: 'Cyan',
  },
  rose: {
    bg: 'bg-rose-950/40 hover:bg-rose-950/60',
    border: 'border-rose-500/40',
    dot: 'bg-rose-400',
    name: 'Rose',
  },
  purple: {
    bg: 'bg-purple-950/40 hover:bg-purple-950/60',
    border: 'border-purple-500/40',
    dot: 'bg-purple-400',
    name: 'Purple',
  },
  blue: {
    bg: 'bg-blue-950/40 hover:bg-blue-950/60',
    border: 'border-blue-500/40',
    dot: 'bg-blue-400',
    name: 'Blue',
  },
};
