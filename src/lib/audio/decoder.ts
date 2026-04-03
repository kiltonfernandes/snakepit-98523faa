import { mixToMono, resampleLinear } from './dsp';

type AudioContextConstructor = typeof AudioContext;
type WindowWithWebkitAudioContext = Window & { webkitAudioContext?: AudioContextConstructor; };

const audioContextCtor = window.AudioContext ?? (window as WindowWithWebkitAudioContext).webkitAudioContext;
if (!audioContextCtor) throw new Error('AudioContext nao esta disponivel neste runtime.');
const audioCtx = new audioContextCtor();

export async function decodeFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  return audioCtx.decodeAudioData(arrayBuffer);
}

export function getAudioContext(): AudioContext { return audioCtx; }

export function audioBufferToMonoData(buffer: AudioBuffer, targetSampleRate = 48000): Float32Array {
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    channels.push(new Float32Array(buffer.getChannelData(channel)));
  }
  const mono = mixToMono(channels);
  return buffer.sampleRate === targetSampleRate ? new Float32Array(mono) : resampleLinear(mono, buffer.sampleRate, targetSampleRate);
}

export function monoDataToAudioBuffer(data: Float32Array, sampleRate: number): AudioBuffer {
  const buffer = audioCtx.createBuffer(1, data.length, sampleRate);
  buffer.copyToChannel(new Float32Array(data), 0);
  return buffer;
}

export function ensureSampleRate(buffer: AudioBuffer, targetSampleRate: number): AudioBuffer {
  if (buffer.sampleRate === targetSampleRate) return buffer;
  const mono = audioBufferToMonoData(buffer, targetSampleRate);
  return monoDataToAudioBuffer(mono, targetSampleRate);
}