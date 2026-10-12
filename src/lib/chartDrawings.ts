import { ChartDrawing } from '../types/drawings';
import { db, auth, doc, setDoc, getDoc } from './firebase';

const STORAGE_PREFIX = 'deriv_chart_drawings_v2_';

export function loadChartDrawings(symbol: string): ChartDrawing[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${symbol}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Failed to load chart drawings from localStorage', err);
  }
  return [];
}

export async function syncChartDrawingsFromFirestore(
  symbol: string,
  onLoaded?: (drawings: ChartDrawing[]) => void
): Promise<ChartDrawing[] | null> {
  try {
    const user = auth?.currentUser;
    if (!user || !db) return null;

    const docRef = doc(db, 'users', user.uid, 'chart_drawings', symbol);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.drawings)) {
        saveChartDrawings(symbol, data.drawings, false); // save to local without re-pushing
        if (onLoaded) onLoaded(data.drawings);
        return data.drawings;
      }
    }
  } catch (err) {
    console.warn('Firestore drawings sync notice:', err);
  }
  return null;
}

export function saveChartDrawings(symbol: string, drawings: ChartDrawing[], syncRemote = true): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${symbol}`, JSON.stringify(drawings));

    if (syncRemote) {
      const user = auth?.currentUser;
      if (user && db) {
        const docRef = doc(db, 'users', user.uid, 'chart_drawings', symbol);
        setDoc(docRef, { drawings, updatedAt: Date.now() }, { merge: true }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Failed to save chart drawings', err);
  }
}

export function clearChartDrawings(symbol: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${symbol}`);
    const user = auth?.currentUser;
    if (user && db) {
      const docRef = doc(db, 'users', user.uid, 'chart_drawings', symbol);
      setDoc(docRef, { drawings: [], updatedAt: Date.now() }, { merge: true }).catch(() => {});
    }
  } catch (err) {
    console.warn('Failed to clear chart drawings', err);
  }
}

export const FIBONACCI_LEVELS = [
  { level: 0, label: '0.0% (Base)', color: '#94a3b8' },
  { level: 0.236, label: '23.6%', color: '#38bdf8' },
  { level: 0.382, label: '38.2%', color: '#34d399' },
  { level: 0.5, label: '50.0% (Equilibrium)', color: '#fbbf24' },
  { level: 0.618, label: '61.8% (Golden Ratio)', color: '#f97316' },
  { level: 0.786, label: '78.6%', color: '#ec4899' },
  { level: 1.0, label: '100.0% (Peak)', color: '#e2e8f0' },
];
