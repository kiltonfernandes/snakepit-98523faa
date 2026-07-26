import { measureLoudness } from './loudness';
import { measureSpectrum } from './spectrum';
import { runVad } from './vad';
import { measureNoise } from './noise';
import { measureAcoustics } from './acoustics';
import {
  detectClipping, detectClicksAndCrackle, detectBreathAndPlosive,
  detectSibilance, detectHum, detectLevelJumps, detectDropouts, resetEventCounter,
} from './events';
import { detectClippedSamples } from '@/lib/audio/dsp';
import type { AudioAnalysisReportV2 } from '../contracts/report-v2';

export interface AnalyzeInput {
  channelData: Float32Array;
  sampleRate: number;
  filename: string;
  channels: number;
}

export interface AnalyzeProgress { progress: number; stage: string; }

export type AnalyzeProgressCb = (p: AnalyzeProgress) => void;

/** Rota a análise completa e devolve o relatório V2 pronto para o planner. */
export function analyzeAudio(input: AnalyzeInput, onProgress?: AnalyzeProgressCb): AudioAnalysisReportV2 {
  resetEventCounter();
  const { channelData: data, sampleRate: sr, filename, channels } = input;
  const step = (p: number, stage: string) => onProgress?.({ progress: p, stage });

  step(0.05, 'loudness');
  const loudness = measureLoudness(data, sr);
  step(0.30, 'vad');
  const vad = runVad(data, sr);
  step(0.45, 'spectrum');
  // Wave C: LTAS gated by VAD para tonal decisions sem contaminação de silêncio.
  const spectrum = measureSpectrum(data, sr, vad.regions);
  step(0.60, 'noise');
  const noise = measureNoise(data, sr, vad.regions);
  step(0.72, 'acoustics');
  const acoustics = measureAcoustics(data, sr, vad.regions);

  step(0.80, 'events');
  const clipping = detectClipping(data, sr);
  const { clicks, crackle } = detectClicksAndCrackle(data, sr);
  const { breath, plosive } = detectBreathAndPlosive(data, sr, vad.regions);
  const sibilance = detectSibilance(data, sr, vad.regions);
  const hum = detectHum(spectrum.humBins.hum50HzDb, spectrum.humBins.hum60HzDb, noise.floorDbfs);
  const levelJump = detectLevelJumps(data, sr);
  const dropout = detectDropouts(data, sr, vad.regions);

  const clippedRatio = detectClippedSamples(data) / Math.max(1, data.length);

  const report: AudioAnalysisReportV2 = {
    version: 'v2',
    reportId: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAtIso: new Date().toISOString(),
    source: { filename, sampleRate: sr, durationSec: data.length / sr, channels },
    loudness,
    noise: {
      floorDbfs: noise.floorDbfs,
      speechSnrDb: noise.speechSnrDb,
      hum50HzDb: spectrum.humBins.hum50HzDb,
      hum60HzDb: spectrum.humBins.hum60HzDb,
      broadbandDbfs: noise.broadbandDbfs,
    },
    spectrum: {
      centroidHz: spectrum.centroidHz,
      rolloff85Hz: spectrum.rolloff85Hz,
      tiltDbPerOctave: spectrum.tiltDbPerOctave,
      ltasBandsDb: spectrum.ltasBandsDb,
    },
    acoustics,
    speech: {
      ratio: vad.speechRatio,
      averageSegmentSec: vad.averageSegmentSec,
      totalSegments: vad.totalSegments,
      energyPercentilesDbfs: vad.energyPercentilesDbfs,
    },
    events: [...clipping, ...clicks, ...crackle, ...breath, ...plosive, ...sibilance, ...hum, ...levelJump, ...dropout],
    clippedRatio,
  };
  step(1, 'done');
  return report;
}