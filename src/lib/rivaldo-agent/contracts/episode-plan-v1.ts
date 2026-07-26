import { z } from 'zod';
import { TreatmentPlanV1Schema } from './treatment-plan-v1';

/**
 * Wave B: EpisodePlanV1 = N trackPlans em UMA resposta do OpenRouter.
 * Mantém TreatmentPlanV1 como unidade por track para reaproveitar validador
 * e executor existentes.
 */
export const EpisodePlanV1Schema = z.object({
  version: z.literal('v1'),
  planId: z.string(),
  episodeId: z.string(),
  createdAtIso: z.string(),
  modelUsed: z.string(),
  summary: z.string().max(1200),
  trackPlans: z.array(z.object({
    reportId: z.string(),
    plan: TreatmentPlanV1Schema,
  })).min(1).max(16),
});
export type EpisodePlanV1 = z.infer<typeof EpisodePlanV1Schema>;

export interface PlannerEnvelope {
  requestId: string;
  provider: 'openrouter';
  model: string;
  createdAt: string;
  durationMs: number;
  usage: { inputTokens: number; outputTokens: number; costUsd?: number };
  plan: EpisodePlanV1;
  issues?: Array<{ layer: string; severity: string; message: string; trackReportId?: string }>;
}