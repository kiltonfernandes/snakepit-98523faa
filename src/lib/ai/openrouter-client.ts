import type { AiAttempt } from '@/contexts/AiCallProgressContext';
import { loadModelChain } from '@/lib/ai/model-chain';

export interface ProgressHandlers {
  start: (label: string) => void;
  pushAttempt: (a: AiAttempt) => void;
  failAttempt: (model: string, reason: string) => void;
  setStage: (s: 'connecting' | 'trying' | 'streaming' | 'populating' | 'done' | 'error') => void;
  setModel: (m: string) => void;
  addBytes: (n: number) => void;
  finish: (error?: string | null) => void;
}

export interface StreamGeneratePautaOptions {
  prompt: string;
  bannedTerms?: string[];
  temperature?: number;
  webSearch?: boolean;
  system?: string;
  onChunk: (full: string) => void;
  /** Modal label, e.g. "Gerando descrição". */
  label?: string;
  /** Optional progress sink (the AiCallProgress context). */
  progress?: ProgressHandlers;
}

/**
 * Stream from the `generate-pauta` edge function and forward meta events
 * (chain/trying/fallback/selected) into the progress modal.
 */
export async function streamGeneratePauta(opts: StreamGeneratePautaOptions): Promise<string> {
  const p = opts.progress;
  p?.start(opts.label || 'Chamada IA');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pauta`;
  const chain = loadModelChain();
  const models = chain.map(e => e.id);
  // Use the smallest non-zero deadline as base (per-model deadlines handled server-side per index).
  const deadlinesByModel: Record<string, number> = Object.fromEntries(chain.map(e => [e.id, e.deadlineMs]));
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        prompt: opts.prompt,
        bannedTerms: opts.bannedTerms || [],
        temperature: opts.temperature,
        webSearch: !!opts.webSearch,
        system: opts.system,
        models,
        deadlinesByModel,
      }),
    });
  } catch (e: any) {
    p?.finish(e?.message || 'Erro de rede');
    throw e;
  }
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: `Erro ${resp.status}` }));
    p?.finish(err.error || `Erro ${resp.status}`);
    throw new Error(err.error || `Erro ${resp.status}`);
  }
  const reader = resp.body?.getReader();
  if (!reader) { p?.finish('Sem stream de resposta'); throw new Error('Sem stream de resposta'); }
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nlIdx: number;
      while ((nlIdx = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, nlIdx);
        buffer = buffer.slice(nlIdx + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;
        let parsed: any;
        try { parsed = JSON.parse(jsonStr); } catch { continue; }
        // Meta progress events from the edge function fallback chain
        if (parsed && parsed._meta) {
          const m = parsed._meta;
          if (m.type === 'chain' && Array.isArray(m.models)) {
            p?.setStage('trying');
            for (const model of m.models) p?.pushAttempt({ model, status: 'trying' });
          } else if (m.type === 'trying') {
            p?.pushAttempt({ model: m.model, status: 'trying' });
            p?.setModel(m.model);
          } else if (m.type === 'fallback') {
            p?.failAttempt(m.model, m.reason || 'falhou');
          } else if (m.type === 'selected') {
            p?.pushAttempt({ model: m.model, status: 'selected' });
            p?.setModel(m.model);
            p?.setStage('streaming');
          } else if (m.type === 'error') {
            const msg = m.message || 'erro';
            p?.finish(msg);
            throw new Error(msg);
          }
          continue;
        }
        const content = parsed.choices?.[0]?.delta?.content;
        if (typeof content === 'string' && content.length > 0) {
          full += content;
          p?.addBytes(content.length);
          opts.onChunk(full);
        }
      }
    }
  } catch (e: any) {
    p?.finish(e?.message || 'Falha durante streaming');
    throw e;
  }
  p?.setStage('populating');
  p?.finish(null);
  return full;
}