import { AudioParams, ProcessingProfile, TrackMetrics } from './types';
import {
  SpeechRegion, average, detectClippedSamples, gainToDb, mergeOverlappingRegions, percentile, peak, resampleLinear, rms,
} from './dsp';

export interface AnalysisResult {
  analysisSampleRate: number;
  speechRegions: SpeechRegion[];
  frameRms: number[];
  speechFrameMask: Uint8Array;
  noiseFloor: number;
  noiseScore: number;
  reverbScore: number;
  clippedSamples: number;
  speechRatio: number;
  metrics: TrackMetrics;
}

export function computeSpeechLoudnessDb(data: Float32Array, regions: SpeechRegion[]): number {
  if (regions.length === 0) return gainToDb(rms(data));
  let energy = 0; let length = 0;
  for (const region of regions) {
    const start = Math.max(0, Math.floor(region.startSample));
    const end = Math.min(data.length, Math.floor(region.endSample));
    for (let i = start; i < end; i++) { energy += data[i] * data[i]; length++; }
  }
  return gainToDb(Math.sqrt(energy / Math.max(length, 1))) - 0.691;
}

export function analyzeVoiceTrack(
  data48k: Float32Array, sampleRate: number, profile: ProcessingProfile, _audioParams: AudioParams
): AnalysisResult {
  const analysisSampleRate = 16000;
  const analysisData = resampleLinear(data48k, sampleRate, analysisSampleRate);
  const frameSamples = Math.max(1, Math.round(analysisSampleRate * (profile.analysis.vadFrameMs / 1000)));
  const frameCount = Math.max(1, Math.ceil(analysisData.length / frameSamples));
  const frameRms = new Array<number>(frameCount);

  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * frameSamples;
    const end = Math.min(analysisData.length, start + frameSamples);
    frameRms[frame] = rms(analysisData, start, end);
  }

  const noiseFloor = percentile(frameRms, 0.15);
  const peakRms = percentile(frameRms, 0.92);
  const speechThreshold = Math.max(noiseFloor * 2.3, (noiseFloor + peakRms) * 0.38);
  const speechMask = new Uint8Array(frameCount);
  for (let frame = 0; frame < frameCount; frame++) speechMask[frame] = frameRms[frame] >= speechThreshold ? 1 : 0;

  const hangoverFrames = Math.max(1, Math.round(profile.analysis.vadHangoverMs / profile.analysis.vadFrameMs));
  let active = 0;
  for (let frame = 0; frame < frameCount; frame++) {
    if (speechMask[frame] === 1) { active = hangoverFrames; continue; }
    if (active > 0) { speechMask[frame] = 1; active--; }
  }

  const regions: SpeechRegion[] = [];
  let regionStart = -1;
  for (let frame = 0; frame <= frameCount; frame++) {
    const voiced = frame < frameCount ? speechMask[frame] === 1 : false;
    if (voiced && regionStart < 0) regionStart = frame;
    else if (!voiced && regionStart >= 0) {
      const startSample = Math.floor((regionStart * frameSamples * sampleRate) / analysisSampleRate);
      const endSample = Math.floor((frame * frameSamples * sampleRate) / analysisSampleRate);
      if (((endSample - startSample) / sampleRate) * 1000 >= profile.analysis.minSpeechMs) regions.push({ startSample, endSample });
      regionStart = -1;
    }
  }

  const mergedRegions = mergeOverlappingRegions(regions);
  const speechSamples = mergedRegions.reduce((sum, region) => sum + (region.endSample - region.startSample), 0);
  const speechRatio = speechSamples / Math.max(1, data48k.length);
  const speechRmsDb = computeSpeechLoudnessDb(data48k, mergedRegions);
  const noiseRmsDb = gainToDb(Math.max(noiseFloor, 1e-6));
  const noiseScore = speechRmsDb - noiseRmsDb;
  const reverbScore = estimateReverbScore(analysisData, analysisSampleRate, speechMask, frameSamples);
  const clippedSamples = detectClippedSamples(data48k);
  const peakLinear = peak(data48k);

  const metrics: TrackMetrics = {
    durationSec: data48k.length / sampleRate, sampleRate, peakDbfs: gainToDb(Math.max(peakLinear, 1e-6)),
    clippedSamples, speechRatio, mutedRatio: 0, noiseScore, reverbScore,
    loudness: { rmsDb: gainToDb(Math.max(rms(data48k), 1e-6)), lufs: speechRmsDb, truePeakDbtp: gainToDb(Math.max(peakLinear, 1e-6)) },
  };

  return { analysisSampleRate, speechRegions: mergedRegions, frameRms, speechFrameMask: speechMask, noiseFloor, noiseScore, reverbScore, clippedSamples, speechRatio, metrics };
}

function estimateReverbScore(analysisData: Float32Array, analysisSampleRate: number, speechMask: Uint8Array, frameSamples: number): number {
  const onsetScores: number[] = [];
  const onsetPadding = Math.round(0.03 * analysisSampleRate);
  const latePadding = Math.round(0.14 * analysisSampleRate);

  for (let frame = 1; frame < speechMask.length; frame++) {
    if (speechMask[frame] === 1 && speechMask[frame - 1] === 0) {
      const start = frame * frameSamples;
      const directStart = Math.max(0, start + onsetPadding);
      const directEnd = Math.min(analysisData.length, directStart + Math.round(0.05 * analysisSampleRate));
      const lateStart = directEnd;
      const lateEnd = Math.min(analysisData.length, lateStart + latePadding);
      if (lateEnd - lateStart < 32 || directEnd - directStart < 32) continue;
      const directEnergy = Math.pow(rms(analysisData, directStart, directEnd), 2);
      const lateEnergy = Math.pow(rms(analysisData, lateStart, lateEnd), 2);
      if (directEnergy > 1e-9) onsetScores.push(lateEnergy / directEnergy);
    }
  }

  if (onsetScores.length === 0) {
    const fallback = average(frameRmsFromSamples(analysisData, frameSamples));
    return Math.min(1, fallback * 10);
  }
  return Math.min(1, average(onsetScores) * 4.5);
}

function frameRmsFromSamples(data: Float32Array, frameSamples: number): number[] {
  const frames: number[] = [];
  const total = Math.max(1, Math.ceil(data.length / frameSamples));
  for (let frame = 0; frame < total; frame++) {
    const start = frame * frameSamples;
    const end = Math.min(data.length, start + frameSamples);
    frames.push(rms(data, start, end));
  }
  return frames;
}