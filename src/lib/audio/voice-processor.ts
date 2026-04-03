import { analyzeVoiceTrack } from './analysis';
import {
  AudioParams,
  ProcessingProfile,
  TrackEvents,
  TrackMetrics,
  TrackReport,
  VoiceTrackProcessRequest,
  VoiceTrackProcessResult,
} from './types';
import {
  SpeechRegion,
  applyGainCurve,
  average,
  clamp,
  cloneChannelData,
  dbToGain,
  gainToDb,
  normalizePeakInPlace,
  peak,
  resampleLinear,
  rms,
  stft,
  istft,
} from './dsp';

type RnnoiseModule = {
  ready: Promise<unknown>;
  _rnnoise_init?: () => void;
  _rnnoise_create: () => number;
  _rnnoise_destroy: (state: number) => void;
  _rnnoise_process_frame: (state: number, outPtr: number, inPtr: number) => void;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPF32: Float32Array;
};

let rnnoiseModulePromise: Promise<RnnoiseModule> | null = null;

const SPEECH_PRESERVE_PRE_PAD_SEC = 0.035;
const SPEECH_PRESERVE_POST_PAD_SEC = 0.08;
const SPEECH_GAP_CROSSFADE_MS = 18;

async function getRnnoiseModule(): Promise<RnnoiseModule> {
  if (!rnnoiseModulePromise) {
    rnnoiseModulePromise = (async () => {
      const [{ default: createRNNWasmModule }, { default: wasmUrl }] = await Promise.all([
        import('@jitsi/rnnoise-wasm/dist/rnnoise.js'),
        import('@jitsi/rnnoise-wasm/dist/rnnoise.wasm?url'),
      ]);
      const module = createRNNWasmModule({
        locateFile: () => wasmUrl,
      }) as RnnoiseModule;
      await module.ready;
      module._rnnoise_init?.();
      return module;
    })();
  }
  return rnnoiseModulePromise;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export async function processVoiceTrack(
  request: VoiceTrackProcessRequest,
  onProgress?: (progress: number, label: string) => void
): Promise<VoiceTrackProcessResult> {
  const timings: TrackReport['timings'] = [];
  const events: TrackEvents = {
    clippedSegments: 0,
    declickEvents: 0,
    decrackleEvents: 0,
    breathsReduced: 0,
    deEssEvents: 0,
    dePlosiveEvents: 0,
  };

  const stage = async <T>(label: string, fn: () => Promise<T> | T): Promise<T> => {
    const start = now();
    const result = await fn();
    timings.push({ stage: label, durationMs: now() - start });
    return result;
  };

  const original = cloneChannelData(request.channelData);
  const beforeAnalysis = analyzeVoiceTrack(original, request.sampleRate, request.profile, request.audioParams);
  const metricsBefore = beforeAnalysis.metrics;
  let speechSafe = cloneChannelData(original);

  onProgress?.(0.08, 'Analisando trilha...');

  speechSafe = await stage('declip', () => {
    if (!request.profile.repair.declip || beforeAnalysis.clippedSamples === 0) {
      return speechSafe;
    }
    const repaired = applyDeclipping(speechSafe);
    events.clippedSegments = Math.max(1, Math.round(beforeAnalysis.clippedSamples / 80));
    return repaired;
  });

  onProgress?.(0.16, 'Reparando cliques...');
  speechSafe = await stage('declick', () => {
    const repaired = cloneChannelData(speechSafe);
    events.declickEvents = applyEventDeclick(repaired, request.profile.repair.declickAmount);
    return repaired;
  });

  onProgress?.(0.24, 'Suavizando crackle...');
  speechSafe = await stage('decrackle', () => {
    const repaired = cloneChannelData(speechSafe);
    events.decrackleEvents = applyEventDecrackle(repaired, request.profile.repair.decrackleAmount);
    return repaired;
  });

  const repairedAnalysis = analyzeVoiceTrack(speechSafe, request.sampleRate, request.profile, request.audioParams);
  const protectedSpeechRegions = buildProtectedSpeechRegions(repairedAnalysis.speechRegions, request.sampleRate);
  const gapRegions = invertRegions(speechSafe.length, protectedSpeechRegions);
  let gapProcessed = cloneChannelData(speechSafe);

  onProgress?.(0.34, 'Aplicando RNNoise...');
  gapProcessed = await stage('denoise', async () => {
    if (request.profile.cleanup.denoiseAmount <= 0 || gapRegions.length === 0) {
      return gapProcessed;
    }
    return applyRnnoiseDenoise(
      gapProcessed,
      request.sampleRate,
      request.profile.cleanup.denoiseAmount / 100,
      gapRegions
    );
  });

  onProgress?.(0.48, 'Aplicando WPE Dereverb...');
  gapProcessed = await stage('dereverb', async () => {
    return gapProcessed;
  });

  const dereverbDecision =
    request.profile.dereverb.mode === 'off'
      ? { applied: false, mode: request.profile.dereverb.mode as TrackReport['dereverbMode'], reason: undefined }
      : {
          applied: false,
          mode: request.profile.dereverb.mode as TrackReport['dereverbMode'],
          reason: 'preserve-speech-default',
        };

  onProgress?.(0.58, 'Controlando respirações...');
  gapProcessed = await stage('de-breath', () => {
    const result = applyAdaptiveBreathReduction(
      gapProcessed,
      request.sampleRate,
      protectedSpeechRegions,
      request.profile.cleanup.breathReductionAmount
    );
    events.breathsReduced = result.events;
    return result.data;
  });

  onProgress?.(0.66, 'Tratando sibilância...');
  gapProcessed = await stage('de-esser', () => {
    const result = applyDeEsser(gapProcessed, request.sampleRate, request.profile.tone.deEsserAmount);
    events.deEssEvents = result.events;
    return result.data;
  });

  onProgress?.(0.72, 'Tratando plosivas...');
  gapProcessed = await stage('de-plosive', () => {
    const result = applyDePlosive(gapProcessed, request.sampleRate, request.profile.tone.dePlosiveAmount);
    events.dePlosiveEvents = result.events;
    return result.data;
  });

  onProgress?.(0.78, 'Aplicando EQ...');
  gapProcessed = await stage('eq', () =>
    applyEqPreset(gapProcessed, request.sampleRate, request.profile.tone.eqPreset, request.profile.tone.eqAmount)
  );

  onProgress?.(0.84, 'Aplicando dinâmica...');
  gapProcessed = await stage('dynamics', () => {
    const compressed = applyCompressor(gapProcessed, request.sampleRate, request.profile.dynamics.compressorAmount);
    return applyLimiter(compressed, request.profile.dynamics.limiterCeilingDbtp);
  });

  onProgress?.(0.88, 'Preservando fala e limpando gaps...');
  let current = await stage('preserve-speech', () =>
    preserveSpeechSections(speechSafe, gapProcessed, protectedSpeechRegions, request.sampleRate)
  );

  onProgress?.(0.9, 'Alinhando loudness...');
  current = await stage('loudness', () =>
    alignTrackLoudness(current, request.sampleRate, repairedAnalysis.speechRegions, request.audioParams.trackTargetLufs)
  );

  onProgress?.(0.96, 'Aplicando smart mute...');
  current = await stage('smart-mute', () => {
    if (!request.smartMuteEnabled || !request.profile.cleanup.smartMute) {
      return current;
    }
    return applySmartMute(
      current,
      request.sampleRate,
      protectedSpeechRegions,
      request.profile.analysis.muteFadeMs,
      request.profile.cleanup.smartMuteFloorDb
    );
  });

  normalizePeakInPlace(current, dbToGain(request.audioParams.truePeakCeilingDbtp));
  const afterAnalysis = analyzeVoiceTrack(current, request.sampleRate, request.profile, request.audioParams);
  afterAnalysis.metrics.mutedRatio = computeMutedRatio(current, protectedSpeechRegions, request.profile.cleanup.smartMuteFloorDb);

  const report: TrackReport = {
    trackName: request.name,
    dereverbApplied: dereverbDecision.applied,
    dereverbMode: dereverbDecision.mode,
    dereverbFallbackReason: dereverbDecision.reason,
    reverbScoreBefore: metricsBefore.reverbScore,
    reverbScoreAfter: afterAnalysis.metrics.reverbScore,
    metricsBefore,
    metricsAfter: afterAnalysis.metrics,
    events,
    timings,
  };

  onProgress?.(1, 'Trilha pronta');

  return {
    id: request.id,
    sampleRate: request.sampleRate,
    channelData: current,
    report,
  };
}

function computeMutedRatio(data: Float32Array, speechRegions: SpeechRegion[], floorDb: number): number {
  const floorGain = dbToGain(floorDb);
  let muted = 0;
  const regionMask = new Uint8Array(data.length);
  for (const region of speechRegions) {
    regionMask.fill(1, region.startSample, Math.min(data.length, region.endSample));
  }
  for (let i = 0; i < data.length; i++) {
    if (regionMask[i] === 0 && Math.abs(data[i]) <= floorGain * 0.05) {
      muted++;
    }
  }
  return muted / Math.max(1, data.length);
}

function applyDeclipping(data: Float32Array): Float32Array {
  const out = cloneChannelData(data);
  const threshold = 0.985;
  for (let i = 1; i < out.length - 1; i++) {
    if (Math.abs(out[i]) >= threshold) {
      out[i] = (out[i - 1] + out[i + 1]) * 0.5;
    }
  }
  return out;
}

function applyEventDeclick(data: Float32Array, amount: number): number {
  const windowSize = 96;
  const threshold = 2.4 - amount / 200;
  let events = 0;
  for (let i = windowSize; i < data.length - windowSize; i++) {
    let sum = 0;
    let sumSq = 0;
    for (let j = i - windowSize; j < i + windowSize; j++) {
      const sample = data[j];
      sum += sample;
      sumSq += sample * sample;
    }
    const count = windowSize * 2;
    const mean = sum / count;
    const variance = Math.max(sumSq / count - mean * mean, 1e-10);
    const std = Math.sqrt(variance);
    if (Math.abs(data[i] - mean) > threshold * std) {
      data[i] = cubicInterpolate(data, i);
      events++;
    }
  }
  return events;
}

function applyEventDecrackle(data: Float32Array, amount: number): number {
  const windowSize = 24;
  const threshold = 2.2 - amount / 250;
  let events = 0;
  const derivative = new Float32Array(data.length);
  for (let i = 1; i < data.length; i++) {
    derivative[i] = data[i] - data[i - 1];
  }
  for (let i = windowSize; i < derivative.length - windowSize; i++) {
    let sum = 0;
    let sumSq = 0;
    for (let j = i - windowSize; j < i + windowSize; j++) {
      const sample = derivative[j];
      sum += Math.abs(sample);
      sumSq += sample * sample;
    }
    const count = windowSize * 2;
    const mean = sum / count;
    const variance = Math.max(sumSq / count - mean * mean, 1e-10);
    const std = Math.sqrt(variance);
    if (Math.abs(derivative[i]) > mean + threshold * std) {
      data[i] = median9(data, i);
      events++;
    }
  }
  return events;
}

function cubicInterpolate(data: Float32Array, i: number): number {
  const p0 = data[Math.max(0, i - 2)];
  const p1 = data[Math.max(0, i - 1)];
  const p2 = data[Math.min(data.length - 1, i + 1)];
  const p3 = data[Math.min(data.length - 1, i + 2)];
  const t = 0.5;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
  );
}

