import FFT from 'fft.js';

export interface SpeechRegion {
  startSample: number;
  endSample: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(gain, 1e-9));
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp(Math.floor((sorted.length - 1) * q), 0, sorted.length - 1);
  return sorted[idx];
}

export function cloneChannelData(data: Float32Array): Float32Array {
  return new Float32Array(data);
}

export function mixToMono(channelData: Float32Array[]): Float32Array {
  if (channelData.length === 0) return new Float32Array();
  if (channelData.length === 1) return cloneChannelData(channelData[0]);
  const length = channelData[0].length;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sample = 0;
    for (const channel of channelData) {
      sample += channel[i] ?? 0;
    }
    out[i] = sample / channelData.length;
  }
  return out;
}

export function peak(data: Float32Array): number {
  let max = 0;
  for (let i = 0; i < data.length; i++) {
    const value = Math.abs(data[i]);
    if (value > max) max = value;
  }
  return max;
}

export function rms(data: Float32Array, start = 0, end = data.length): number {
  const clampedStart = clamp(start, 0, data.length);
  const clampedEnd = clamp(end, clampedStart, data.length);
  const length = clampedEnd - clampedStart;
  if (length <= 0) return 0;
  let sum = 0;
  for (let i = clampedStart; i < clampedEnd; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / length);
}

export function detectClippedSamples(data: Float32Array, threshold = 0.985): number {
  let count = 0;
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) >= threshold) count++;
  }
  return count;
}

export function applyGainInPlace(data: Float32Array, db: number): void {
  const gain = dbToGain(db);
  for (let i = 0; i < data.length; i++) {
    data[i] *= gain;
  }
}

export function normalizePeakInPlace(data: Float32Array, targetPeak = 0.95): number {
  const currentPeak = peak(data);
  if (currentPeak < 1e-6 || currentPeak <= targetPeak) return 0;
  const gain = targetPeak / currentPeak;
  for (let i = 0; i < data.length; i++) {
    data[i] *= gain;
  }
  return gainToDb(gain);
}

export function softClip(value: number): number {
  return Math.tanh(value);
}

export function resampleLinear(data: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || data.length === 0) return cloneChannelData(data);
  const ratio = toRate / fromRate;
  const outLength = Math.max(1, Math.round(data.length * ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const sourcePos = i / ratio;
    const index = Math.floor(sourcePos);
    const frac = sourcePos - index;
    const a = data[Math.min(index, data.length - 1)];
    const b = data[Math.min(index + 1, data.length - 1)];
    out[i] = a + (b - a) * frac;
  }
  return out;
}

export function createHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, size - 1)));
  }
  return window;
}

export interface StftFrame {
  real: Float32Array;
  imag: Float32Array;
}

export interface StftResult {
  frames: StftFrame[];
  fftSize: number;
  hopSize: number;
  window: Float32Array;
  originalLength: number;
}

export function stft(data: Float32Array, fftSize: number, hopSize: number): StftResult {
  const fft = new FFT(fftSize);
  const window = createHannWindow(fftSize);
  const frameCount = Math.max(1, Math.ceil((Math.max(data.length - fftSize, 0)) / hopSize) + 1);
  const frames: StftFrame[] = [];
  const complexIn = fft.createComplexArray();
  const complexOut = fft.createComplexArray();

  for (let frameIdx = 0; frameIdx < frameCount; frameIdx++) {
    const offset = frameIdx * hopSize;
    for (let i = 0; i < fftSize; i++) {
      complexIn[i * 2] = (data[offset + i] ?? 0) * window[i];
      complexIn[i * 2 + 1] = 0;
    }
    fft.transform(complexOut, complexIn);
    const bins = fftSize / 2 + 1;
    const real = new Float32Array(bins);
    const imag = new Float32Array(bins);
    for (let bin = 0; bin < bins; bin++) {
      real[bin] = complexOut[bin * 2];
      imag[bin] = complexOut[bin * 2 + 1];
    }
    frames.push({ real, imag });
  }

  return { frames, fftSize, hopSize, window, originalLength: data.length };
}

export function istft(result: StftResult): Float32Array {
  const { frames, fftSize, hopSize, window, originalLength } = result;
  const fft = new FFT(fftSize);
  const outputLength = Math.max(originalLength, (frames.length - 1) * hopSize + fftSize);
  const output = new Float32Array(outputLength);
  const norm = new Float32Array(outputLength);
  const complexSpectrum = fft.createComplexArray();
  const complexTime = fft.createComplexArray();

  for (let frameIdx = 0; frameIdx < frames.length; frameIdx++) {
    complexSpectrum.fill(0);
    const frame = frames[frameIdx];
    const bins = frame.real.length;
    for (let bin = 0; bin < bins; bin++) {
      complexSpectrum[bin * 2] = frame.real[bin];
      complexSpectrum[bin * 2 + 1] = frame.imag[bin];
    }
    fft.completeSpectrum(complexSpectrum);
    fft.inverseTransform(complexTime, complexSpectrum);

    const offset = frameIdx * hopSize;
    for (let i = 0; i < fftSize; i++) {
      const idx = offset + i;
      if (idx >= outputLength) break;
      const value = complexTime[i * 2] * window[i];
      output[idx] += value;
      norm[idx] += window[i] * window[i];
    }
  }

  for (let i = 0; i < output.length; i++) {
    if (norm[i] > 1e-6) output[i] /= norm[i];
  }

  return output.subarray(0, originalLength);
}

export function regionMask(length: number, regions: SpeechRegion[]): Uint8Array {
  const mask = new Uint8Array(length);
  for (const region of regions) {
    const start = clamp(Math.floor(region.startSample), 0, length);
    const end = clamp(Math.floor(region.endSample), start, length);
    mask.fill(1, start, end);
  }
  return mask;
}

export function applyGainCurve(data: Float32Array, gainCurve: Float32Array): Float32Array {
  const output = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    output[i] = data[i] * (gainCurve[i] ?? 1);
  }
  return output;
}

export function createFadeCurve(length: number, fadeSamples: number, floorGain: number): Float32Array {
  const curve = new Float32Array(length);
  curve.fill(1);
  if (fadeSamples <= 0) return curve;
  for (let i = 0; i < fadeSamples && i < length; i++) {
    const t = i / fadeSamples;
    curve[i] = floorGain + (1 - floorGain) * t;
    curve[length - 1 - i] = floorGain + (1 - floorGain) * t;
  }
  return curve;
}

export function mergeOverlappingRegions(regions: SpeechRegion[]): SpeechRegion[] {
  if (regions.length === 0) return [];
  const sorted = [...regions].sort((a, b) => a.startSample - b.startSample);
  const merged: SpeechRegion[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.startSample <= last.endSample) {
      last.endSample = Math.max(last.endSample, current.endSample);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}