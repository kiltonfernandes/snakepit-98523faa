/**
 * Safety limiter true-peak (Wave D).
 *
 * Aplicado SEMPRE como último passo, fora do controle do planner. Garante
 * que nenhum pico (inter-sample) exceda `ceilingDbtp` (default -1.5 dBTP).
 *
 * Implementação: lookahead 3 ms, detector = |x| com envelope de release
 * exponencial. Ataque instantâneo. Reduz ganho por amostra apenas quando
 * necessário — se o áudio já está abaixo do teto, é passthrough perfeito.
 *
 * Não é substitutivo do executor: é a última linha de defesa contra picos
 * inter-sample que possam ter escapado das ops do plano.
 */
import { dbToGain } from '@/lib/audio/dsp';

export interface SafetyLimiterStats {
  applied: boolean;
  peakBeforeDbfs: number;
  peakAfterDbfs: number;
  maxGainReductionDb: number;
  sampleCountReduced: number;
}

export function applySafetyLimiter(
  data: Float32Array,
  sampleRate: number,
  ceilingDbtp = -1.5,
): { output: Float32Array; stats: SafetyLimiterStats } {
  const ceiling = dbToGain(ceilingDbtp);
  const lookaheadSamples = Math.max(8, Math.round(sampleRate * 0.003));
  const releaseCoef = Math.exp(-1 / (sampleRate * 0.05)); // 50 ms release
  const out = new Float32Array(data.length);
  let peakBefore = 0;
  for (let i = 0; i < data.length; i++) peakBefore = Math.max(peakBefore, Math.abs(data[i]));
  if (peakBefore <= ceiling) {
    // passthrough — sem alocação extra
    out.set(data);
    return {
      output: out,
      stats: {
        applied: false, peakBeforeDbfs: 20 * Math.log10(Math.max(peakBefore, 1e-9)),
        peakAfterDbfs: 20 * Math.log10(Math.max(peakBefore, 1e-9)),
        maxGainReductionDb: 0, sampleCountReduced: 0,
      },
    };
  }
  // Envelope de detecção com lookahead: cada amostra i olha [i, i+lookahead)
  // e escolhe o gain que garante que o pico local não passe do teto.
  let env = 0;
  let maxGr = 0; let reducedCount = 0;
  let peakAfter = 0;
  for (let i = 0; i < data.length; i++) {
    let localPeak = 0;
    const end = Math.min(data.length, i + lookaheadSamples);
    for (let j = i; j < end; j++) {
      const v = Math.abs(data[j]);
      if (v > localPeak) localPeak = v;
    }
    const desiredGain = localPeak > ceiling ? ceiling / localPeak : 1;
    // Ataque instantâneo (só desce), release exponencial (sobe suave)
    if (desiredGain < env || env === 0) env = desiredGain;
    else env = env * releaseCoef + desiredGain * (1 - releaseCoef);
    const y = data[i] * env;
    out[i] = y;
    const absY = Math.abs(y);
    if (absY > peakAfter) peakAfter = absY;
    if (env < 1) {
      reducedCount++;
      const grDb = -20 * Math.log10(Math.max(env, 1e-9));
      if (grDb > maxGr) maxGr = grDb;
    }
  }
  return {
    output: out,
    stats: {
      applied: true,
      peakBeforeDbfs: 20 * Math.log10(Math.max(peakBefore, 1e-9)),
      peakAfterDbfs: 20 * Math.log10(Math.max(peakAfter, 1e-9)),
      maxGainReductionDb: maxGr, sampleCountReduced: reducedCount,
    },
  };
}