function median9(data: Float32Array, index: number): number {
  const values: number[] = [];
  for (let i = -4; i <= 4; i++) {
    const idx = clamp(index + i, 0, data.length - 1);
    values.push(data[idx]);
  }
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

function createSquaredPrefixSums(data: Float32Array): Float64Array {
  const prefix = new Float64Array(data.length + 1);
  for (let i = 0; i < data.length; i++) {
    prefix[i + 1] = prefix[i] + data[i] * data[i];
  }
  return prefix;
}

function rmsFromPrefix(prefix: Float64Array, start: number, end: number): number {
  const safeStart = clamp(Math.floor(start), 0, prefix.length - 1);
  const safeEnd = clamp(Math.floor(end), safeStart, prefix.length - 1);
  const length = safeEnd - safeStart;
  if (length <= 0) return 0;
  return Math.sqrt((prefix[safeEnd] - prefix[safeStart]) / length);
}

async function applyRnnoiseDenoise(
  data: Float32Array,
  sampleRate: number,
  mix: number,
  focusRegions: SpeechRegion[] = []
): Promise<Float32Array> {
  const module = await getRnnoiseModule();
  const state = module._rnnoise_create();
  const frameSize = 480;
  const workingRate = 48000;
  const targetRegions = focusRegions.length > 0
    ? focusRegions
    : [{ startSample: 0, endSample: data.length }];
  const output = cloneChannelData(data);
  const inPtr = module._malloc(frameSize * 4);
  const outPtr = module._malloc(frameSize * 4);
  const inputView = module.HEAPF32.subarray(inPtr / 4, inPtr / 4 + frameSize);
  const outputView = module.HEAPF32.subarray(outPtr / 4, outPtr / 4 + frameSize);

  try {
    for (const region of targetRegions) {
      const start = clamp(region.startSample, 0, data.length);
      const end = clamp(region.endSample, start, data.length);
      if (end - start < Math.round(sampleRate * 0.08)) continue;

      const source = data.subarray(start, end);
      const resampled = resampleLinear(source, sampleRate, workingRate);
      const processed = new Float32Array(resampled.length);

      for (let offset = 0; offset < resampled.length; offset += frameSize) {
        inputView.fill(0);
        const frameEnd = Math.min(resampled.length, offset + frameSize);
        inputView.set(resampled.subarray(offset, frameEnd), 0);
        module._rnnoise_process_frame(state, outPtr, inPtr);
        for (let i = 0; i < frameEnd - offset; i++) {
          processed[offset + i] = resampled[offset + i] * (1 - mix) + outputView[i] * mix;
        }
      }

      const restored = resampleLinear(processed, workingRate, sampleRate);
      output.set(restored.subarray(0, end - start), start);
    }
  } finally {
    module._free(inPtr);
    module._free(outPtr);
    module._rnnoise_destroy(state);
  }

  return output;
}

async function applyDereverbIfNeeded(
  data: Float32Array,
  sampleRate: number,
  profile: ProcessingProfile,
  analysis: ReturnType<typeof analyzeVoiceTrack>
): Promise<{ data: Float32Array }> {
  const mode = profile.dereverb.mode;
  if (mode === 'off') {
    return { data };
  }
  const speechSeconds = analysis.speechRegions.reduce((sum, region) => sum + (region.endSample - region.startSample), 0) / sampleRate;
  const isShort = data.length / sampleRate < 3 || speechSeconds < profile.analysis.minSpeechSecondsForDereverb;
  const shouldApply = mode === 'strong' || (mode === 'auto' && analysis.reverbScore >= profile.analysis.reverbAutoThreshold);
  if (isShort || !shouldApply) {
    return { data };
  }

  const candidateRegions = expandSpeechRegions(analysis.speechRegions, sampleRate, 0.45, 0.65);
  const eligibleRegions = candidateRegions.filter((region) => ((region.endSample - region.startSample) / sampleRate) >= 1.4);
  if (eligibleRegions.length === 0) {
    return { data };
  }

  const beforeVoiceEnergy = speechEnergy(data, analysis.speechRegions);
  const dereverbed = cloneChannelData(data);
  for (const region of eligibleRegions) {
    const start = clamp(region.startSample, 0, data.length);
    const end = clamp(region.endSample, start, data.length);
    const processed = await applyChunkedWpe(data.subarray(start, end), sampleRate, profile.dereverb);
    dereverbed.set(processed.subarray(0, end - start), start);
  }
  const afterVoiceEnergy = speechEnergy(dereverbed, analysis.speechRegions);
  if (beforeVoiceEnergy > 1e-7 && afterVoiceEnergy / beforeVoiceEnergy < 0.55 && mode !== 'strong') {
    return { data };
  }

  return { data: dereverbed };
}

function expandSpeechRegions(
  regions: SpeechRegion[],
  sampleRate: number,
  preSeconds: number,
  postSeconds: number
): SpeechRegion[] {
  if (regions.length === 0) return [];
  const expanded = regions.map((region) => ({
    startSample: Math.max(0, region.startSample - Math.round(sampleRate * preSeconds)),
    endSample: region.endSample + Math.round(sampleRate * postSeconds),
  }));
  const merged: SpeechRegion[] = [expanded[0]];
  for (let i = 1; i < expanded.length; i++) {
    const current = expanded[i];
    const last = merged[merged.length - 1];
    if (current.startSample <= last.endSample) {
      last.endSample = Math.max(last.endSample, current.endSample);
    } else {
      merged.push(current);
    }
  }
  return merged;
}

export function buildProtectedSpeechRegions(
  speechRegions: SpeechRegion[],
  sampleRate: number,
  preSeconds = SPEECH_PRESERVE_PRE_PAD_SEC,
  postSeconds = SPEECH_PRESERVE_POST_PAD_SEC
): SpeechRegion[] {
  return expandSpeechRegions(speechRegions, sampleRate, preSeconds, postSeconds);
}

export function invertRegions(length: number, protectedRegions: SpeechRegion[]): SpeechRegion[] {
  if (length <= 0) return [];

  const gaps: SpeechRegion[] = [];
  let cursor = 0;

  for (const region of protectedRegions) {
    const startSample = clamp(region.startSample, 0, length);
    const endSample = clamp(region.endSample, startSample, length);

    if (startSample > cursor) {
      gaps.push({ startSample: cursor, endSample: startSample });
    }

    cursor = Math.max(cursor, endSample);
  }

  if (cursor < length) {
    gaps.push({ startSample: cursor, endSample: length });
  }

  return gaps.filter((region) => region.endSample > region.startSample);
}

export function buildSpeechPreserveMixCurve(
  length: number,
  protectedRegions: SpeechRegion[],
  crossfadeSamples: number
): Float32Array {
  const curve = new Float32Array(length);

  for (const region of protectedRegions) {
    const startSample = clamp(region.startSample, 0, length);
    const endSample = clamp(region.endSample, startSample, length);
    const fadeInStart = Math.max(0, startSample - crossfadeSamples);
    const fadeOutEnd = Math.min(length, endSample + crossfadeSamples);

    for (let i = fadeInStart; i < startSample; i++) {
      curve[i] = Math.max(curve[i], (i - fadeInStart) / Math.max(1, startSample - fadeInStart));
    }

    curve.fill(1, startSample, endSample);

    for (let i = endSample; i < fadeOutEnd; i++) {
      curve[i] = Math.max(curve[i], 1 - (i - endSample) / Math.max(1, fadeOutEnd - endSample));
    }
  }

  return curve;
}

export function preserveSpeechSections(
  speechSafe: Float32Array,
  gapProcessed: Float32Array,
  protectedRegions: SpeechRegion[],
  sampleRate: number,
  crossfadeMs = SPEECH_GAP_CROSSFADE_MS
): Float32Array {
  const output = new Float32Array(speechSafe.length);
  const curve = buildSpeechPreserveMixCurve(
    speechSafe.length,
    protectedRegions,
    Math.max(1, Math.round(sampleRate * (crossfadeMs / 1000)))
  );

  for (let i = 0; i < output.length; i++) {
    const preserve = curve[i] ?? 0;
    output[i] = speechSafe[i] * preserve + gapProcessed[i] * (1 - preserve);
  }

  return output;
}

export function getDereverbDecision(
  before: ReturnType<typeof analyzeVoiceTrack>,
  after: ReturnType<typeof analyzeVoiceTrack>,
  profile: ProcessingProfile
): { applied: boolean; mode: TrackReport['dereverbMode']; reason?: string } {
  const mode = profile.dereverb.mode;
  if (mode === 'off') {
    return { applied: false, mode };
  }
  if (after.metrics.reverbScore < before.metrics.reverbScore - 0.03) {
    return { applied: true, mode };
  }
  if (mode === 'auto' && before.metrics.reverbScore < profile.analysis.reverbAutoThreshold) {
    return { applied: false, mode, reason: 'reverb-score-baixo' };
  }
  return { applied: false, mode, reason: 'fallback-seguranca' };
}

function speechEnergy(data: Float32Array, regions: SpeechRegion[]): number {
  if (regions.length === 0) return Math.pow(rms(data), 2);
  let energy = 0;
  let count = 0;
  for (const region of regions) {
    for (let i = region.startSample; i < Math.min(data.length, region.endSample); i++) {
      energy += data[i] * data[i];
      count++;
    }
  }
  return energy / Math.max(count, 1);
}

async function applyChunkedWpe(
  data: Float32Array,
  sampleRate: number,
  config: ProcessingProfile['dereverb']
): Promise<Float32Array> {
  const chunkSamples = Math.max(config.fftSize * 4, Math.round(config.chunkSeconds * sampleRate));
  const overlapSamples = Math.min(chunkSamples / 2, Math.round(config.overlapSeconds * sampleRate));
  const step = chunkSamples - overlapSamples;
  const output = new Float32Array(data.length);
  const weights = new Float32Array(data.length);

  for (let start = 0; start < data.length; start += step) {
    const end = Math.min(data.length, start + chunkSamples);
    const chunk = data.subarray(start, end);
    const processed = applySingleChannelWpe(chunk, config.fftSize, config.hopSize, config.predictionDelayFrames, config.taps, config.iterations);
    for (let i = 0; i < processed.length; i++) {
      const globalIndex = start + i;
      if (globalIndex >= data.length) break;
      const fadeIn = overlapSamples > 0 ? clamp(i / overlapSamples, 0, 1) : 1;
      const fadeOut = overlapSamples > 0 ? clamp((processed.length - i) / overlapSamples, 0, 1) : 1;
      const weight = start === 0 ? fadeOut : end >= data.length ? fadeIn : Math.min(fadeIn, fadeOut);
      output[globalIndex] += processed[i] * weight;
      weights[globalIndex] += weight;
    }
  }

  for (let i = 0; i < output.length; i++) {
    if (weights[i] > 1e-6) {
      output[i] /= weights[i];
    } else {
      output[i] = data[i];
    }
  }

  return output;
}

export function applySingleChannelWpe(
  data: Float32Array,
  fftSize: number,
  hopSize: number,
  delayFrames: number,
  taps: number,
  iterations: number
): Float32Array {
  const transformed = stft(data, fftSize, hopSize);
  const frames = transformed.frames.length;
  const bins = transformed.frames[0]?.real.length ?? 0;
  const startFrame = delayFrames + taps;
  if (frames <= startFrame + 1 || bins === 0) {
    return cloneChannelData(data);
  }

  for (let bin = 0; bin < bins; bin++) {
    const yRe = new Float64Array(frames);
    const yIm = new Float64Array(frames);
    const xRe = new Float64Array(frames);
    const xIm = new Float64Array(frames);

    for (let frame = 0; frame < frames; frame++) {
      const re = transformed.frames[frame].real[bin];
      const im = transformed.frames[frame].imag[bin];
      yRe[frame] = re;
      yIm[frame] = im;
      xRe[frame] = re;
      xIm[frame] = im;
    }

    for (let iter = 0; iter < iterations; iter++) {
      const rRe = new Float64Array(taps * taps);
      const rIm = new Float64Array(taps * taps);
      const pRe = new Float64Array(taps);
      const pIm = new Float64Array(taps);

      for (let frame = startFrame; frame < frames; frame++) {
        const lambda = Math.max(xRe[frame] * xRe[frame] + xIm[frame] * xIm[frame], 1e-6);
        const weight = 1 / lambda;
        for (let m = 0; m < taps; m++) {
          const idxM = frame - delayFrames - m - 1;
          const ymRe = yRe[idxM];
          const ymIm = yIm[idxM];
          const cross = complexMulConj(ymRe, ymIm, yRe[frame], yIm[frame]);
          pRe[m] += cross.re * weight;
          pIm[m] += cross.im * weight;
          for (let n = 0; n < taps; n++) {
            const idxN = frame - delayFrames - n - 1;
            const ynRe = yRe[idxN];
            const ynIm = yIm[idxN];
            const auto = complexMulConj(ymRe, ymIm, ynRe, ynIm);
            const index = m * taps + n;
            rRe[index] += auto.re * weight;
            rIm[index] += auto.im * weight;
          }
        }
      }

      for (let i = 0; i < taps; i++) {
        rRe[i * taps + i] += 1e-6;
      }

      const g = solveComplexSystem(rRe, rIm, pRe, pIm, taps);
      for (let frame = startFrame; frame < frames; frame++) {
        let predRe = 0;
        let predIm = 0;
        for (let tap = 0; tap < taps; tap++) {
          const idx = frame - delayFrames - tap - 1;
          const coeffRe = g.re[tap];
          const coeffIm = g.im[tap];
          const sourceRe = yRe[idx];
          const sourceIm = yIm[idx];
          const contrib = complexMulConj(coeffRe, coeffIm, sourceRe, sourceIm);
          predRe += contrib.re;
          predIm += contrib.im;
        }
        xRe[frame] = yRe[frame] - predRe;
        xIm[frame] = yIm[frame] - predIm;
      }
    }

    for (let frame = 0; frame < frames; frame++) {
      transformed.frames[frame].real[bin] = xRe[frame];
      transformed.frames[frame].imag[bin] = xIm[frame];
    }
  }

  return istft(transformed);
}

function complexMulConj(aRe: number, aIm: number, bRe: number, bIm: number): { re: number; im: number } {
  return {
    re: aRe * bRe + aIm * bIm,
    im: aIm * bRe - aRe * bIm,
  };
}

function solveComplexSystem(
  matrixRe: Float64Array,
  matrixIm: Float64Array,
  vectorRe: Float64Array,
  vectorIm: Float64Array,
  size: number
): { re: Float64Array; im: Float64Array } {
  const realSize = size * 2;
  const mat = Array.from({ length: realSize }, () => new Float64Array(realSize + 1));

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const idx = row * size + col;
      mat[row][col] = matrixRe[idx];
      mat[row][col + size] = -matrixIm[idx];
      mat[row + size][col] = matrixIm[idx];
      mat[row + size][col + size] = matrixRe[idx];
    }
    mat[row][realSize] = vectorRe[row];
    mat[row + size][realSize] = vectorIm[row];
  }

  for (let col = 0; col < realSize; col++) {
    let pivot = col;
    for (let row = col + 1; row < realSize; row++) {
      if (Math.abs(mat[row][col]) > Math.abs(mat[pivot][col])) {
        pivot = row;
      }
    }
    if (pivot !== col) {
      const tmp = mat[col];
      mat[col] = mat[pivot];
      mat[pivot] = tmp;
    }
    const pivotValue = mat[col][col] || 1e-9;
    for (let i = col; i <= realSize; i++) {
      mat[col][i] /= pivotValue;
    }
    for (let row = 0; row < realSize; row++) {
      if (row === col) continue;
      const factor = mat[row][col];
      if (Math.abs(factor) < 1e-9) continue;
      for (let i = col; i <= realSize; i++) {
        mat[row][i] -= factor * mat[col][i];
      }
    }
  }

  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    re[i] = mat[i][realSize];
    im[i] = mat[i + size][realSize];
  }
  return { re, im };
}

