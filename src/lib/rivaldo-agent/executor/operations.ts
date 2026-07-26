/**
 * Implementações locais das operações declaradas no TreatmentPlanV1.
 *
 * Cada função recebe a região extraída (Float32Array mono) + parâmetros
 * validados e devolve uma nova Float32Array processada. Nenhuma operação
 * escreve fora da região; o `blendRegion` cuida do cross-fade de volta.
 *
 * As operações são deliberadamente conservadoras — a segurança já foi
 * garantida pelos 7 layers de validação. Aqui a prioridade é (a) fazer o
 * DSP acontecer no dispositivo do usuário e (b) manter latência baixa.
 */
import { applyGainInPlace, clamp, createHannWindow, dbToGain, percentile, rms, stft, istft } from '@/lib/audio/dsp';
import { applyBiquad, makeBiquad } from './biquad';
import type { Operation } from '../contracts/treatment-plan-v1';

const clamp01 = (v: number) => clamp(v, 0, 1);

/** Soft-clip inverso para reconstrução de picos clipados. amount 0..100. */
export function applyDeclip(region: Float32Array, amount: number): Float32Array {
  const strength = clamp01(amount / 100);
  const threshold = 0.98 - 0.15 * strength;
  const out = new Float32Array(region.length);
  for (let i = 0; i < region.length; i++) {
    const x = region[i];
    const absX = Math.abs(x);
    if (absX < threshold) { out[i] = x; continue; }
    const overshoot = absX - threshold;
    const softened = threshold + Math.tanh(overshoot * (1 + strength * 4)) * (1 - threshold);
    out[i] = Math.sign(x) * softened;
  }
  return out;
}

/** Median-of-3 nos picos anômalos (clicks). amount modula limiar. */
export function applyDeclick(region: Float32Array, amount: number): Float32Array {
  const strength = clamp01(amount / 100);
  const threshold = 0.35 - 0.2 * strength;
  const out = new Float32Array(region);
  for (let i = 1; i < region.length - 1; i++) {
    const a = region[i - 1], b = region[i], c = region[i + 1];
    if (Math.abs(b - (a + c) / 2) > threshold) {
      const sorted = [a, b, c].sort((x, y) => x - y);
      out[i] = sorted[1];
    }
  }
  return out;
}

/** Suaviza crepitações com média móvel curta apenas nas amostras suspeitas. */
export function applyDecrackle(region: Float32Array, amount: number): Float32Array {
  const strength = clamp01(amount / 100);
  const win = 3 + Math.floor(strength * 4);
  const out = new Float32Array(region);
  const half = win >> 1;
  for (let i = half; i < region.length - half; i++) {
    let sum = 0;
    for (let k = -half; k <= half; k++) sum += region[i + k];
    const mean = sum / win;
    const diff = region[i] - mean;
    if (Math.abs(diff) > 0.08) out[i] = mean + diff * (1 - strength * 0.6);
  }
  return out;
}

/** Spectral gate simples: estima piso no primeiro ~0.3s e subtrai magnitude. */
export function applyDenoise(region: Float32Array, amount: number, sampleRate: number): Float32Array {
  if (region.length < 2048) return new Float32Array(region);
  const strength = clamp01(amount / 100);
  const fftSize = 2048;
  const hopSize = 512;
  const stftRes = stft(region, fftSize, hopSize);
  const bins = fftSize / 2 + 1;
  const noiseSampleFrames = Math.max(4, Math.floor((0.3 * sampleRate) / hopSize));
  const noiseMag = new Float32Array(bins);
  const framesForNoise = Math.min(noiseSampleFrames, stftRes.frames.length);
  for (let f = 0; f < framesForNoise; f++) {
    const fr = stftRes.frames[f];
    for (let b = 0; b < bins; b++) {
      const mag = Math.hypot(fr.real[b], fr.imag[b]);
      if (f === 0 || mag < noiseMag[b]) noiseMag[b] = mag;
    }
  }
  const reduction = 0.5 + strength * 1.5; // 0.5..2.0x
  for (const fr of stftRes.frames) {
    for (let b = 0; b < bins; b++) {
      const re = fr.real[b], im = fr.imag[b];
      const mag = Math.hypot(re, im);
      const clean = Math.max(0, mag - noiseMag[b] * reduction);
      const gain = mag > 1e-9 ? clean / mag : 0;
      fr.real[b] = re * gain;
      fr.imag[b] = im * gain;
    }
  }
  return istft(stftRes);
}

