import { supabase } from '@/integrations/supabase/client';
import type { AudioAnalysisReportV2 } from '../contracts/report-v2';
import type { TreatmentPlanV1 } from '../contracts/treatment-plan-v1';
import type { ValidationIssue } from './validate';

export interface PlanResponse {
  plan: TreatmentPlanV1;
  issues: ValidationIssue[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
}

/** Client bridge — main-thread invoca a Edge Function do planner. */
export async function requestTreatmentPlan(report: AudioAnalysisReportV2): Promise<PlanResponse> {
  const { data, error } = await supabase.functions.invoke('plan-rivaldo-treatment', { body: report });
  if (error) throw new Error(`planner_failed: ${error.message}`);
  if (!data || typeof data !== 'object' || !('plan' in data)) throw new Error('planner: resposta inválida');
  return data as PlanResponse;
}