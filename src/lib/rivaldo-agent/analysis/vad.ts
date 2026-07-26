import { percentile, rms, resampleLinear } from '@/lib/audio/dsp';
import type { SpeechRegion } from '@/lib/audio/dsp';

/** VAD simples, mesma família do analyzer atual mas expondo métricas úteis. */

export interface VadResult {
  regions: SpeechRegion[];
  frameRms: number[];
  noiseFloorLinear: number;
  speechRatio: number;
  totalSegments: number;
  averageSegmentSec: number;
  energyPercentilesDbfs: { p10: number; p50: number; p90: number };
}

export function runVad(data: Float32Array, sampleRate: number): VadResult {
  const targetSr = 16000;
  const analysis = resampleLinear(data, sampleRate, targetSr);
  const frameMs = 20, hangoverMs = 200, minSpeechMs = 120;
  const frameSamples = Math.round(targetSr * frameMs / 1000);
  const frameCount = Math.max(1, Math.ceil(analysis.length / frameSamples));
  const frameRmsArr: number[] = [];
  for (let f = 0; f < frameCount; f++) {
    const s = f * frameSamples;
    frameRmsArr.push(rms(analysis, s, Math.min(analysis.length, s + frameSamples)));
  }
  const noiseFloor = percentile(frameRmsArr, 0.15);
  const peakRms = percentile(frameRmsArr, 0.92);
  const threshold = Math.max(noiseFloor * 2.3, (noiseFloor + peakRms) * 0.38);

  const mask = new Uint8Array(frameCount);
  for (let f = 0; f < frameCount; f++) mask[f] = frameRmsArr[f] >= threshold ? 1 : 0;
  const hangoverFrames = Math.max(1, Math.round(hangoverMs / frameMs));
  let active = 0;
  for (let f = 0; f < frameCount; f++) {
    if (mask[f] === 1) { active = hangoverFrames; continue; }
    if (active > 0) { mask[f] = 1; active--; }
  }

  const regions: SpeechRegion[] = [];
  let start = -1;
  for (let f = 0; f <= frameCount; f++) {
    const voiced = f < frameCount ? mask[f] === 1 : false;
    if (voiced && start < 0) start = f;
    else if (!voiced && start >= 0) {
      const s = Math.floor((start * frameSamples * sampleRate) / targetSr);
      const e = Math.floor((f * frameSamples * sampleRate) / targetSr);
      if (((e - s) / sampleRate) * 1000 >= minSpeechMs) regions.push({ startSample: s, endSample: e });
      start = -1;
    }
  }

  const speechSamples = regions.reduce((a, r) => a + (r.endSample - r.startSample), 0);
  const speechRatio = speechSamples / Math.max(1, data.length);
  const avgSegSec = regions.length ? (speechSamples / sampleRate) / regions.length : 0;

  // Percentis de energia da fala em dBFS
  const speechRmsValues: number[] = [];
  for (const r of regions) {
    const chunk = data.subarray(r.startSample, r.endSample);
    if (chunk.length > 0) speechRmsValues.push(rms(chunk));
  }
  const toDb = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));
  const perc: number[] = [...speechRmsValues].sort((a, b) => a - b);
  const pAt = (q: number) => perc.length ? toDb(perc[Math.min(perc.length - 1, Math.floor(perc.length * q))]) : -100;

  return {
    regions,
    frameRms: frameRmsArr,
    noiseFloorLinear: noiseFloor,
    speechRatio,
    totalSegments: regions.length,
    averageSegmentSec: avgSegSec,
    energyPercentilesDbfs: { p10: pAt(0.1), p50: pAt(0.5), p90: pAt(0.9) },
  };
}