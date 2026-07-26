/**
 * Biquad filter cookbook (Robert Bristow-Johnson) — mono, sample-by-sample.
 *
 * Usado pelas operações `eq`, `dehum` (notch), `de_esser` (band-pass no
 * detector), `de_plosive` (high-pass) e `event_attenuate` quando precisa
 * de conformação espectral.
 */
export type BiquadType = 'peak' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass' | 'notch' | 'bandpass';

export interface BiquadCoefs {
  b0: number; b1: number; b2: number;
  a1: number; a2: number;
}

export function makeBiquad(type: BiquadType, sampleRate: number, frequency: number, q: number, gainDb = 0): BiquadCoefs {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * Math.max(0.0001, q));

  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
  switch (type) {
    case 'peak': {
      b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A; break;
    }
    case 'lowshelf': {
      const beta = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cos + beta);
      b1 = 2 * A * ((A - 1) - (A + 1) * cos);
      b2 = A * ((A + 1) - (A - 1) * cos - beta);
      a0 = (A + 1) + (A - 1) * cos + beta;
      a1 = -2 * ((A - 1) + (A + 1) * cos);
      a2 = (A + 1) + (A - 1) * cos - beta; break;
    }
    case 'highshelf': {
      const beta = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cos + beta);
      b1 = -2 * A * ((A - 1) + (A + 1) * cos);
      b2 = A * ((A + 1) + (A - 1) * cos - beta);
      a0 = (A + 1) - (A - 1) * cos + beta;
      a1 = 2 * ((A - 1) - (A + 1) * cos);
      a2 = (A + 1) - (A - 1) * cos - beta; break;
    }
    case 'lowpass': {
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
    }
    case 'highpass': {
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
    }
    case 'notch': {
      b0 = 1; b1 = -2 * cos; b2 = 1;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
    }
    case 'bandpass': {
      b0 = alpha; b1 = 0; b2 = -alpha;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
    }
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Direct Form I, in-place (aloca output separado). */
export function applyBiquad(data: Float32Array, coefs: BiquadCoefs, out?: Float32Array): Float32Array {
  const output = out ?? new Float32Array(data.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = coefs.b0 * x + coefs.b1 * x1 + coefs.b2 * x2 - coefs.a1 * y1 - coefs.a2 * y2;
    output[i] = y;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return output;
}