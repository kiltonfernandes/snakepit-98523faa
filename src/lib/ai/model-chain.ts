export interface ModelEntry {
  /** OpenRouter model id, e.g. "deepseek/deepseek-v4-flash" */
  id: string;
  /** Per-model time-to-first-byte deadline in ms. */
  deadlineMs: number;
  /** Optional human label (defaults to id). */
  label?: string;
}

const STORAGE_KEY = 'openrouter_model_chain_v1';

export const DEFAULT_MODEL_CHAIN: ModelEntry[] = [
  { id: 'moonshotai/kimi-k2.6:free', deadlineMs: 5000 },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', deadlineMs: 5000 },
  { id: 'qwen/qwen3-next-80b-a3b-instruct:free', deadlineMs: 5000 },
  { id: 'sourceful/riverflow-v2.5-pro:free', deadlineMs: 5000 },
  { id: 'sourceful/riverflow-v2.5-fast:free', deadlineMs: 5000 },
  { id: 'deepseek/deepseek-v4-flash', deadlineMs: 90000 },
];

export function loadModelChain(): ModelEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MODEL_CHAIN;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_MODEL_CHAIN;
    return parsed
      .filter((e: any) => e && typeof e.id === 'string' && e.id.trim())
      .map((e: any) => ({
        id: String(e.id).trim(),
        deadlineMs: Number.isFinite(e.deadlineMs) ? Number(e.deadlineMs) : 5000,
        label: e.label ? String(e.label) : undefined,
      }));
  } catch {
    return DEFAULT_MODEL_CHAIN;
  }
}

export function saveModelChain(chain: ModelEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chain));
}

export function resetModelChain(): ModelEntry[] {
  localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_MODEL_CHAIN;
}