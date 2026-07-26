import { stft, createHannWindow, resampleLinear } from '@/lib/audio/dsp';

/** LTAS + centroid + rolloff + tilt via STFT médio. */

const FFT_SIZE = 2048;
const HOP = 1024;

export interface SpectrumResult {
  centroidHz: number;
  rolloff85Hz: number;
  tiltDbPerOctave: number;
  ltasBandsDb: number[]; // 10 bandas log
  humBins: { hum50HzDb: number; hum60HzDb: number };
}

function bandEdgesLog(lowHz: number, highHz: number, count: number): number[] {
  const edges: number[] = [];
  const logLow = Math.log(lowHz), logHigh = Math.log(highHz);
  for (let i = 0; i <= count; i++) edges.push(Math.exp(logLow + (logHigh - logLow) * (i / count)));
  return edges;
}

export function measureSpectrum(data: Float32Array, sampleRate: number): SpectrumResult {
  const src = sampleRate === 48000 ? data : resampleLinear(data, sampleRate, 48000);
  const sr = 48000;
  const res = stft(src, FFT_SIZE, HOP);
  const bins = FFT_SIZE / 2 + 1;
  const avgMag = new Float32Array(bins);
  const frames = res.frames;
  if (frames.length === 0) {
    return { centroidHz: 0, rolloff85Hz: 0, tiltDbPerOctave: 0, ltasBandsDb: new Array(10).fill(-100), humBins: { hum50HzDb: -100, hum60HzDb: -100 } };
  }
  for (const f of frames) {
    for (let b = 0; b < bins; b++) {
      avgMag[b] += Math.sqrt(f.real[b] * f.real[b] + f.imag[b] * f.imag[b]);
    }
  }
  for (let b = 0; b < bins; b++) avgMag[b] /= frames.length;

  const binHz = sr / FFT_SIZE;
  let energySum = 0, energyWeightedFreq = 0;
  for (let b = 1; b < bins; b++) { const e = avgMag[b] * avgMag[b]; energySum += e; energyWeightedFreq += e * (b * binHz); }
  const centroid = energySum > 0 ? energyWeightedFreq / energySum : 0;

  let cum = 0; const target = energySum * 0.85; let rolloffBin = bins - 1;
  for (let b = 1; b < bins; b++) { cum += avgMag[b] * avgMag[b]; if (cum >= target) { rolloffBin = b; break; } }
  const rolloff = rolloffBin * binHz;

  // 10 bandas log 80 Hz .. 12 kHz
  const edges = bandEdgesLog(80, 12000, 10);
  const ltasBandsDb: number[] = [];
  for (let band = 0; band < 10; band++) {
    const lo = edges[band], hi = edges[band + 1];
    let sum = 0, count = 0;
    for (let b = 1; b < bins; b++) {
      const f = b * binHz;
      if (f >= lo && f < hi) { sum += avgMag[b] * avgMag[b]; count++; }
    }
    const rms = count > 0 ? Math.sqrt(sum / count) : 1e-9;
    ltasBandsDb.push(20 * Math.log10(Math.max(rms, 1e-9)));
  }

  // Tilt: regressão linear em dB por log2(freq) sobre as bandas
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < 10; i++) {
    const centerHz = Math.sqrt(edges[i] * edges[i + 1]);
    xs.push(Math.log2(centerHz));
    ys.push(ltasBandsDb[i]);
  }
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - meanX) * (ys[i] - meanY); den += (xs[i] - meanX) ** 2; }
  const tilt = den > 0 ? num / den : 0;

  // Hum peaks: bin próximo a 50 / 60 Hz + harmônicos, comparado ao piso
  const humAt = (hz: number) => {
    const b = Math.round(hz / binHz);
    if (b <= 0 || b >= bins) return -100;
    const mag = avgMag[b];
    return 20 * Math.log10(Math.max(mag, 1e-9));
  };
  const humBins = { hum50HzDb: humAt(50), hum60HzDb: humAt(60) };

  return { centroidHz: centroid, rolloff85Hz: rolloff, tiltDbPerOctave: tilt, ltasBandsDb, humBins };
}