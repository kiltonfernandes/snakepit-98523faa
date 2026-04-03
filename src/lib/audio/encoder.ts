import { LogCallback, SubProgressCallback } from './types';

interface Mp3EncoderInstance {
  encodeBuffer: (left: Int16Array, right?: Int16Array) => Int8Array | Uint8Array | number[];
  flush: () => Int8Array | Uint8Array | number[];
}

interface LameModule {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => Mp3EncoderInstance;
}

export async function encodeBufferToMp3Blob(
  buffer: AudioBuffer, log: LogCallback, kbps: number = 192, onSubProgress?: SubProgressCallback
): Promise<Blob> {
  const lamejs = await import('@breezystack/lamejs') as unknown as LameModule;
  const Mp3Encoder = lamejs.Mp3Encoder;
  const sampleRate = buffer.sampleRate;
  const numChannels = Math.min(buffer.numberOfChannels, 2);
  const encoder = new Mp3Encoder(numChannels, sampleRate, kbps);
  const blockSize = 1152;
  const mp3Data: (Uint8Array | Int8Array | number[])[] = [];
  const leftFloat = buffer.getChannelData(0);
  const rightFloat = numChannels > 1 ? buffer.getChannelData(1) : leftFloat;
  const totalSamples = leftFloat.length;
  const leftChunk = new Int16Array(blockSize);
  const rightChunk = new Int16Array(blockSize);

  for (let i = 0; i < totalSamples; i += blockSize) {
    const end = Math.min(i + blockSize, totalSamples);
    const len = end - i;
    for (let j = 0; j < len; j++) {
      const ls = Math.max(-1, Math.min(1, leftFloat[i + j]));
      leftChunk[j] = ls < 0 ? ls * 0x8000 : ls * 0x7FFF;
      const rs = Math.max(-1, Math.min(1, rightFloat[i + j]));
      rightChunk[j] = rs < 0 ? rs * 0x8000 : rs * 0x7FFF;
    }
    const lSlice = len < blockSize ? leftChunk.subarray(0, len) : leftChunk;
    const rSlice = len < blockSize ? rightChunk.subarray(0, len) : rightChunk;
    const mp3buf = numChannels === 1 ? encoder.encodeBuffer(lSlice) : encoder.encodeBuffer(lSlice, rSlice);
    if (mp3buf.length > 0) mp3Data.push(mp3buf);
    if (i % (blockSize * 200) === 0 && i > 0) {
      onSubProgress?.(i / totalSamples);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  const endBuf = encoder.flush();
  if (endBuf.length > 0) mp3Data.push(endBuf);
  onSubProgress?.(1);
  return new Blob(mp3Data as BlobPart[], { type: 'audio/mp3' });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.mp3') ? filename : `${filename}.mp3`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function encodeToMp3(
  buffer: AudioBuffer, filename: string, log: LogCallback, kbps: number = 192, onSubProgress?: SubProgressCallback
): Promise<void> {
  log(`Codificando para MP3 (${kbps}kbps)...`, 'step');
  const blob = await encodeBufferToMp3Blob(buffer, log, kbps, onSubProgress);
  downloadBlob(blob, filename);
  const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
  log(`MP3 exportado: ${filename}.mp3 (${sizeMB} MB)`, 'success');
}

export async function encodeToMp3Blob(buffer: AudioBuffer, log: LogCallback): Promise<Blob> {
  log('Codificando para MP3 (blob)...', 'step');
  const blob = await encodeBufferToMp3Blob(buffer, log);
  const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
  log(`MP3 blob: ${sizeMB} MB`, 'info');
  return blob;
}

export { downloadBlob };