function applyAdaptiveBreathReduction(
  data: Float32Array,
  sampleRate: number,
  speechRegions: SpeechRegion[],
  amount: number
): { data: Float32Array; events: number } {
  if (amount <= 0 || speechRegions.length < 2) {
    return { data, events: 0 };
  }
  const output = cloneChannelData(data);
  const floorGain = 1 - amount / 140;
  const fadeSamples = Math.round(sampleRate * 0.02);
  let events = 0;

  for (let i = 0; i < speechRegions.length - 1; i++) {
    const gapStart = speechRegions[i].endSample;
    const gapEnd = speechRegions[i + 1].startSample;
    const gapLength = gapEnd - gapStart;
    const gapDuration = gapLength / sampleRate;
    if (gapDuration < 0.14 || gapDuration > 1.1) continue;
    const gapRms = rms(output, gapStart, gapEnd);
    const beforeRms = rms(output, Math.max(0, gapStart - Math.round(sampleRate * 0.12)), gapStart);
    if (gapRms > beforeRms * 0.25 && gapRms < beforeRms * 0.85) {
      for (let s = gapStart; s < gapEnd; s++) {
        const rel = s - gapStart;
        let gain = floorGain;
        if (rel < fadeSamples) {
          gain = 1 - (1 - floorGain) * (rel / fadeSamples);
        } else if (gapEnd - s < fadeSamples) {
          gain = 1 - (1 - floorGain) * ((gapEnd - s) / fadeSamples);
        }
        output[s] *= gain;
      }
      events++;
    }
  }

  return { data: output, events };
}

