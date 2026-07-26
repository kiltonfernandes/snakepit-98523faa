/**
 * Verificação pós-execução: mede loudness/true-peak reais do buffer tratado
 * e compara com o `predictedFinalLoudness` do plano. Diferenças > tolerância
 * são retornadas como issues para a UI reportar sem bloquear a exportação.
 */
import { measureLoudness } from '../analysis/loudness';
import type { TreatmentPlanV1 } from '../contracts/treatment-plan-v1';

export interface VerifyIssue { code: 'lufs_drift' | 'true_peak_drift' | 'true_peak_over'; message: string; delta: number; }
export interface VerifyResult {
  measuredVoiceLufs: number;
  measuredTruePeakDbtp: number;
  issues: VerifyIssue[];
}

export function verifyExecution(data: Float32Array, sampleRate: number, plan: TreatmentPlanV1, hardCeilingDbtp = -1): VerifyResult {
  const loud = measureLoudness(data, sampleRate);
  const issues: VerifyIssue[] = [];
  const lufsDelta = loud.integratedLufs - plan.predictedFinalLoudness.voiceLufs;
  if (Math.abs(lufsDelta) > 3) {
    issues.push({ code: 'lufs_drift', message: `LUFS medido difere ${lufsDelta.toFixed(2)} dB do previsto`, delta: lufsDelta });
  }
  const tpDelta = loud.truePeakDbtp - plan.predictedFinalLoudness.truePeakDbtp;
  if (Math.abs(tpDelta) > 3) {
    issues.push({ code: 'true_peak_drift', message: `True-peak difere ${tpDelta.toFixed(2)} dB do previsto`, delta: tpDelta });
  }
  if (loud.truePeakDbtp > hardCeilingDbtp) {
    issues.push({ code: 'true_peak_over', message: `True-peak ${loud.truePeakDbtp.toFixed(2)} dBTP acima do teto ${hardCeilingDbtp} dBTP`, delta: loud.truePeakDbtp - hardCeilingDbtp });
  }
  return { measuredVoiceLufs: loud.integratedLufs, measuredTruePeakDbtp: loud.truePeakDbtp, issues };
}