import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { AudioAnalysisReportV2 } from '../contracts/report-v2';
import type { PlannerEnvelope } from '../contracts/episode-plan-v1';

export interface EpisodePlanRequestPayload {
  episodeId: string;
  reports: AudioAnalysisReportV2[];
}

/**
 * Wave B: chamada ÚNICA por episódio para o planner. Retorna o envelope
 * completo (requestId real do OpenRouter, usage, trackPlans). Erros são
 * propagados como Error com `reasonCode` na message para o session
 * classificar o outcome (nunca engolir silenciosamente).
 */
export async function requestEpisodeTreatmentPlan(payload: EpisodePlanRequestPayload): Promise<PlannerEnvelope> {
  const { data, error } = await supabase.functions.invoke('plan-rivaldo-treatment', { body: payload });
  if (error) {
    const details = error instanceof FunctionsHttpError ? await error.context.text().catch(() => '') : error.message;
    throw new Error(`planner_failed: ${details || error.message}`);
  }
  if (!data || typeof data !== 'object' || !('plan' in data) || !('requestId' in data)) {
    throw new Error('planner_bad_response');
  }
  return data as PlannerEnvelope;
}