function applyDeEsser(data: Float32Array, sampleRate: number, amount: number): { data: Float32Array; events: number } {
  if (amount <= 0) return { data, events: 0 };
  const output = cloneChannelData(data);
  const hp = designHighpass(4500, sampleRate, 0.707);
  const lp = designLowpass(9000, sampleRate, 0.707);
  const band = applyBiquad(applyBiquad(output, hp), lp);
  const threshold = rms(band) * (2.2 - amount / 140);
  let events = 0;
  for (let i = 0; i < output.length; i++) {
    const bandSample = Math.abs(band[i]);
    if (bandSample > threshold) {
      const reduction = clamp((bandSample - threshold) / (threshold + 1e-6), 0, 1) * (amount / 180);
      output[i] *= 1 - reduction;
      if (i % Math.max(1, Math.round(sampleRate * 0.03)) === 0) {
        events++;
      }
    }
  }
  return { data: output, events };
}

export function applyDePlosive(data: Float32Array, sampleRate: number, amount: number): { data: Float32Array; events: number } {
  if (amount <= 0) return { data, events: 0 };
  const output = cloneChannelData(data);
  const lowBand = applyBiquad(output, designLowpass(180, sampleRate, 0.707));
  const window = Math.max(32, Math.round(sampleRate * 0.01));
  const lowBandEnergy = createSquaredPrefixSums(lowBand);
  const outputEnergy = createSquaredPrefixSums(output);
  const globalRmsGate = rms(output) * 2.2;
  let events = 0;
  for (let i = window; i < output.length - window; i++) {
    const lowEnergy = rmsFromPrefix(lowBandEnergy, i - window, i + window);
    const fullEnergy = rmsFromPrefix(outputEnergy, i - window, i + window);
    if (lowEnergy > fullEnergy * 0.95 && Math.abs(output[i]) > globalRmsGate) {
      const attenuation = 1 - amount / 240;
      for (let j = 0; j < window; j++) {
        const idx = i + j;
        if (idx < output.length) {
          output[idx] *= attenuation;
        }
      }
      events++;
      i += window;
    }
  }
  return { data: output, events };
}

