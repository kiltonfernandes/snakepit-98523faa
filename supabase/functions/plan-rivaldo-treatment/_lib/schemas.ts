// Self-contained Zod contracts for the edge function (mirror of
// src/lib/rivaldo-agent/contracts). Edge functions must not import from src/.
import { z } from 'npm:zod@3';

export const AudioEventTypeSchema = z.enum([
  'clipping','click','crackle','breath','sibilance','plosive','hum','level_jump','dropout','mouth_noise',
]);

export const AudioEventSchema = z.object({
  id: z.string(),
  type: AudioEventTypeSchema,
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  severity: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  meta: z.record(z.union([z.number(), z.string(), z.boolean()])).optional(),
});

export const AudioAnalysisReportV2Schema = z.object({
  version: z.literal('v2'),
  reportId: z.string(),
  createdAtIso: z.string(),
  source: z.object({
    filename: z.string(),
    sampleRate: z.number().int().positive(),
    durationSec: z.number().min(0),
    channels: z.number().int().min(1).max(2),
  }),
  loudness: z.object({
    integratedLufs: z.number(),
    momentaryMaxLufs: z.number(),
    shortTermMaxLufs: z.number(),
    loudnessRangeLu: z.number(),
    truePeakDbtp: z.number(),
  }),
  noise: z.object({
    floorDbfs: z.number(),
    speechSnrDb: z.number(),
    hum50HzDb: z.number(),
    hum60HzDb: z.number(),
    broadbandDbfs: z.number(),
  }),
  spectrum: z.object({
    centroidHz: z.number(),
    rolloff85Hz: z.number(),
    tiltDbPerOctave: z.number(),
    ltasBandsDb: z.array(z.number()).length(10),
  }),
  acoustics: z.object({
    rt60EstSec: z.number().min(0),
    rt60Confidence: z.number().min(0).max(1),
    directToReverbRatioDb: z.number(),
  }),
  speech: z.object({
    ratio: z.number().min(0).max(1),
    averageSegmentSec: z.number().min(0),
    totalSegments: z.number().int().min(0),
    energyPercentilesDbfs: z.object({ p10: z.number(), p50: z.number(), p90: z.number() }),
  }),
  events: z.array(AudioEventSchema),
  clippedRatio: z.number().min(0).max(1),
});
export type AudioAnalysisReportV2 = z.infer<typeof AudioAnalysisReportV2Schema>;

export const StageIdSchema = z.enum(['repair','noise','tone','events','dynamics','finish']);

export const RegionSchema = z.object({
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  fadeInMs: z.number().min(0).max(50).default(10),
  fadeOutMs: z.number().min(0).max(50).default(10),
});

export const OperationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('declip'),    region: RegionSchema, amount: z.number().min(0).max(100) }),
  z.object({ kind: z.literal('declick'),   region: RegionSchema, amount: z.number().min(0).max(100) }),
  z.object({ kind: z.literal('decrackle'), region: RegionSchema, amount: z.number().min(0).max(100) }),
  z.object({ kind: z.literal('denoise'),   region: RegionSchema, amount: z.number().min(0).max(100) }),
  z.object({ kind: z.literal('dehum'),     region: RegionSchema, frequencyHz: z.union([z.literal(50), z.literal(60)]), strength: z.number().min(0).max(100) }),
  z.object({
    kind: z.literal('eq'), region: RegionSchema,
    filters: z.array(z.object({
      type: z.enum(['peak','lowshelf','highshelf','lowpass','highpass']),
      frequencyHz: z.number().min(20).max(20000),
      gainDb: z.number().min(-18).max(18),
      q: z.number().min(0.1).max(10),
    })).min(1).max(6),
  }),
  z.object({ kind: z.literal('de_esser'),   region: RegionSchema, amount: z.number().min(0).max(100) }),
  z.object({ kind: z.literal('de_plosive'), region: RegionSchema, amount: z.number().min(0).max(100) }),
  z.object({ kind: z.literal('event_attenuate'), region: RegionSchema, eventId: z.string(), attenuationDb: z.number().min(-30).max(0) }),
  z.object({ kind: z.literal('compressor'), region: RegionSchema, amount: z.number().min(0).max(100) }),
  z.object({ kind: z.literal('gain'),       region: RegionSchema, gainDb: z.number().min(-24).max(12) }),
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
  predictedFinalLoudness: z.object({ voiceLufs: z.number(), truePeakDbtp: z.number() }),
});
export type TreatmentPlanV1 = z.infer<typeof TreatmentPlanV1Schema>;

/** Wave B: episódio completo = N trackPlans em uma única resposta. */
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

export const EpisodePlanRequestSchema = z.object({
  episodeId: z.string().min(1).max(200),
  reports: z.array(AudioAnalysisReportV2Schema).min(1).max(16),
});
export type EpisodePlanRequest = z.infer<typeof EpisodePlanRequestSchema>;

export const POLICY = {
  maxOperationsPerStage: 24,
  maxTotalOperations: 96,
  gainDbRange: [-24, 12] as const,
  eventAttenuationDbRange: [-30, 0] as const,
  regionFadeMsRange: [5, 20] as const,
  minRegionMs: 8,
  maxRegionSec: 300,
};

export const TARGET = {
  voiceLufs: -19,
  truePeakCeilingDbtp: -1.5,
  minSpeechSnrDb: 22,
  speechCentroidHzRange: [1200, 3200] as const,
  maxRt60Sec: 0.4,
};