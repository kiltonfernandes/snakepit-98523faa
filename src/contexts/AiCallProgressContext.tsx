import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from 'react';

export type AiCallStage = 'idle' | 'connecting' | 'trying' | 'streaming' | 'populating' | 'done' | 'error';
export interface AiAttempt { model: string; status: 'trying' | 'failed' | 'selected'; reason?: string }

export interface AiCallState {
  open: boolean;
  label: string;
  stage: AiCallStage;
  currentModel: string | null;
  attempts: AiAttempt[];
  bytes: number;
  error?: string | null;
}

interface Ctx {
  state: AiCallState;
  start: (label: string) => void;
  setStage: (stage: AiCallStage) => void;
  setModel: (model: string) => void;
  pushAttempt: (a: AiAttempt) => void;
  failAttempt: (model: string, reason: string) => void;
  addBytes: (n: number) => void;
  finish: (error?: string | null) => void;
  close: () => void;
}

const initial: AiCallState = {
  open: false,
  label: '',
  stage: 'idle',
  currentModel: null,
  attempts: [],
  bytes: 0,
  error: null,
};

const AiCallProgressContext = createContext<Ctx | null>(null);

export function AiCallProgressProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AiCallState>(initial);
  const closeTimer = useRef<number | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
  };

  const start = useCallback((label: string) => {
    clearCloseTimer();
    setState({ ...initial, open: true, label, stage: 'connecting' });
  }, []);
  const setStage = useCallback((stage: AiCallStage) => setState(s => ({ ...s, stage })), []);
  const setModel = useCallback((model: string) => setState(s => ({ ...s, currentModel: model })), []);
  const pushAttempt = useCallback((a: AiAttempt) => setState(s => {
    const existing = s.attempts.find(x => x.model === a.model);
    if (existing) {
      return { ...s, attempts: s.attempts.map(x => x.model === a.model ? { ...x, ...a } : x), currentModel: a.status === 'selected' ? a.model : s.currentModel };
    }
    return { ...s, attempts: [...s.attempts, a], currentModel: a.status === 'selected' ? a.model : s.currentModel };
  }), []);
  const failAttempt = useCallback((model: string, reason: string) => setState(s => ({
    ...s,
    attempts: s.attempts.map(x => x.model === model ? { ...x, status: 'failed', reason } : x),
  })), []);
  const addBytes = useCallback((n: number) => setState(s => ({ ...s, bytes: s.bytes + n, stage: s.stage === 'connecting' || s.stage === 'trying' ? 'streaming' : s.stage })), []);
  const finish = useCallback((error?: string | null) => {
    setState(s => ({ ...s, stage: error ? 'error' : 'done', error: error || null }));
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setState(s => ({ ...s, open: false })), error ? 4000 : 900);
  }, []);
  const close = useCallback(() => { clearCloseTimer(); setState(s => ({ ...s, open: false })); }, []);

  const value = useMemo(() => ({ state, start, setStage, setModel, pushAttempt, failAttempt, addBytes, finish, close }),
    [state, start, setStage, setModel, pushAttempt, failAttempt, addBytes, finish, close]);

  return <AiCallProgressContext.Provider value={value}>{children}</AiCallProgressContext.Provider>;
}

export function useAiCallProgress() {
  const ctx = useContext(AiCallProgressContext);
  if (!ctx) throw new Error('useAiCallProgress must be used within AiCallProgressProvider');
  return ctx;
}