/** Notch em fundamental + 2 harmônicos. */
export function applyDehum(region: Float32Array, frequencyHz: 50 | 60, strengthPct: number, sampleRate: number): Float32Array {
  const strength = clamp01(strengthPct / 100);
  const q = 15 + 25 * strength;
  let cur: Float32Array = new Float32Array(region);
  for (const mult of [1, 2, 3]) {
    const freq = frequencyHz * mult;
    if (freq >= sampleRate / 2) break;
    const coefs = makeBiquad('notch', sampleRate, freq, q);
    cur = applyBiquad(cur, coefs);
  }
  return cur;
}

/**
 * Dereverb aproximado: reduz a "cauda" magnitudes-baixas via subtração de
 * envelope temporal por bin. Barato e suficiente para vozes com sala leve.
 */
export function applyDereverb(region: Float32Array, amount: number, sampleRate: number): Float32Array {
  if (region.length < 4096) return new Float32Array(region);
  const strength = clamp01(amount / 100);
  const fftSize = 2048;
  const hopSize = 512;
  const res = stft(region, fftSize, hopSize);
  const bins = fftSize / 2 + 1;
  const smoothing = 0.7;
  const env = new Float32Array(bins);
  for (const fr of res.frames) {
    for (let b = 0; b < bins; b++) {
      const mag = Math.hypot(fr.real[b], fr.imag[b]);
      env[b] = env[b] * smoothing + mag * (1 - smoothing);
      const suppression = env[b] * strength * 0.6;
      const clean = Math.max(0, mag - suppression);
      const gain = mag > 1e-9 ? clean / mag : 0;
      fr.real[b] *= gain; fr.imag[b] *= gain;
    }
  }
  // Ensure Hann window is referenced (no-op safety for tree-shaking assumptions)
  void createHannWindow;
  return istft(res);
}