function applyEqPreset(data: Float32Array, sampleRate: number, preset: ProcessingProfile['tone']['eqPreset'], amount: number): Float32Array {
  const intensity = amount / 100;
  let output = cloneChannelData(data);
  output = applyBiquad(output, designHighpass(80, sampleRate, 0.707));

  if (preset === 'podcast') {
    output = applyBiquad(output, designPeaking(3000, sampleRate, 1.0, 3 * intensity));
    output = applyBiquad(output, designLowShelf(180, sampleRate, 0.707, 1.6 * intensity));
    output = applyBiquad(output, designHighShelf(9000, sampleRate, 0.707, -1.2 * intensity));
  } else if (preset === 'bright') {
    output = applyBiquad(output, designPeaking(3600, sampleRate, 0.9, 2.5 * intensity));
    output = applyBiquad(output, designHighShelf(8500, sampleRate, 0.707, 2 * intensity));
    output = applyBiquad(output, designPeaking(260, sampleRate, 1.1, -1.2 * intensity));
  } else {
    output = applyBiquad(output, designPeaking(2800, sampleRate, 1.0, 1.5 * intensity));
    output = applyBiquad(output, designLowShelf(150, sampleRate, 0.707, 0.8 * intensity));
  }

  return output;
}

function applyCompressor(data: Float32Array, sampleRate: number, amount: number): Float32Array {
  if (amount <= 0) return data;
  const output = new Float32Array(data.length);
  const threshold = dbToGain(-18 + (1 - amount / 100) * 4);
  const ratio = 1.6 + amount / 55;
  const attackCoeff = Math.exp(-1 / (sampleRate * 0.003));
  const releaseCoeff = Math.exp(-1 / (sampleRate * 0.08));
  let envelope = 0;
  let gain = 1;

  for (let i = 0; i < data.length; i++) {
    const input = Math.abs(data[i]);
    if (input > envelope) {
      envelope = attackCoeff * envelope + (1 - attackCoeff) * input;
    } else {
      envelope = releaseCoeff * envelope + (1 - releaseCoeff) * input;
    }
    if (envelope > threshold) {
      const over = envelope / threshold;
      const compressed = Math.pow(over, 1 / ratio);
      gain = clamp(compressed > 0 ? threshold * compressed / envelope : 1, 0.35, 1);
    } else {
      gain = 1;
    }
    output[i] = data[i] * gain;
  }

  return output;
}

