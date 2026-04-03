import { LogCallback, AudioParams, DEFAULT_PARAMS } from './types';

export function mixAndTrim(
  masterBuffer: AudioBuffer,
  duckedBgmBuffer: AudioBuffer,
  log: LogCallback,
  params: AudioParams = DEFAULT_PARAMS
): AudioBuffer {
  log('Mixando Master + BGM e cortando BGM...', 'step');
  const BGM_TAIL = params.bgmTailAfterMaster;
  const sampleRate = masterBuffer.sampleRate;
  const masterLength = masterBuffer.length;
  const tailSamples = Math.floor(BGM_TAIL * sampleRate);
  const cutPoint = masterLength + tailSamples;
  const v1Length = Math.min(cutPoint, Math.max(masterLength, duckedBgmBuffer.length));
  const numChannels = Math.max(masterBuffer.numberOfChannels, duckedBgmBuffer.numberOfChannels);
  const ctx = new OfflineAudioContext(numChannels, v1Length, sampleRate);
  const v1Buffer = ctx.createBuffer(numChannels, v1Length, sampleRate);

  for (let ch = 0; ch < numChannels; ch++) {
    const dst = v1Buffer.getChannelData(ch);
    const masterCh = ch < masterBuffer.numberOfChannels ? masterBuffer.getChannelData(ch) : masterBuffer.getChannelData(0);
    const bgmCh = ch < duckedBgmBuffer.numberOfChannels ? duckedBgmBuffer.getChannelData(ch) : duckedBgmBuffer.getChannelData(0);
    for (let i = 0; i < v1Length; i++) {
      const m = i < masterLength ? masterCh[i] : 0;
      const b = i < duckedBgmBuffer.length && i < cutPoint ? bgmCh[i] : 0;
      dst[i] = m + b;
    }
  }

  log(`V1 criado: ${(v1Length / sampleRate).toFixed(1)}s (Master + BGM cortado em +${BGM_TAIL}s)`, 'success');
  return v1Buffer;
}

export function concatenate(
  intro: AudioBuffer,
  v1: AudioBuffer,
  outro: AudioBuffer,
  log: LogCallback,
  params: AudioParams = DEFAULT_PARAMS
): AudioBuffer {
  log('Montando V2: Intro + V1 + Outro (com crossfade)...', 'step');
  const sampleRate = v1.sampleRate;
  const crossfadeDuration = params.crossfadeDuration ?? 0.03;
  const xfadeSamples = Math.min(
    Math.floor(crossfadeDuration * sampleRate * 1.5),
    Math.floor(intro.length / 2),
    Math.floor(outro.length / 2),
    Math.floor(v1.length / 4)
  );

  const totalLength = intro.length + v1.length + outro.length - (xfadeSamples > 0 ? 2 * xfadeSamples : 0);
  const numChannels = Math.max(intro.numberOfChannels, v1.numberOfChannels, outro.numberOfChannels);
  const ctx = new OfflineAudioContext(numChannels, totalLength, sampleRate);
  const v2Buffer = ctx.createBuffer(numChannels, totalLength, sampleRate);

  for (let ch = 0; ch < numChannels; ch++) {
    const dst = v2Buffer.getChannelData(ch);
    const getChData = (buf: AudioBuffer) => ch < buf.numberOfChannels ? buf.getChannelData(ch) : buf.getChannelData(0);
    const introData = getChData(intro);
    const v1Data = getChData(v1);
    const outroData = getChData(outro);

    if (xfadeSamples <= 0) {
      dst.set(introData, 0);
      dst.set(v1Data, intro.length);
      dst.set(outroData, intro.length + v1.length);
    } else {
      const introEnd = intro.length - xfadeSamples;
      dst.set(introData.subarray(0, introEnd), 0);
      for (let i = 0; i < xfadeSamples; i++) {
        const t = i / xfadeSamples;
        dst[introEnd + i] = introData[introEnd + i] * (1 - t) + v1Data[i] * t;
      }
      const v1Start = xfadeSamples;
      const v1BodyEnd = v1.length - xfadeSamples;
      const v1WriteOffset = introEnd + xfadeSamples;
      if (v1BodyEnd > v1Start) dst.set(v1Data.subarray(v1Start, v1BodyEnd), v1WriteOffset);
      const xfade2WritePos = v1WriteOffset + (v1BodyEnd - v1Start);
      for (let i = 0; i < xfadeSamples; i++) {
        const t = i / xfadeSamples;
        dst[xfade2WritePos + i] = v1Data[v1BodyEnd + i] * (1 - t) + outroData[i] * t;
      }
      const outroWritePos = xfade2WritePos + xfadeSamples;
      if (xfadeSamples < outro.length) dst.set(outroData.subarray(xfadeSamples), outroWritePos);
    }
  }

  const totalSec = totalLength / sampleRate;
  log(`V2 montado: ${totalSec.toFixed(1)}s total (crossfade: ${(crossfadeDuration * 1000).toFixed(0)}ms)`, 'success');
  return v2Buffer;
}