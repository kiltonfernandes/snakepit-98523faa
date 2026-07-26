import { rms, resampleLinear } from '@/lib/audio/dsp';
import type { SpeechRegion } from '@/lib/audio/dsp';

/** Piso de ruído + SNR de fala. */
export interface NoiseResult {
  floorDbfs: number;
  speechSnrDb: number;
  broadbandDbfs: number;
}

const toDb = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));

export function measureNoise(data: Float32Array, sr: number, speech: SpeechRegion[]): NoiseResult {
  const analysis = sr === 16000 ? data : resampleLinear(data, sr, 16000);
  const asr = 16000;
  const frameSamples = Math.round(asr * 0.02);
  const frameCount = Math.floor(analysis.length / frameSamples);
  const speechMask = new Uint8Array(frameCount);
  for (const r of speech) {
    const s = Math.floor((r.startSample / sr) * asr / frameSamples);
    const e = Math.ceil((r.endSample / sr) * asr / frameSamples);
    for (let f = Math.max(0, s); f < Math.min(frameCount, e); f++) speechMask[f] = 1;
  }
  const noiseRms: number[] = [], speechRms: number[] = [];
  for (let f = 0; f < frameCount; f++) {
    const st = f * frameSamples;
    const r = rms(analysis, st, st + frameSamples);
    (speechMask[f] === 1 ? speechRms : noiseRms).push(r);
  }
  const median = (arr: number[]) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const noiseMed = median(noiseRms);
  const speechMed = median(speechRms);
  return {
    floorDbfs: toDb(noiseMed),
    speechSnrDb: toDb(speechMed) - toDb(noiseMed),
    broadbandDbfs: toDb(rms(analysis)),
  };
}