function applyLimiter(data: Float32Array, ceilingDbtp: number): Float32Array {
  const output = cloneChannelData(data);
  const ceiling = dbToGain(ceilingDbtp);
  for (let i = 0; i < output.length; i++) {
    output[i] = clamp(output[i], -ceiling, ceiling);
  }
  return output;
}

export function alignTrackLoudness(
  data: Float32Array,
  sampleRate: number,
  speechRegions: SpeechRegion[],
  targetLufs: number
): Float32Array {
  const output = cloneChannelData(data);
  const currentLufs = speechRegions.length > 0 ? computeSpeechLufsApprox(data, speechRegions) : gainToDb(Math.max(rms(data), 1e-6));
  const delta = targetLufs - currentLufs;
  const gain = dbToGain(delta);
  for (let i = 0; i < output.length; i++) {
    output[i] *= gain;
  }
  const ceiling = dbToGain(-1.5);
  for (let i = 0; i < output.length; i++) {
    output[i] = clamp(output[i], -ceiling, ceiling);
  }
  return output;
}

export function computeSpeechLufsApprox(data: Float32Array, regions: SpeechRegion[]): number {
  let energy = 0;
  let count = 0;
  for (const region of regions) {
    for (let i = region.startSample; i < region.endSample && i < data.length; i++) {
      energy += data[i] * data[i];
      count++;
    }
  }
  const measuredRms = Math.sqrt(energy / Math.max(count, 1));
  return gainToDb(Math.max(measuredRms, 1e-6)) - 0.691;
}

