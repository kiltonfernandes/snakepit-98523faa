import { useCallback, useEffect, useState } from 'react';

export type ViewMode = 'table' | 'cards';

/**
 * Persistent view-mode toggle. Each tab passes its own key so the user's choice
 * is remembered separately per surface.
 */
export function useViewMode(key: string, initial: ViewMode = 'table') {
  const storageKey = `viewMode:${key}`;
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      return v === 'cards' || v === 'table' ? v : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, mode); } catch { /* ignore */ }
  }, [storageKey, mode]);
  const set = useCallback((m: ViewMode) => setMode(m), []);
  return [mode, set] as const;
}