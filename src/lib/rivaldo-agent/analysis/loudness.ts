import { kWeight } from './k-weighting';
import { resampleLinear } from '@/lib/audio/dsp';

/** BS.1770-5 gated integrated LUFS + short-term + momentary + LRA. */

function meanSquareBlocks(k: Float32Array, sr: number, blockSec: number, hopSec: number): number[] {
  const blockSize = Math.round(blockSec * sr);
  const hopSize = Math.round(hopSec * sr);
  const out: number[] = [];
  for (let start = 0; start + blockSize <= k.length; start += hopSize) {
    let sum = 0;
    for (let i = start; i < start + blockSize; i++) sum += k[i] * k[i];
    out.push(sum / blockSize);
  }
  return out;
}

const ms2lufs = (ms: number) => (ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity);

export interface LoudnessResult {
  integratedLufs: number;
  momentaryMaxLufs: number;
  shortTermMaxLufs: number;
  loudnessRangeLu: number;
  truePeakDbtp: number;
}

/**
 * True peak (dBTP) via 4x oversampling **band-limited** (polyphase FIR windowed-sinc).
 * Substitui a interpolação linear anterior — que subestima inter-sample peaks.
 */
const TP_FACTOR = 4;
const TP_TAPS = 24; // por fase
// Kernel windowed-sinc (Hann) pré-computado para 4x oversampling.
const TP_KERNELS: Float32Array[] = (() => {
  const kernels: Float32Array[] = [];
  const half = TP_TAPS / 2;
  for (let phase = 0; phase < TP_FACTOR; phase++) {
    const k = new Float32Array(TP_TAPS);
    let sum = 0;
    for (let n = 0; n < TP_TAPS; n++) {
      const t = n - half + 1 - phase / TP_FACTOR;
      const x = Math.PI * t;
      const sinc = Math.abs(t) < 1e-9 ? 1 : Math.sin(x) / x;
      const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (TP_TAPS - 1));
      const v = sinc * win;
      k[n] = v; sum += v;
    }
    if (sum > 0) for (let n = 0; n < TP_TAPS; n++) k[n] /= sum;
    kernels.push(k);
  }
  return kernels;
})();

function truePeakDbtp(data: Float32Array): number {
  let peak = 0;
  const half = TP_TAPS / 2;
  const N = data.length;
  for (let i = 0; i < N; i++) {
    // fase 0 = amostra original
    const s0 = Math.abs(data[i]);
    if (s0 > peak) peak = s0;
    // fases 1..TP_FACTOR-1 = interpoladas band-limited
    for (let phase = 1; phase < TP_FACTOR; phase++) {
      const k = TP_KERNELS[phase];
      let acc = 0;
      for (let n = 0; n < TP_TAPS; n++) {
        const idx = i + n - half + 1;
        if (idx >= 0 && idx < N) acc += data[idx] * k[n];
      }
      const v = Math.abs(acc);
      if (v > peak) peak = v;
    }
  }
  return 20 * Math.log10(Math.max(peak, 1e-9));
}

export function measureLoudness(data: Float32Array, sampleRate: number): LoudnessResult {
  const src = sampleRate === 48000 ? data : resampleLinear(data, sampleRate, 48000);
  const k = kWeight(src);

  // 400ms/100ms hop → momentary; 3s/1s → short-term
  const momentary = meanSquareBlocks(k, 48000, 0.4, 0.1);
  const shortTerm = meanSquareBlocks(k, 48000, 3.0, 1.0);

  // Absolute gate -70 LUFS
  const gated1 = momentary.filter((m) => ms2lufs(m) >= -70);
  const ungatedMean = gated1.length ? gated1.reduce((a, b) => a + b, 0) / gated1.length : 0;
  const relGate = ms2lufs(ungatedMean) - 10; // relative gate
  const gated2 = gated1.filter((m) => ms2lufs(m) >= relGate);
  const integratedMS = gated2.length ? gated2.reduce((a, b) => a + b, 0) / gated2.length : 0;
  const integratedLufs = ms2lufs(integratedMS);

  const momentaryLufs = momentary.map(ms2lufs).filter((v) => Number.isFinite(v));
  const shortTermLufs = shortTerm.map(ms2lufs).filter((v) => Number.isFinite(v));
  const momentaryMax = momentaryLufs.length ? Math.max(...momentaryLufs) : integratedLufs;
  const shortTermMax = shortTermLufs.length ? Math.max(...shortTermLufs) : integratedLufs;

  // LRA (EBU R128): p95 - p10 of gated (relative to -20 LU below integrated) short-term blocks
  const stGated = shortTermLufs.filter((v) => v >= integratedLufs - 20 && v >= -70).sort((a, b) => a - b);
  const p = (arr: number[], q: number) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * q))] : 0;
  const loudnessRangeLu = stGated.length ? p(stGated, 0.95) - p(stGated, 0.1) : 0;

  return {
    integratedLufs: Number.isFinite(integratedLufs) ? integratedLufs : -70,
    momentaryMaxLufs: momentaryMax,
    shortTermMaxLufs: shortTermMax,
    loudnessRangeLu,
    truePeakDbtp: truePeakDbtp(src),
  };
}