import { z } from 'zod';

/**
 * TreatmentPlanV1 — o plano que o OpenRouter devolve para o executor local.
 *
 * Estágios fixos garantem ordem determinística: repair → noise → tone →
 * events → dynamics → finish. Cada operação declara o tipo, região temporal,
 * parâmetros e uma justificativa curta ancorada em evidências do relatório.
 */

export const StageIdSchema = z.enum([
  'repair',
  'noise',
  'tone',
  'events',
  'dynamics',
  'finish',
]);
export type StageId = z.infer<typeof StageIdSchema>;

export const RegionSchema = z.object({
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  fadeInMs: z.number().min(0).max(50).default(10),
  fadeOutMs: z.number().min(0).max(50).default(10),
});
export type Region = z.infer<typeof RegionSchema>;

/**
 * União discriminada de operações permitidas. Qualquer operação fora desta
 * lista é rejeitada pela validação estrutural.
 */
export const OperationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('declip'),
    region: RegionSchema,
    amount: z.number().min(0).max(100),
  }),
  z.object({
    kind: z.literal('declick'),
    region: RegionSchema,
    amount: z.number().min(0).max(100),
  }),
  z.object({
    kind: z.literal('decrackle'),
    region: RegionSchema,
    amount: z.number().min(0).max(100),
  }),
  z.object({
    kind: z.literal('denoise'),
    region: RegionSchema,
    amount: z.number().min(0).max(100),
  }),
  z.object({
    kind: z.literal('dehum'),
    region: RegionSchema,
    frequencyHz: z.union([z.literal(50), z.literal(60)]),
    strength: z.number().min(0).max(100),
  }),
  z.object({
    kind: z.literal('dereverb'),
    region: RegionSchema,
    amount: z.number().min(0).max(100),
  }),
  z.object({
    kind: z.literal('eq'),
    region: RegionSchema,
    /** Filtros parametricos: até 6 por operação. */
    filters: z.array(z.object({
      type: z.enum(['peak', 'lowshelf', 'highshelf', 'lowpass', 'highpass']),
      frequencyHz: z.number().min(20).max(20000),
      gainDb: z.number().min(-18).max(18),
      q: z.number().min(0.1).max(10),
    })).min(1).max(6),
  }),
  z.object({
    kind: z.literal('de_esser'),
    region: RegionSchema,
    amount: z.number().min(0).max(100),
  }),
  z.object({
    kind: z.literal('de_plosive'),
    region: RegionSchema,
    amount: z.number().min(0).max(100),
  }),
  z.object({
    kind: z.literal('event_attenuate'),
    region: RegionSchema,
    eventId: z.string(),
    attenuationDb: z.number().min(-30).max(0),
  }),
  z.object({
    kind: z.literal('compressor'),
    region: RegionSchema,
    amount: z.number().min(0).max(100),
  }),
  z.object({
    kind: z.literal('gain'),
    region: RegionSchema,
    gainDb: z.number().min(-24).max(12),
  }),
]);
export type Operation = z.infer<typeof OperationSchema>;

export const StageSchema = z.object({
  stage: StageIdSchema,
  operations: z.array(OperationSchema).max(24),
});
export type Stage = z.infer<typeof StageSchema>;

export const TreatmentPlanV1Schema = z.object({
  version: z.literal('v1'),
  planId: z.string(),
  reportId: z.string(),
  createdAtIso: z.string(),
  modelUsed: z.string(),
  summary: z.string().max(600),
  stages: z.array(StageSchema).max(6),
  /** LUFS/dBTP alvo previstos pelo planner, para o executor comparar. */
  predictedFinalLoudness: z.object({
    voiceLufs: z.number(),
    truePeakDbtp: z.number(),
  }),
});
export type TreatmentPlanV1 = z.infer<typeof TreatmentPlanV1Schema>;