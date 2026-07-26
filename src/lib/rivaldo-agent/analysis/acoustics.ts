import type { SpeechRegion } from '@/lib/audio/dsp';
import { rms } from '@/lib/audio/dsp';

/** RT60 estimado via decay pós-onset (Schroeder simplificado sobre envelope RMS). */
export interface AcousticsResult {
  rt60EstSec: number;
  rt60Confidence: number;
  directToReverbRatioDb: number;
}

const toDb = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));

export function measureAcoustics(data: Float32Array, sr: number, speech: SpeechRegion[]): AcousticsResult {
  if (speech.length < 2) return { rt60EstSec: 0, rt60Confidence: 0, directToReverbRatioDb: 0 };
  const decays: number[] = [];
  const ratios: number[] = [];
  for (let i = 0; i < speech.length - 1; i++) {
    const endSample = speech[i].endSample;
    const nextStart = speech[i + 1].startSample;
    if (nextStart - endSample < Math.round(sr * 0.2)) continue; // precisa cauda
    // energia direta: últimos 30 ms da fala
    const dStart = Math.max(speech[i].startSample, endSample - Math.round(sr * 0.03));
    const direct = rms(data, dStart, endSample);
    // cauda: janelas 20 ms após fim, medir decay até -20 dB
    const winSamples = Math.round(sr * 0.02);
    const directDb = toDb(direct);
    let decaySec = 0;
    for (let s = endSample; s + winSamples < nextStart; s += winSamples) {
      const level = toDb(rms(data, s, s + winSamples));
      if (level < directDb - 20) { decaySec = (s - endSample) / sr; break; }
    }
    if (decaySec > 0) {
      decays.push(decaySec * 3); // extrapola -20 dB → -60 dB (RT60 ≈ 3× T20)
      // razão direct/reverb ≈ direct vs primeira janela de cauda 30-100 ms
      const tailStart = endSample + Math.round(sr * 0.03);
      const tailEnd = Math.min(nextStart, tailStart + Math.round(sr * 0.07));
      if (tailEnd > tailStart) {
        const tail = rms(data, tailStart, tailEnd);
        if (tail > 1e-6) ratios.push(toDb(direct / tail));
      }
    }
  }
  if (decays.length === 0) return { rt60EstSec: 0, rt60Confidence: 0, directToReverbRatioDb: 0 };
  const median = (arr: number[]) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  return {
    rt60EstSec: Math.min(median(decays), 2.5),
    rt60Confidence: Math.min(1, decays.length / 6),
    directToReverbRatioDb: ratios.length ? median(ratios) : 0,
  };
}