/** EQ paramétrico: cascata de biquads. */
export function applyEq(
  region: Float32Array,
  filters: Array<{ type: 'peak' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass'; frequencyHz: number; gainDb: number; q: number }>,
  sampleRate: number,
): Float32Array {
  let cur: Float32Array = new Float32Array(region);
  for (const f of filters) {
    const coefs = makeBiquad(f.type, sampleRate, f.frequencyHz, f.q, f.gainDb);
    cur = applyBiquad(cur, coefs);
  }
  return cur;
}

/** De-esser: envelope na banda 5-9 kHz aplica gain reduction quando estoura. */
export function applyDeEsser(region: Float32Array, amount: number, sampleRate: number): Float32Array {
  const strength = clamp01(amount / 100);
  const detectorCoefs = makeBiquad('bandpass', sampleRate, 7000, 1.2);
  const detector = applyBiquad(region, detectorCoefs);
  const attack = Math.exp(-1 / (0.001 * sampleRate)); // ~1ms
  const release = Math.exp(-1 / (0.05 * sampleRate));  // ~50ms
  const threshold = 0.05;
  const maxReductionDb = -3 - 6 * strength;
  const out = new Float32Array(region.length);
  let env = 0;
  for (let i = 0; i < region.length; i++) {
    const level = Math.abs(detector[i]);
    env = level > env ? attack * env + (1 - attack) * level : release * env + (1 - release) * level;
    const over = Math.max(0, env - threshold);
    const reductionDb = Math.min(0, maxReductionDb * clamp01(over / 0.15));
    out[i] = region[i] * dbToGain(reductionDb);
  }
  return out;
}

/** De-plosive: high-pass 80 Hz apenas na região. amount modula ordem (repete). */
export function applyDePlosive(region: Float32Array, amount: number, sampleRate: number): Float32Array {
  const strength = clamp01(amount / 100);
  const passes = 1 + Math.round(strength * 2);
  let cur: Float32Array = new Float32Array(region);
  const coefs = makeBiquad('highpass', sampleRate, 80, 0.707);
  for (let p = 0; p < passes; p++) cur = applyBiquad(cur, coefs);
  return cur;
}

/** event_attenuate: gain fixo em dB (negativo). */
export function applyEventAttenuate(region: Float32Array, attenuationDb: number): Float32Array {
  const out = new Float32Array(region);
  applyGainInPlace(out, attenuationDb);
  return out;
}

/** Compressor feed-forward simples. amount define ratio e threshold. */
export function applyCompressor(region: Float32Array, amount: number, sampleRate: number): Float32Array {
  const strength = clamp01(amount / 100);
  const ratio = 1 + strength * 3; // 1..4:1
  // Threshold em torno do p85 da amplitude para captar os picos, não a fala inteira
  const absValues: number[] = [];
  const stride = Math.max(1, Math.floor(region.length / 4096));
  for (let i = 0; i < region.length; i += stride) absValues.push(Math.abs(region[i]));
  const thresh = Math.max(0.05, percentile(absValues, 0.85));
  const attack = Math.exp(-1 / (0.005 * sampleRate));
  const release = Math.exp(-1 / (0.1 * sampleRate));
  const makeup = dbToGain(strength * 3);
  const out = new Float32Array(region.length);
  let env = 0;
  for (let i = 0; i < region.length; i++) {
    const lvl = Math.abs(region[i]);
    env = lvl > env ? attack * env + (1 - attack) * lvl : release * env + (1 - release) * lvl;
    let gain = 1;
    if (env > thresh) {
      const over = env / thresh;
      const compressed = Math.pow(over, 1 / ratio);
      gain = compressed / over;
    }
    out[i] = region[i] * gain * makeup;
  }
  return out;
}

/** Gain plano em dB. */
export function applyGain(region: Float32Array, gainDb: number): Float32Array {
  const out = new Float32Array(region);
  applyGainInPlace(out, gainDb);
  return out;
}

/**
 * Roteador de operação → função. Retorna o buffer processado.
 * Lança se `op.kind` for desconhecido — inconsistência com o schema.
 */
export function runOperation(op: Operation, region: Float32Array, sampleRate: number): Float32Array {
  switch (op.kind) {
    case 'declip':          return applyDeclip(region, op.amount);
    case 'declick':         return applyDeclick(region, op.amount);
    case 'decrackle':       return applyDecrackle(region, op.amount);
    case 'denoise':         return applyDenoise(region, op.amount, sampleRate);
    case 'dehum':           return applyDehum(region, op.frequencyHz, op.strength, sampleRate);
    case 'dereverb':        return applyDereverb(region, op.amount, sampleRate);
    case 'eq':              return applyEq(region, op.filters, sampleRate);
    case 'de_esser':        return applyDeEsser(region, op.amount, sampleRate);
    case 'de_plosive':      return applyDePlosive(region, op.amount, sampleRate);
    case 'event_attenuate': return applyEventAttenuate(region, op.attenuationDb);
    case 'compressor':      return applyCompressor(region, op.amount, sampleRate);
    case 'gain':            return applyGain(region, op.gainDb);
    default: {
      const _exhaustive: never = op;
      throw new Error(`unknown_operation: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** Métricas rápidas para logging (não substituem o report V2). */
export function quickRms(region: Float32Array): number {
  return rms(region);
}