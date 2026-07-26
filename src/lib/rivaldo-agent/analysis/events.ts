import { rms } from '@/lib/audio/dsp';
import type { SpeechRegion } from '@/lib/audio/dsp';
import type { AudioEvent } from '../contracts/report-v2';

/**
 * Detectores de eventos. Foco: precisão do "onde" (start/end) + severidade
 * normalizada [0,1] + confidence [0,1]. Todos leves — passes O(n) sobre
 * derivadas/janelas curtas.
 */

let eventCounter = 0;
const nextId = (prefix: string) => `${prefix}-${++eventCounter}`;

const toDb = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));

export interface EventDetectors {
  clipping: AudioEvent[];
  click: AudioEvent[];
  crackle: AudioEvent[];
  breath: AudioEvent[];
  sibilance: AudioEvent[];
  plosive: AudioEvent[];
  hum: AudioEvent[];
  levelJump: AudioEvent[];
  dropout: AudioEvent[];
}

function samplesToSec(s: number, sr: number) { return s / sr; }

export function detectClipping(data: Float32Array, sr: number): AudioEvent[] {
  const th = 0.985; const minRun = Math.round(sr * 0.001);
  const out: AudioEvent[] = []; let run = 0; let start = -1;
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) >= th) { if (run === 0) start = i; run++; }
    else if (run > 0) {
      if (run >= minRun) out.push({
        id: nextId('clip'), type: 'clipping',
        startSec: samplesToSec(start, sr), endSec: samplesToSec(i, sr),
        severity: Math.min(1, run / (sr * 0.05)), confidence: 0.95,
      });
      run = 0;
    }
  }
  return out;
}

export function detectClicksAndCrackle(data: Float32Array, sr: number): { clicks: AudioEvent[]; crackle: AudioEvent[] } {
  const clicks: AudioEvent[] = [], crackle: AudioEvent[] = [];
  const win = 96; const derivative = new Float32Array(data.length);
  for (let i = 1; i < data.length; i++) derivative[i] = data[i] - data[i - 1];

  for (let i = win; i < derivative.length - win; i++) {
    let sum = 0, sumSq = 0;
    for (let j = i - win; j < i + win; j++) { sum += Math.abs(derivative[j]); sumSq += derivative[j] * derivative[j]; }
    const n = 2 * win;
    const mean = sum / n; const std = Math.sqrt(Math.max(sumSq / n - mean * mean, 1e-10));
    const dev = Math.abs(derivative[i]);
    if (dev > mean + 5 * std) {
      clicks.push({
        id: nextId('click'), type: 'click',
        startSec: samplesToSec(Math.max(0, i - 2), sr),
        endSec: samplesToSec(i + 2, sr),
        severity: Math.min(1, dev / (mean + 10 * std + 1e-6)), confidence: 0.7,
      });
      i += win; // skip
    } else if (dev > mean + 3 * std) {
      crackle.push({
        id: nextId('crk'), type: 'crackle',
        startSec: samplesToSec(Math.max(0, i - 4), sr),
        endSec: samplesToSec(i + 4, sr),
        severity: Math.min(1, dev / (mean + 6 * std + 1e-6)), confidence: 0.55,
      });
      i += 32;
    }
  }
  return { clicks, crackle };
}

