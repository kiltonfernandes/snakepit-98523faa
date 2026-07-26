/**
 * BS.1770-5 K-weighting: pré-filtro shelving high + high-pass RLB.
 * Coeficientes bi-quad para 48 kHz (padrão ITU). Para outras SR aplicamos
 * warping via re-derivação bilinear — mas para brevidade, resample para
 * 48 kHz é feito upstream.
 */

// Coeficientes ITU-R BS.1770 @ 48 kHz (normalizados por a0=1)
const PRE_B = [1.53512485958697, -2.69169618940638, 1.19839281085285];
const PRE_A = [1.0, -1.69065929318241, 0.73248077421585];
const RLB_B = [1.0, -2.0, 1.0];
const RLB_A = [1.0, -1.99004745483398, 0.99007225036621];

function biquad(input: Float32Array, b: number[], a: number[]): Float32Array {
  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = b[0] * x0 + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    out[i] = y0;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
  }
  return out;
}

export function kWeight(data: Float32Array): Float32Array {
  return biquad(biquad(data, PRE_B, PRE_A), RLB_B, RLB_A);
}