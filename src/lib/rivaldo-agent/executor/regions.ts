/**
 * Region utilities for the local executor.
 *
 * Cada operação do plano é aplicada a uma janela `[startSec, endSec]` do
 * buffer mono. Estas helpers cuidam de:
 *  - Converter tempo → índice de amostra respeitando limites.
 *  - Extrair uma cópia da região para processamento fora do lugar.
 *  - Escrever a região processada de volta com cross-fade nas bordas para
 *    evitar cliques e mudanças abruptas de energia.
 */
import type { Region } from '../contracts/treatment-plan-v1';

export interface RegionRange {
  startSample: number;
  endSample: number;
  fadeInSamples: number;
  fadeOutSamples: number;
}

export function regionToRange(region: Region, sampleRate: number, totalSamples: number): RegionRange {
  const startSample = Math.max(0, Math.min(totalSamples, Math.floor(region.startSec * sampleRate)));
  const endSample = Math.max(startSample, Math.min(totalSamples, Math.floor(region.endSec * sampleRate)));
  const length = endSample - startSample;
  const fadeInSamples = Math.min(length >> 1, Math.floor(((region.fadeInMs ?? 10) / 1000) * sampleRate));
  const fadeOutSamples = Math.min(length >> 1, Math.floor(((region.fadeOutMs ?? 10) / 1000) * sampleRate));
  return { startSample, endSample, fadeInSamples, fadeOutSamples };
}

export function extractRegion(data: Float32Array, range: RegionRange): Float32Array {
  const out = new Float32Array(range.endSample - range.startSample);
  out.set(data.subarray(range.startSample, range.endSample));
  return out;
}

/** Cross-fade a região processada de volta ao buffer com fades lineares nas bordas. */
export function blendRegion(target: Float32Array, processed: Float32Array, range: RegionRange): void {
  const { startSample, fadeInSamples, fadeOutSamples } = range;
  const length = processed.length;
  for (let i = 0; i < length; i++) {
    const t = i < fadeInSamples ? i / Math.max(1, fadeInSamples)
      : i >= length - fadeOutSamples ? (length - i) / Math.max(1, fadeOutSamples)
      : 1;
    const idx = startSample + i;
    if (idx < 0 || idx >= target.length) continue;
    target[idx] = target[idx] * (1 - t) + processed[i] * t;
  }
}