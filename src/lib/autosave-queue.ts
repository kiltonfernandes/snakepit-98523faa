import { supabase } from '@/integrations/supabase/client';

/**
 * Autosave queue: per-table, per-row debounced + ordered persistence.
 *
 * Goals:
 * - Coalesce rapid keystrokes into 1 supabase update (debounce).
 * - Guarantee no out-of-order overwrites (monotonic version).
 * - Survive transient failures (exponential retry).
 * - Snapshot pending changes to localStorage so a refresh never loses data.
 * - Expose a global flush() used by beforeunload and tab/route changes.
 */

type Status = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface QueueEntry {
  table: string;
  id: string;
  pending: Record<string, any>;
  version: number;
  inflightVersion: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  retries: number;
}

const DEBOUNCE_MS = 500;
const MAX_RETRIES = 4;
const queue = new Map<string, QueueEntry>();
const listeners = new Set<(s: { status: Status; pending: number }) => void>();
let globalStatus: Status = 'idle';

function key(table: string, id: string) { return `${table}:${id}`; }
function snapshotKey(table: string, id: string) { return `autosave:${table}:${id}`; }

function emit() {
  const pending = Array.from(queue.values()).filter(e => Object.keys(e.pending).length > 0 || e.inflightVersion !== null).length;
  for (const fn of listeners) fn({ status: globalStatus, pending });
}

function setStatus(s: Status) {
  globalStatus = s;
  emit();
}

function persistSnapshot(entry: QueueEntry) {
  try {
    if (Object.keys(entry.pending).length === 0) {
      localStorage.removeItem(snapshotKey(entry.table, entry.id));
    } else {
      localStorage.setItem(
        snapshotKey(entry.table, entry.id),
        JSON.stringify({ pending: entry.pending, version: entry.version, ts: Date.now() })
      );
    }
  } catch { /* quota — ignore */ }
}

async function performSave(entry: QueueEntry): Promise<void> {
  if (Object.keys(entry.pending).length === 0) return;
  const versionAtSend = entry.version;
  const payload = { ...entry.pending };
  // Always bump updated_at server-side (string timestamp matches schema).
  payload.updated_at = new Date().toISOString();
  entry.inflightVersion = versionAtSend;
  entry.pending = {};
  setStatus('saving');

  const { error } = await supabase
    .from(entry.table as any)
    .update(payload as any)
    .eq('id', entry.id);

  // If a newer version was queued during the inflight, ignore the result and let
  // the next debounce send it.
  if (entry.version !== versionAtSend) {
    entry.inflightVersion = null;
    persistSnapshot(entry);
    schedule(entry);
    return;
  }

  if (error) {
    entry.retries++;
    if (entry.retries <= MAX_RETRIES) {
      // Re-merge payload back into pending so we retry it.
      delete payload.updated_at;
      entry.pending = { ...payload, ...entry.pending };
      entry.inflightVersion = null;
      persistSnapshot(entry);
      const backoff = Math.min(8000, 400 * 2 ** (entry.retries - 1));
      setTimeout(() => schedule(entry, true), backoff);
      setStatus('error');
    } else {
      // Give up: keep snapshot in localStorage so user can refresh + recover.
      entry.inflightVersion = null;
      setStatus('error');
      console.error(`[autosave] giving up on ${entry.table}/${entry.id}`, error);
    }
    return;
  }

  entry.retries = 0;
  entry.inflightVersion = null;
  persistSnapshot(entry);
  // If anything was added while inflight, keep saving; otherwise mark saved.
  if (Object.keys(entry.pending).length > 0) {
    schedule(entry);
  } else {
    setStatus('saved');
    setTimeout(() => { if (globalStatus === 'saved') setStatus('idle'); }, 1200);
  }
}

function schedule(entry: QueueEntry, immediate = false) {
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    entry.timer = null;
    void performSave(entry);
  }, immediate ? 0 : DEBOUNCE_MS);
}

export function enqueueUpdate(table: string, id: string, patch: Record<string, any>) {
  const k = key(table, id);
  let entry = queue.get(k);
  if (!entry) {
    entry = { table, id, pending: {}, version: 0, inflightVersion: null, timer: null, retries: 0 };
    queue.set(k, entry);
  }
  // Merge patch into pending; later writes win per-field.
  entry.pending = { ...entry.pending, ...patch };
  entry.version++;
  persistSnapshot(entry);
  setStatus('dirty');
  schedule(entry);
}

/** Force-flush every queued entry (skip debounce). Returns when all settle. */
export async function flushAutosave(): Promise<void> {
  const all: Promise<void>[] = [];
  for (const entry of queue.values()) {
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
    if (Object.keys(entry.pending).length > 0 || entry.inflightVersion !== null) {
      all.push(performSave(entry));
    }
  }
  await Promise.allSettled(all);
}

export function subscribeAutosave(fn: (s: { status: Status; pending: number }) => void) {
  listeners.add(fn);
  fn({ status: globalStatus, pending: Array.from(queue.values()).filter(e => Object.keys(e.pending).length > 0).length });
  return () => { listeners.delete(fn); };
}

/** Recover any leftover snapshots from a previous session — re-enqueues them. */
export function recoverAutosaveSnapshots() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('autosave:')) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const [, table, id] = k.split(':');
        if (table && id && parsed?.pending) {
          enqueueUpdate(table, id, parsed.pending);
        }
      } catch { /* skip corrupt */ }
    }
  } catch { /* no localStorage */ }
}

// Install a global beforeunload guard once.
if (typeof window !== 'undefined' && !(window as any).__autosaveGuardInstalled) {
  (window as any).__autosaveGuardInstalled = true;
  window.addEventListener('beforeunload', (e) => {
    const hasPending = Array.from(queue.values()).some(
      en => Object.keys(en.pending).length > 0 || en.inflightVersion !== null
    );
    if (hasPending) {
      // Best-effort flush (browser may not await async).
      void flushAutosave();
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

export type AutosaveStatus = Status;