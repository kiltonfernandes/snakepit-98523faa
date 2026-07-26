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

const STAGE_ORDER: StageId[] = ['repair', 'noise', 'tone', 'events', 'dynamics', 'finish'];

export interface ExecuteProgress { progress: number; stage: string; }
export type ExecuteProgressCb = (p: ExecuteProgress) => void;

export interface ExecuteResult {
  channelData: Float32Array;
  operationsApplied: number;
  perStage: Record<StageId, number>;
  skipped: Array<{ stage: StageId; kind: string; reason: string }>;
}

export function executePlan(
  input: Float32Array,
  sampleRate: number,
  plan: TreatmentPlanV1,
  onProgress?: ExecuteProgressCb,
): ExecuteResult {
  const working = new Float32Array(input); // deep copy
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
        const processed = runOperation(op, region, sampleRate);
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

  onProgress?.({ progress: 1, stage: 'execute:done' });
  return { channelData: working, operationsApplied: applied, perStage, skipped };
}