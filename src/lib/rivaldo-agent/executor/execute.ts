/**
 * Executor local do TreatmentPlanV1.
 *
 * Percorre os estágios na ordem fixa `repair → noise → tone → events →
 * dynamics → finish`, aplicando cada operação em uma cópia do buffer mono
 * de trabalho. Nada é enviado para rede aqui — o áudio permanece 100% no
 * dispositivo do usuário conforme especificação da Wave 4.
 */
import type { StageId, TreatmentPlanV1 } from '../contracts/treatment-plan-v1';
import { runOperation } from './operations';
import { blendRegion, extractRegion, regionToRange } from './regions';
import { applySafetyLimiter, type SafetyLimiterStats } from './safety-limiter';

const STAGE_ORDER: StageId[] = ['repair', 'noise', 'tone', 'events', 'dynamics', 'finish'];

export interface ExecuteProgress { progress: number; stage: string; }
export type ExecuteProgressCb = (p: ExecuteProgress) => void;

export interface ExecuteResult {
  channelData: Float32Array;
  operationsApplied: number;
  perStage: Record<StageId, number>;
  skipped: Array<{ stage: StageId; kind: string; reason: string }>;
  /** Wave D: stats do limiter safety aplicado fora do controle do plano. */
  safetyLimiter: SafetyLimiterStats;
}

export function executePlan(
  input: Float32Array,
  sampleRate: number,
  plan: TreatmentPlanV1,
  onProgress?: ExecuteProgressCb,
): ExecuteResult {
  const working = new Float32Array(input); // deep copy
  // Wave D: rastreia HPF já aplicado no estágio events para evitar HPF repetido
  // (de_plosive já é single-pass internamente; aqui bloqueamos EQ highpass
  // adicional na mesma track após o primeiro de_plosive).
  let hpfAppliedInEvents = false;
  const perStage: Record<StageId, number> = {
    repair: 0, noise: 0, tone: 0, events: 0, dynamics: 0, finish: 0,
  };
  const skipped: Array<{ stage: StageId; kind: string; reason: string }> = [];
  let applied = 0;

  // Aggregate operations grouped by stage in fixed order (extras ignorados)
  const stagesByOrder = STAGE_ORDER.map((stageId) =>
    plan.stages.filter((s) => s.stage === stageId).flatMap((s) => s.operations.map((op) => ({ stageId, op }))),
  );
  const total = stagesByOrder.reduce((acc, ops) => acc + ops.length, 0) || 1;
  let done = 0;

  for (let s = 0; s < STAGE_ORDER.length; s++) {
    const stageId = STAGE_ORDER[s];
    const ops = stagesByOrder[s];
    onProgress?.({ progress: done / total, stage: `execute:${stageId}` });
    for (const { op } of ops) {
      const range = regionToRange(op.region, sampleRate, working.length);
      if (range.endSample - range.startSample < 16) {
        skipped.push({ stage: stageId, kind: op.kind, reason: 'region_too_small' });
        done++; continue;
      }
      try {
        const region = extractRegion(working, range);
        // Bloqueio conservador: recusa HPF repetido no mesmo track.
        if (op.kind === 'eq' && op.filters?.some((f) => f.type === 'highpass') && hpfAppliedInEvents) {
          skipped.push({ stage: stageId, kind: op.kind, reason: 'highpass_already_applied' });
          done++; continue;
        }
        const processed = runOperation(op, region, sampleRate);
        if (op.kind === 'de_plosive' || (op.kind === 'eq' && op.filters?.some((f) => f.type === 'highpass'))) {
          hpfAppliedInEvents = true;
        }
        // Guard: comprimento pode variar em ops STFT — force truncate/pad
        const aligned = processed.length === region.length
          ? processed
          : (() => { const a = new Float32Array(region.length); a.set(processed.subarray(0, region.length)); return a; })();
        blendRegion(working, aligned, range);
        perStage[stageId]++;
        applied++;
      } catch (err) {
        skipped.push({ stage: stageId, kind: op.kind, reason: err instanceof Error ? err.message : 'error' });
      }
      done++;
      if (done % 4 === 0) onProgress?.({ progress: done / total, stage: `execute:${stageId}` });
    }
  }

  // Wave D: safety limiter final. SEMPRE roda, teto -1.5 dBTP. Se o áudio já
  // está abaixo do teto é passthrough (stats.applied=false).
  onProgress?.({ progress: 0.98, stage: 'execute:safety_limiter' });
  const { output, stats: safetyLimiter } = applySafetyLimiter(working, sampleRate, -1.5);
  onProgress?.({ progress: 1, stage: 'execute:done' });
  return { channelData: output, operationsApplied: applied, perStage, skipped, safetyLimiter };
}