export function detectBreathAndPlosive(data: Float32Array, sr: number, speech: SpeechRegion[]): { breath: AudioEvent[]; plosive: AudioEvent[] } {
  const breath: AudioEvent[] = [], plosive: AudioEvent[] = [];
  // Aproximação: energia em gaps curtos entre regiões = respiração; ataque
  // grave (< 200 Hz) no início de região = plosiva. Usamos RMS local.
  const gapMaxSec = 1.2;
  for (let i = 0; i < speech.length; i++) {
    // breath entre regiões
    if (i > 0) {
      const gapStart = speech[i - 1].endSample;
      const gapEnd = speech[i].startSample;
      const gapSec = (gapEnd - gapStart) / sr;
      if (gapSec > 0.15 && gapSec < gapMaxSec) {
        const chunk = data.subarray(gapStart, gapEnd);
        const eDb = toDb(rms(chunk));
        if (eDb > -55 && eDb < -25) {
          breath.push({
            id: nextId('brt'), type: 'breath',
            startSec: samplesToSec(gapStart, sr), endSec: samplesToSec(gapEnd, sr),
            severity: Math.min(1, (eDb + 55) / 30), confidence: 0.6,
          });
        }
      }
    }
    // plosive: primeiros 40 ms da região com peak baixa-freq (aprox. DC drift)
    const onset = speech[i].startSample;
    const onsetEnd = Math.min(data.length, onset + Math.round(sr * 0.04));
    let dcDrift = 0;
    for (let s = onset; s < onsetEnd; s++) dcDrift += data[s];
    dcDrift = Math.abs(dcDrift) / (onsetEnd - onset);
    if (dcDrift > 0.05) {
      plosive.push({
        id: nextId('plo'), type: 'plosive',
        startSec: samplesToSec(onset, sr), endSec: samplesToSec(onsetEnd, sr),
        severity: Math.min(1, dcDrift * 4), confidence: 0.5,
      });
    }
  }
  return { breath, plosive };
}

export function detectSibilance(data: Float32Array, sr: number, speech: SpeechRegion[]): AudioEvent[] {
  // Aproximação leve: dentro de regiões de fala, energia em janelas de 30 ms
  // com muitos zero-crossings sinaliza sibilância. Sem STFT full-run.
  const out: AudioEvent[] = [];
  const win = Math.round(sr * 0.03);
  for (const r of speech) {
    for (let s = r.startSample; s + win < r.endSample; s += win) {
      let zc = 0; for (let i = s + 1; i < s + win; i++) if ((data[i - 1] >= 0) !== (data[i] >= 0)) zc++;
      const ratio = zc / win;
      if (ratio > 0.30) {
        out.push({
          id: nextId('sib'), type: 'sibilance',
          startSec: samplesToSec(s, sr), endSec: samplesToSec(s + win, sr),
          severity: Math.min(1, (ratio - 0.30) * 4), confidence: 0.5,
        });
      }
    }
  }
  return out;
}

export function detectHum(hum50: number, hum60: number, floorDb: number): AudioEvent[] {
  const out: AudioEvent[] = [];
  const add = (freq: 50 | 60, magDb: number) => {
    const excess = magDb - floorDb;
    if (excess > 12) {
      out.push({
        id: nextId('hum'), type: 'hum', startSec: 0, endSec: 0,
        severity: Math.min(1, excess / 30), confidence: 0.8,
        meta: { frequencyHz: freq, magDb, excess },
      });
    }
  };
  add(50, hum50); add(60, hum60);
  return out;
}

export function detectLevelJumps(data: Float32Array, sr: number): AudioEvent[] {
  const out: AudioEvent[] = [];
  const win = Math.round(sr * 0.5);
  const hop = Math.round(sr * 0.25);
  const levels: number[] = [];
  for (let s = 0; s + win < data.length; s += hop) levels.push(toDb(rms(data, s, s + win)));
  for (let i = 1; i < levels.length; i++) {
    const delta = levels[i] - levels[i - 1];
    if (Math.abs(delta) > 6 && levels[i - 1] > -60 && levels[i] > -60) {
      const t = (i * hop) / sr;
      out.push({
        id: nextId('lvl'), type: 'level_jump',
        startSec: t, endSec: t + hop / sr,
        severity: Math.min(1, Math.abs(delta) / 18), confidence: 0.6,
        meta: { deltaDb: delta },
      });
    }
  }
  return out;
}

export function detectDropouts(data: Float32Array, sr: number, speech: SpeechRegion[]): AudioEvent[] {
  // Dropouts DENTRO de fala: janelas 50 ms com level < piso -20 dB.
  const out: AudioEvent[] = [];
  const win = Math.round(sr * 0.05);
  for (const r of speech) {
    for (let s = r.startSample; s + win < r.endSample; s += win) {
      const level = toDb(rms(data, s, s + win));
      if (level < -70) {
        out.push({
          id: nextId('drop'), type: 'dropout',
          startSec: samplesToSec(s, sr), endSec: samplesToSec(s + win, sr),
          severity: 0.7, confidence: 0.5,
        });
      }
    }
  }
  return out;
}

export function resetEventCounter() { eventCounter = 0; }