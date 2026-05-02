import { useEffect, useState } from 'react';
import { subscribeAutosave, AutosaveStatus, flushAutosave } from '@/lib/autosave-queue';

export function useAutosaveStatus() {
  const [state, setState] = useState<{ status: AutosaveStatus; pending: number }>({ status: 'idle', pending: 0 });
  useEffect(() => subscribeAutosave(setState), []);
  return { ...state, flush: flushAutosave };
}