import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { AudioAnalysisReportV2 } from '../contracts/report-v2';
import type { PlannerEnvelope } from '../contracts/episode-plan-v1';
import { PLANNER_REQUEST_HARD_LIMIT_BYTES } from './findings';

export interface EpisodePlanRequestPayload {
  episodeId: string;
  reports: AudioAnalysisReportV2[];
}

function payloadBytes(payload: EpisodePlanRequestPayload): number {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
}

/**
 * Faz uma chamada por episódio para o planner. O limite local evita que um
 * payload impossível seja entregue ao gateway e vire um erro de rede opaco.
 */
export async function requestEpisodeTreatmentPlan(
  payload: EpisodePlanRequestPayload,
): Promise<PlannerEnvelope> {
  const bytes = payloadBytes(payload);
  if (bytes > PLANNER_REQUEST_HARD_LIMIT_BYTES) {
    throw new Error(
      `planner_payload_too_large:${bytes}>${PLANNER_REQUEST_HARD_LIMIT_BYTES}`,
    );
  }

  const plannerUrl = import.meta.env.VITE_RIVALDO_PLANNER_URL?.trim();
  if (plannerUrl) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (sessionError || !accessToken) {
      throw new Error('planner_failed:Unauthorized:no_active_session');
    }

    let response: Response;
    try {
      response = await fetch(plannerUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'network_error';
      throw new Error(
        `planner_failed:WorkerNetworkError:${message}:origin=${window.location.origin}:payloadBytes=${bytes}`,
      );
    }

    const responseText = await response.text();
    let data: unknown = null;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch {
      throw new Error(`planner_failed:WorkerBadJson:status=${response.status}`);
    }
    if (!response.ok) {
      const errorCode =
        data && typeof data === 'object' && 'error' in data
          ? String((data as { error: unknown }).error)
          : response.statusText;
      throw new Error(
        `planner_failed:WorkerHttpError:${response.status}:${errorCode}:payloadBytes=${bytes}`,
      );
    }
    if (!data || typeof data !== 'object' || !('plan' in data) || !('requestId' in data)) {
      throw new Error('planner_bad_response');
    }
    return data as PlannerEnvelope;
  }

  const { data, error } = await supabase.functions.invoke('plan-rivaldo-treatment', {
    body: payload,
  });
  if (error) {
    const details =
      error instanceof FunctionsHttpError
        ? await error.context.text().catch(() => '')
        : error.message;
    const kind = error.constructor?.name ?? 'FunctionsError';
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'unknown-origin';
    throw new Error(
      `planner_failed:${kind}:${details || error.message}:origin=${origin}:payloadBytes=${bytes}`,
    );
  }
  if (!data || typeof data !== 'object' || !('plan' in data) || !('requestId' in data)) {
    throw new Error('planner_bad_response');
  }
  return data as PlannerEnvelope;
}