export function applySmartMute(
  data: Float32Array,
  sampleRate: number,
  speechRegions: SpeechRegion[],
  fadeMs: number,
  floorDb: number
): Float32Array {
  const floorGain = dbToGain(floorDb);
  const gainCurve = new Float32Array(data.length);
  gainCurve.fill(floorGain);
  const fadeSamples = Math.max(1, Math.round(sampleRate * (fadeMs / 1000)));

  for (const region of speechRegions) {
    const start = clamp(region.startSample, 0, data.length);
    const end = clamp(region.endSample, start, data.length);
    for (let i = start; i < end; i++) {
      gainCurve[i] = 1;
    }
    for (let i = 0; i < fadeSamples; i++) {
      const fadeInIdx = start - fadeSamples + i;
      if (fadeInIdx >= 0 && fadeInIdx < data.length) {
        gainCurve[fadeInIdx] = Math.max(gainCurve[fadeInIdx], floorGain + (1 - floorGain) * (i / fadeSamples));
      }
      const fadeOutIdx = end + i;
      if (fadeOutIdx >= 0 && fadeOutIdx < data.length) {
        gainCurve[fadeOutIdx] = Math.max(gainCurve[fadeOutIdx], 1 - (1 - floorGain) * (i / fadeSamples));
      }
    }
  }

  return applyGainCurve(data, gainCurve);
}

