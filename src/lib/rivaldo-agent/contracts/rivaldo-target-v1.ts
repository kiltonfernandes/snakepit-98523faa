/**
 * RIVALDO_TARGET_V1 — objetivo global e imutável do tratamento agentic.
 *
 * Toda decisão do planner e do executor deve tender a este alvo. O planner
 * recebe estes números no prompt; o executor mede depois e loga o desvio.
 */
export const RIVALDO_TARGET_V1 = {
  version: 'v1' as const,
  loudness: {
    /** LUFS integrado da voz tratada (antes de intro/outro/BGM). */
    voiceLufs: -19,
    /** LUFS integrado do master final (com BGM/intro/outro). */
    masterLufs: -16,
    /** True Peak máximo (dBTP). */
    truePeakCeilingDbtp: -1.5,
    /** Loudness Range alvo (LU). */
    loudnessRange: 6,
  },
  noise: {
    /** SNR mínimo desejado na fala (dB). */
    minSpeechSnrDb: 22,
    /** Piso de ruído desejado (dBFS RMS). */
    targetNoiseFloorDbfs: -60,
  },
  tone: {
    /** Faixa aceitável do centroid espectral em fala (Hz). */
    speechCentroidHzRange: [1200, 3200] as const,
  },
  reverb: {
    /** RT60 máximo tolerado (s). Acima disso, aplicar dereverb. */
    maxRt60Sec: 0.4,
  },
} as const;

export type RivaldoTargetV1 = typeof RIVALDO_TARGET_V1;

/**
 * TreatmentPolicyV1 — limites duros de segurança que o planner NUNCA pode
 * violar. A validação recusa qualquer operação que ultrapasse essas faixas.
 */
export const TREATMENT_POLICY_V1 = {
  version: 'v1' as const,
  maxOperationsPerStage: 24,
  maxTotalOperations: 96,
  /** Faixa (dB) permitida por ganho estático. */
  gainDbRange: [-24, 12] as const,
  /** Faixa (dB) permitida por atenuação de evento (breath/plosive/etc). */
  eventAttenuationDbRange: [-30, 0] as const,
  /** Fade mínimo/máximo (ms) para toda operação regional. */
  regionFadeMsRange: [5, 20] as const,
  /** Duração mínima (ms) de qualquer região operada. */
  minRegionMs: 8,
  /** Duração máxima (s) de uma única região contínua. */
  maxRegionSec: 300,
  /** Amount 0-100 permitido em processadores paramétricos. */
  amountRange: [0, 100] as const,
} as const;

export type TreatmentPolicyV1 = typeof TREATMENT_POLICY_V1;