import { db, collection, doc, setDoc, getDocs, query, where, orderBy, deleteDoc, updateDoc } from './firebase';
import { TradingNote, NoteColor } from '../types/notes';

const STORAGE_KEY = 'trading_keep_notes_v1';

export const DEFAULT_TRADING_NOTES: TradingNote[] = [
  {
    id: 'note-rules-1',
    title: '🎯 Daily Execution Disciplines',
    content: '1. Never trade against Higher Timeframe (MTF) trend consistency > 70%.\n2. When consecutive losses reach 2, allow Martingale recovery to engage only on Confluence >= 65%.\n3. Always lock in 50% profit once target threshold is reached.',
    color: 'amber',
    isPinned: true,
    tags: ['rules', 'discipline', 'risk'],
    checklist: [
      { id: 'c1', text: 'Verify MTF Alignment with MA14/MA50', checked: true },
      { id: 'c2', text: 'Confirm RSI is not in extreme exhaustion (>78 or <22)', checked: true },
      { id: 'c3', text: 'Check Deriv latency < 120ms before execution', checked: false },
    ],
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
  {
    id: 'note-strat-2',
    title: '⚡ Sniper Entry & Exit Rules',
    content: 'Sub-tick precision entry triggers when optimal entry distance is <= 0.0012. For ticks scalp (5-10T), ensure volatility noise score is in the sweet spot (60-85%).',
    color: 'cyan',
    isPinned: true,
    tags: ['sniper', 'strategy'],
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
  },
  {
    id: 'note-market-3',
    title: '📊 Volatility 100 (1s) Behavior Memo',
    content: 'Fast impulse swings. High momentum breakouts often retrace to VWAP before continuation. Use 15s to 30s contracts for impulse scalps.',
    color: 'emerald',
    isPinned: false,
    tags: ['volatility', 'market_memo'],
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
];

export function loadLocalNotes(): TradingNote[] {
  if (typeof window === 'undefined') return DEFAULT_TRADING_NOTES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TRADING_NOTES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.warn('Failed to load local notes:', e);
  }
  return DEFAULT_TRADING_NOTES;
}

export function saveLocalNotes(notes: TradingNote[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch (e) {
    console.warn('Failed to save local notes:', e);
  }
}

export async function fetchFirestoreNotes(uid: string): Promise<TradingNote[]> {
  try {
    const q = query(
      collection(db, 'notes'),
      where('uid', '==', uid),
      orderBy('updatedAt', 'desc')
    );
    const snap = await getDocs(q);
    const notes: TradingNote[] = [];
    snap.forEach((d) => {
      notes.push({ id: d.id, ...(d.data() as any) });
    });
    return notes;
  } catch (err) {
    console.warn('Firestore fetch notes note:', err);
    return [];
  }
}

export async function persistNote(note: TradingNote, uid?: string) {
  if (uid) {
    try {
      await setDoc(doc(db, 'notes', note.id), {
        ...note,
        uid,
      });
    } catch (err) {
      console.warn('Firestore note persist error:', err);
    }
  }
}

export async function deleteFirestoreNote(noteId: string) {
  try {
    await deleteDoc(doc(db, 'notes', noteId));
  } catch (err) {
    console.warn('Firestore note delete note:', err);
  }
}

/**
 * Creates a Google Keep deep link URL
 */
export function getGoogleKeepUrl(): string {
  return 'https://keep.google.com/';
}
