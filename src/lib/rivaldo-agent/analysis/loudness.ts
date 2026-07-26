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

/** True peak: 4x oversampling via linear interp + max abs. */
function truePeakDbtp(data: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < data.length - 1; i++) {
    const a = data[i], b = data[i + 1];
    for (let s = 0; s < 4; s++) {
      const t = s / 4;
      const v = Math.abs(a + (b - a) * t);
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