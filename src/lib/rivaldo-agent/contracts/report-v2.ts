import { z } from 'zod';

/**
 * AudioAnalysisReportV2 — payload compacto que a análise local envia ao
 * planner. Sem curvas/arrays gigantes: só percentis, agregados e eventos.
 */

export const AudioEventTypeSchema = z.enum([
  'clipping',
  'click',
  'crackle',
  'breath',
  'sibilance',
  'plosive',
  'hum',
  'level_jump',
  'dropout',
  'mouth_noise',
]);
export type AudioEventType = z.infer<typeof AudioEventTypeSchema>;

export const AudioEventSchema = z.object({
  id: z.string(),
  type: AudioEventTypeSchema,
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  severity: z.number().min(0).max(1),
  /** Confidence [0,1] — detector may be uncertain (dropout on speech pause etc). */
  confidence: z.number().min(0).max(1),
  /** Optional detector-specific fields, kept small. */
  meta: z.record(z.union([z.number(), z.string(), z.boolean()])).optional(),
});
export type AudioEvent = z.infer<typeof AudioEventSchema>;

export const LoudnessBlockSchema = z.object({
  integratedLufs: z.number(),
  momentaryMaxLufs: z.number(),
  shortTermMaxLufs: z.number(),
  loudnessRangeLu: z.number(),
  truePeakDbtp: z.number(),
});

export const NoiseBlockSchema = z.object({
  floorDbfs: z.number(),
  speechSnrDb: z.number(),
  hum50HzDb: z.number(),
  hum60HzDb: z.number(),
  broadbandDbfs: z.number(),
});

export const SpectrumBlockSchema = z.object({
  centroidHz: z.number(),
  rolloff85Hz: z.number(),
  tiltDbPerOctave: z.number(),
  /** LTAS em 10 bandas (dB relativo). Compacto o suficiente para prompt. */
  ltasBandsDb: z.array(z.number()).length(10),
});

export const AcousticsBlockSchema = z.object({
  rt60EstSec: z.number().min(0),
  rt60Confidence: z.number().min(0).max(1),
  directToReverbRatioDb: z.number(),
});

export const SpeechBlockSchema = z.object({
  ratio: z.number().min(0).max(1),
  averageSegmentSec: z.number().min(0),
  totalSegments: z.number().int().min(0),
  /** Percentis de energia da fala (dBFS): p10, p50, p90. */
  energyPercentilesDbfs: z.object({
    p10: z.number(),
    p50: z.number(),
    p90: z.number(),
  }),
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
  loudness: LoudnessBlockSchema,
  noise: NoiseBlockSchema,
  spectrum: SpectrumBlockSchema,
  acoustics: AcousticsBlockSchema,
  speech: SpeechBlockSchema,
  events: z.array(AudioEventSchema),
  /** Ratio de amostras clipadas [0,1]. */
  clippedRatio: z.number().min(0).max(1),
});
export type AudioAnalysisReportV2 = z.infer<typeof AudioAnalysisReportV2Schema>;