type BiquadCoefficients = {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
};

function applyBiquad(data: Float32Array, coeffs: BiquadCoefficients): Float32Array {
  const out = new Float32Array(data.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x0 = data[i];
    const y0 = coeffs.b0 * x0 + coeffs.b1 * x1 + coeffs.b2 * x2 - coeffs.a1 * y1 - coeffs.a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

function designHighpass(freq: number, sampleRate: number, q: number): BiquadCoefficients {
  const w0 = 2 * Math.PI * (freq / sampleRate);
  const alpha = Math.sin(w0) / (2 * q);
  const cosw0 = Math.cos(w0);
  const b0 = (1 + cosw0) / 2;
  const b1 = -(1 + cosw0);
  const b2 = (1 + cosw0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosw0;
  const a2 = 1 - alpha;
  return normalizeCoeffs(b0, b1, b2, a0, a1, a2);
}

function designLowpass(freq: number, sampleRate: number, q: number): BiquadCoefficients {
  const w0 = 2 * Math.PI * (freq / sampleRate);
  const alpha = Math.sin(w0) / (2 * q);
  const cosw0 = Math.cos(w0);
  const b0 = (1 - cosw0) / 2;
  const b1 = 1 - cosw0;
  const b2 = (1 - cosw0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosw0;
  const a2 = 1 - alpha;
  return normalizeCoeffs(b0, b1, b2, a0, a1, a2);
}

function designPeaking(freq: number, sampleRate: number, q: number, gainDb: number): BiquadCoefficients {
  const a = dbToGain(gainDb / 2);
  const w0 = 2 * Math.PI * (freq / sampleRate);
  const alpha = Math.sin(w0) / (2 * q);
  const cosw0 = Math.cos(w0);
  const b0 = 1 + alpha * a;
  const b1 = -2 * cosw0;
  const b2 = 1 - alpha * a;
  const a0 = 1 + alpha / a;
  const a1 = -2 * cosw0;
  const a2 = 1 - alpha / a;
  return normalizeCoeffs(b0, b1, b2, a0, a1, a2);
}

function designLowShelf(freq: number, sampleRate: number, q: number, gainDb: number): BiquadCoefficients {
  const a = dbToGain(gainDb / 2);
  const w0 = 2 * Math.PI * (freq / sampleRate);
  const cosw0 = Math.cos(w0);
  const sinw0 = Math.sin(w0);
  const alpha = sinw0 / 2 * Math.sqrt((a + 1 / a) * (1 / q - 1) + 2);
  const twoSqrtAAlpha = 2 * Math.sqrt(a) * alpha;

  const b0 = a * ((a + 1) - (a - 1) * cosw0 + twoSqrtAAlpha);
  const b1 = 2 * a * ((a - 1) - (a + 1) * cosw0);
  const b2 = a * ((a + 1) - (a - 1) * cosw0 - twoSqrtAAlpha);
  const a0 = (a + 1) + (a - 1) * cosw0 + twoSqrtAAlpha;
  const a1 = -2 * ((a - 1) + (a + 1) * cosw0);
  const a2 = (a + 1) + (a - 1) * cosw0 - twoSqrtAAlpha;
  return normalizeCoeffs(b0, b1, b2, a0, a1, a2);
}

function designHighShelf(freq: number, sampleRate: number, q: number, gainDb: number): BiquadCoefficients {
  const a = dbToGain(gainDb / 2);
  const w0 = 2 * Math.PI * (freq / sampleRate);
  const cosw0 = Math.cos(w0);
  const sinw0 = Math.sin(w0);
  const alpha = sinw0 / 2 * Math.sqrt((a + 1 / a) * (1 / q - 1) + 2);
  const twoSqrtAAlpha = 2 * Math.sqrt(a) * alpha;

  const b0 = a * ((a + 1) + (a - 1) * cosw0 + twoSqrtAAlpha);
  const b1 = -2 * a * ((a - 1) + (a + 1) * cosw0);
  const b2 = a * ((a + 1) + (a - 1) * cosw0 - twoSqrtAAlpha);
  const a0 = (a + 1) - (a - 1) * cosw0 + twoSqrtAAlpha;
  const a1 = 2 * ((a - 1) - (a + 1) * cosw0);
  const a2 = (a + 1) - (a - 1) * cosw0 - twoSqrtAAlpha;
  return normalizeCoeffs(b0, b1, b2, a0, a1, a2);
}

function normalizeCoeffs(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): BiquadCoefficients {
  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}
