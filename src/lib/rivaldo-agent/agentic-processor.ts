/**
 * Rivaldo Agentic V1 — Wave B.
 *
 * O antigo `agenticVoiceProcessor` (uma chamada de planner por track) foi
 * substituído por `runAgenticEpisode` (session.ts): 1 chamada por episódio.
 * Este módulo agora só constrói o `VoiceBufferProcessor` consumido pelo
 * pipeline, que apenas lê o buffer pré-tratado da session pelo id da track.
 * Se um id não estiver na session, joga erro para o pipeline fazer fallback
 * legado — nunca fica silencioso.
 */
import type { VoiceBufferProcessor } from '@/lib/audio/pipeline';
import type { AgenticOutcome } from './session';

export function buildAgenticVoiceProcessorFromSession(outcome: AgenticOutcome): VoiceBufferProcessor | null {
  if (outcome.mode !== 'agentic') return null;
  const treated = outcome.treatedByTrackId;
  return async (ctx) => {
    const hit = treated.get(ctx.id);
    if (!hit) throw new Error(`agentic_track_missing:${ctx.id}`);
    ctx.onProgress((ctx.progressBase + ctx.progressSpan) * 100, `${ctx.name}: agentic (pré-tratado)`);
    return hit;
  };
}