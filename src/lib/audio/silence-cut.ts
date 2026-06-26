import { monoDataToAudioBuffer } from './decoder';
import { dbToGain } from './dsp';
import { AudioParams, LogCallback } from './types';

const ANALYSIS_WINDOW_SEC = 0.01; // 10 ms
/** Micro fade applied at every silence-cut join to remove "cortes secos"
 *  (clicks/audible jumps caused by joining two non-contiguous samples). */
const JOIN_FADE_SEC = 0.012; // 12 ms — inaudible but kills clicks

/**
 * Cuts long silences from the master voice buffer.
 *
 * Spec:
 *   - Threshold: anything below `silenceCutThresholdDb` (default -20 dB) counts as silence.
 *   - Only blocks of silence lasting at least `silenceMinDuration` (default 0.9 s) are cut.
 *   - Each qualifying block is shortened to `silenceCutTarget` (default 0.6 s),
 *     keeping equal padding at both ends and removing the middle.
 *
 * Returns a new mono AudioBuffer (shorter or equal in length).
 */
export function cutSilencesInMaster(
  buffer: AudioBuffer,
  params: AudioParams,
  log: LogCallback
): AudioBuffer {
  const sampleRate = buffer.sampleRate;
  const data = buffer.getChannelData(0);

  const threshold = dbToGain(params.silenceCutThresholdDb ?? -20);
  const minSilenceSec = params.silenceMinDuration ?? 0.9;
  const targetSec = params.silenceCutTarget ?? 0.6;

  const windowSamples = Math.max(1, Math.floor(sampleRate * ANALYSIS_WINDOW_SEC));
  const minSilenceSamples = Math.floor(minSilenceSec * sampleRate);
  const targetSamples = Math.max(1, Math.floor(targetSec * sampleRate));
  const halfTarget = Math.floor(targetSamples / 2);

  // 1. Mark silence per window using RMS.
  const totalWindows = Math.ceil(data.length / windowSamples);
  const isSilent = new Uint8Array(totalWindows);
  for (let w = 0; w < totalWindows; w++) {
    const start = w * windowSamples;
    const end = Math.min(start + windowSamples, data.length);
    let sum = 0;
    for (let i = start; i < end; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / Math.max(1, end - start));
    isSilent[w] = rms < threshold ? 1 : 0;
  }

  // 2. Group contiguous silent windows into blocks (in samples).
  type Block = { start: number; end: number };
  const silentBlocks: Block[] = [];
  let blockStart = -1;
  for (let w = 0; w <= totalWindows; w++) {
    const silent = w < totalWindows && isSilent[w] === 1;
    if (silent && blockStart < 0) {
      blockStart = w * windowSamples;
    } else if (!silent && blockStart >= 0) {
      silentBlocks.push({ start: blockStart, end: Math.min(w * windowSamples, data.length) });
      blockStart = -1;
    }
  }

  // 3. Build the kept-segments list. For each long-enough silence, keep
  //    `halfTarget` samples at the head and `halfTarget` at the tail; drop the middle.
  type KeepRange = { start: number; end: number };
  const keep: KeepRange[] = [];
  let cursor = 0;
  let totalRemoved = 0;
  let cuts = 0;

  for (const block of silentBlocks) {
    const blockLen = block.end - block.start;
    if (blockLen < minSilenceSamples) continue; // leave it intact

    // Keep the audio up to the start of the block as-is.
    if (block.start > cursor) keep.push({ start: cursor, end: block.start });
    // Keep the head padding of the silence.
    keep.push({ start: block.start, end: block.start + halfTarget });
    // Keep the tail padding of the silence.
    keep.push({ start: block.end - (targetSamples - halfTarget), end: block.end });

    totalRemoved += blockLen - targetSamples;
    cuts++;
    cursor = block.end;
  }
  if (cursor < data.length) keep.push({ start: cursor, end: data.length });

  if (cuts === 0) {
    log('Corte de silêncio: nenhum bloco >= ' + minSilenceSec + 's encontrado', 'info');
    return buffer;
  }

  // 4. Concatenate the kept ranges into a new buffer.
  const newLength = keep.reduce((sum, r) => sum + (r.end - r.start), 0);
  const out = new Float32Array(newLength);
  const joinOffsets: number[] = []; // boundary positions in `out`
  let writeOffset = 0;
  for (let i = 0; i < keep.length; i++) {
    const r = keep[i];
    out.set(data.subarray(r.start, r.end), writeOffset);
    writeOffset += r.end - r.start;
    if (i < keep.length - 1) joinOffsets.push(writeOffset);
  }

  // Apply micro fade-out/fade-in around every cut boundary so the join
  // is smooth instead of a hard splice.
  const fadeSamples = Math.max(1, Math.floor(JOIN_FADE_SEC * sampleRate));
  for (const boundary of joinOffsets) {
    const fOut = Math.min(fadeSamples, boundary);
    for (let i = 0; i < fOut; i++) {
      const t = (fOut - i) / fOut; // 1 → 1/fOut
      out[boundary - fOut + i] *= t * t; // equal-power-ish curve
    }
    const fIn = Math.min(fadeSamples, out.length - boundary);
    for (let i = 0; i < fIn; i++) {
      const t = i / fIn; // 0 → 1
      out[boundary + i] *= t * t;
    }
  }

  const removedSec = totalRemoved / sampleRate;
  const beforeSec = data.length / sampleRate;
  const afterSec = newLength / sampleRate;
  log(
    `Silêncio cortado: ${cuts} bloco(s), -${removedSec.toFixed(1)}s ` +
    `(${beforeSec.toFixed(1)}s → ${afterSec.toFixed(1)}s) @ ${params.silenceCutThresholdDb}dB`,
    'success'
  );

  return monoDataToAudioBuffer(out, sampleRate);
}