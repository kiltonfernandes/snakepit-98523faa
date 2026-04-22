import { dbToGain } from './dsp';
import { AudioParams, DEFAULT_PARAMS, LogCallback, SubProgressCallback } from './types';

const ANALYSIS_WINDOW = 0.02;

export interface VoiceRegion {
  start: number;
  end: number;
}

export function getDuckGainAtSample(
  sample: number, voiceRegions: VoiceRegion[], fadeDownSamples: number, fadeUpSamples: number, duckGain: number, holdSamples: number = 0
): number {
  let gain = 1;
  for (let index = 0; index < voiceRegions.length; index++) {
    const region = voiceRegions[index];
    const fadeDownStart = Math.max(0, region.start - fadeDownSamples);
    if (sample < fadeDownStart) break;
    if (sample >= fadeDownStart && sample < region.start) {
      const t = (sample - fadeDownStart) / Math.max(1, fadeDownSamples);
      gain = Math.min(gain, 1 - t * (1 - duckGain));
      continue;
    }
    if (sample >= region.start && sample < region.end) return duckGain;
    // Hold the duck for `holdSamples` after the region ends, then fade up.
    const holdEnd = region.end + holdSamples;
    if (sample >= region.end && sample < holdEnd) return duckGain;
    if (sample >= holdEnd && sample < holdEnd + fadeUpSamples) {
      const t = (sample - holdEnd) / Math.max(1, fadeUpSamples);
      gain = Math.min(gain, duckGain + t * (1 - duckGain));
    }
  }
  return gain;
}

export function detectVoiceRegionsForDuck(
  masterData: Float32Array, sampleRate: number, params: AudioParams = DEFAULT_PARAMS, onAnalysisProgress?: SubProgressCallback
): VoiceRegion[] {
  const voiceThreshold = dbToGain(params.silenceThresholdDb);
  const maxPauseWindows = Math.floor(params.maxPause / ANALYSIS_WINDOW);
  const windowSamples = Math.max(1, Math.floor(sampleRate * ANALYSIS_WINDOW));
  const totalWindows = Math.ceil(masterData.length / windowSamples);
  const voicePresent = new Uint8Array(totalWindows);

  for (let windowIndex = 0; windowIndex < totalWindows; windowIndex++) {
    const start = windowIndex * windowSamples;
    const end = Math.min(start + windowSamples, masterData.length);
    let sum = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex++) {
      sum += masterData[sampleIndex] * masterData[sampleIndex];
    }
    const rms = Math.sqrt(sum / Math.max(1, end - start));
    voicePresent[windowIndex] = rms >= voiceThreshold ? 1 : 0;
    if (windowIndex % 500 === 0) onAnalysisProgress?.((windowIndex / Math.max(1, totalWindows)) * 0.3);
  }

  let lastVoiceEnd = -1;
  for (let windowIndex = 0; windowIndex < totalWindows; windowIndex++) {
    if (!voicePresent[windowIndex]) continue;
    if (lastVoiceEnd >= 0 && (windowIndex - lastVoiceEnd) <= maxPauseWindows) {
      for (let gapIndex = lastVoiceEnd; gapIndex < windowIndex; gapIndex++) voicePresent[gapIndex] = 1;
    }
    lastVoiceEnd = windowIndex + 1;
  }

  const voiceRegions: VoiceRegion[] = [];
  let inVoice = false;
  let regionStart = 0;
  for (let windowIndex = 0; windowIndex <= totalWindows; windowIndex++) {
    const isVoice = windowIndex < totalWindows ? voicePresent[windowIndex] === 1 : false;
    if (isVoice && !inVoice) { regionStart = windowIndex * windowSamples; inVoice = true; continue; }
    if (!isVoice && inVoice) {
      voiceRegions.push({ start: regionStart, end: Math.min(windowIndex * windowSamples, masterData.length) });
      inVoice = false;
    }
  }
  return voiceRegions;
}

export function applyAutoDuck(
  masterBuffer: AudioBuffer, bgmBuffer: AudioBuffer, log: LogCallback,
  params: AudioParams = DEFAULT_PARAMS, onSubProgress?: SubProgressCallback
): AudioBuffer {
  log('Analisando voz na master para Auto-Duck 3.2...', 'step');
  const sampleRate = masterBuffer.sampleRate;
  const masterData = masterBuffer.getChannelData(0);
  const windowSamples = Math.max(1, Math.floor(sampleRate * ANALYSIS_WINDOW));
  const duckGain = dbToGain(params.duckReductionDb);
  const fadeDownSamples = Math.max(1, Math.floor(params.fadeDownDuration * sampleRate));
  const fadeUpSamples = Math.max(1, Math.floor(params.fadeUpDuration * sampleRate));
  const holdSamples = Math.max(0, Math.floor((params.duckHoldDuration ?? 0) * sampleRate));
  const rawRegions = detectVoiceRegionsForDuck(masterData, sampleRate, params, onSubProgress);

  // Aggressive merge: if the gap between two regions is shorter than the
  // total time needed for fadeUp + hold + fadeDown, merge them so the BGM
  // never rises in the brief silences between sentences.
  const mergeThreshold = fadeUpSamples + holdSamples + fadeDownSamples;
  const voiceRegions: VoiceRegion[] = [];
  for (const region of rawRegions) {
    const last = voiceRegions[voiceRegions.length - 1];
    if (last && region.start - last.end < mergeThreshold) {
      last.end = region.end;
    } else {
      voiceRegions.push({ start: region.start, end: region.end });
    }
  }

  log(`Detectadas ${voiceRegions.length} regioes de voz para duck continuo`, 'info');
  onSubProgress?.(0.35);

  const bgmLength = bgmBuffer.length;
  const numChannels = bgmBuffer.numberOfChannels;
  const ctx = new OfflineAudioContext(numChannels, bgmLength, sampleRate);
  const duckedBuffer = ctx.createBuffer(numChannels, bgmLength, sampleRate);
  const bgmWindows = Math.ceil(bgmLength / windowSamples);

  for (let channel = 0; channel < numChannels; channel++) {
    const srcData = bgmBuffer.getChannelData(channel);
    const dstData = duckedBuffer.getChannelData(channel);
    for (let windowIndex = 0; windowIndex < bgmWindows; windowIndex++) {
      const windowStart = windowIndex * windowSamples;
      const windowEnd = Math.min(windowStart + windowSamples, bgmLength);
      const midSample = windowStart + Math.floor((windowEnd - windowStart) / 2);
      const gain = getDuckGainAtSample(midSample, voiceRegions, fadeDownSamples, fadeUpSamples, duckGain, holdSamples);
      if (gain === 1) {
        dstData.set(srcData.subarray(windowStart, windowEnd), windowStart);
      } else {
        for (let sampleIndex = windowStart; sampleIndex < windowEnd; sampleIndex++) {
          dstData[sampleIndex] = srcData[sampleIndex] * gain;
        }
      }
      if (windowIndex % 500 === 0) {
        const channelProgress = (channel * bgmWindows + windowIndex) / Math.max(1, numChannels * bgmWindows);
        onSubProgress?.(0.35 + channelProgress * 0.65);
      }
    }
  }

  onSubProgress?.(1);
  log(
    `Auto-Duck 3.2 aplicado: trilha alta na abertura, queda antes da voz, duck de ${params.duckReductionDb}dB ` +
    `durante a locucao e subida de ${params.fadeUpDuration}s apos a ultima fala.`,
    'success'
  );
  return duckedBuffer;
}