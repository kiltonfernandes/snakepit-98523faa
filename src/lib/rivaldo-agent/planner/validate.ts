import {
  TreatmentPlanV1Schema, type TreatmentPlanV1, type Operation, type Stage,
} from '../contracts/treatment-plan-v1';
import type { AudioAnalysisReportV2 } from '../contracts/report-v2';
import { TREATMENT_POLICY_V1 } from '../contracts/rivaldo-target-v1';

export interface ValidationIssue {
  layer: 'structural' | 'identity' | 'temporal' | 'evidence' | 'params' | 'cumulative' | 'conflicts';
  severity: 'clamp' | 'drop' | 'reject';
  message: string;
  stage?: string;
  operationIndex?: number;
}

export interface ValidationResult {
  ok: boolean;
  plan?: TreatmentPlanV1;
  issues: ValidationIssue[];
}

const STAGE_ORDER = ['repair', 'noise', 'tone', 'events', 'dynamics', 'finish'] as const;

const ALLOWED_OPS_BY_STAGE: Record<Stage['stage'], Set<Operation['kind']>> = {
  repair:   new Set(['declip', 'declick', 'decrackle']),
  noise:    new Set(['denoise', 'dehum']),
  tone:     new Set(['eq', 'de_esser', 'de_plosive']),
  events:   new Set(['event_attenuate']),
  dynamics: new Set(['compressor']),
  finish:   new Set(['gain']),
};

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

export function validatePlan(rawPlan: unknown, report: AudioAnalysisReportV2): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Layer 1: STRUCTURAL (Zod)
  const parsed = TreatmentPlanV1Schema.safeParse(rawPlan);
  if (!parsed.success) {
    return {
      ok: false, issues: [
        ...parsed.error.errors.map<ValidationIssue>((e) => ({
          layer: 'structural', severity: 'reject',
          message: `${e.path.join('.') || '<root>'}: ${e.message}`,
        })),
      ],
    };
  }
  let plan = parsed.data;

  // Layer 2: IDENTITY (report/plan id link)
  if (plan.reportId !== report.reportId) {
    issues.push({ layer: 'identity', severity: 'clamp', message: `reportId mismatch: forçando ${report.reportId}` });
    plan = { ...plan, reportId: report.reportId };
  }

  // Layer 3+ operates per operation
  const eventIdSet = new Set(report.events.map((e) => e.id));
  const durationSec = report.source.durationSec;
  const cumulativeGainByRegion = new Map<string, number>();

  const cleanStages: Stage[] = [];
  for (const stage of plan.stages) {
    if (!STAGE_ORDER.includes(stage.stage)) {
      issues.push({ layer: 'structural', severity: 'drop', message: `stage desconhecido ${stage.stage} — descartado`, stage: stage.stage });
      continue;
    }
    const allowed = ALLOWED_OPS_BY_STAGE[stage.stage];
    const kept: Operation[] = [];
    for (let i = 0; i < stage.operations.length; i++) {
      const opRaw = stage.operations[i];
      let op: Operation = opRaw;

      // Layer 3: TEMPORAL
      if (op.region.startSec >= op.region.endSec) {
        issues.push({ layer: 'temporal', severity: 'drop', message: 'startSec >= endSec', stage: stage.stage, operationIndex: i });
        continue;
      }
      const clampedStart = clamp(op.region.startSec, 0, durationSec);
      const clampedEnd = clamp(op.region.endSec, clampedStart + 0.001, durationSec);
      const regionMs = (clampedEnd - clampedStart) * 1000;
      if (regionMs < TREATMENT_POLICY_V1.minRegionMs) {
        issues.push({ layer: 'temporal', severity: 'drop', message: `região curta ${regionMs.toFixed(1)}ms < ${TREATMENT_POLICY_V1.minRegionMs}ms`, stage: stage.stage, operationIndex: i });
        continue;
      }
      if ((clampedEnd - clampedStart) > TREATMENT_POLICY_V1.maxRegionSec) {
        issues.push({ layer: 'temporal', severity: 'clamp', message: `região >${TREATMENT_POLICY_V1.maxRegionSec}s truncada`, stage: stage.stage, operationIndex: i });
      }
      const fadeIn = clamp(op.region.fadeInMs, TREATMENT_POLICY_V1.regionFadeMsRange[0], TREATMENT_POLICY_V1.regionFadeMsRange[1]);
      const fadeOut = clamp(op.region.fadeOutMs, TREATMENT_POLICY_V1.regionFadeMsRange[0], TREATMENT_POLICY_V1.regionFadeMsRange[1]);
      op = { ...op, region: { startSec: clampedStart, endSec: Math.min(clampedEnd, clampedStart + TREATMENT_POLICY_V1.maxRegionSec), fadeInMs: fadeIn, fadeOutMs: fadeOut } };

      // Layer 4: STAGE/KIND compatibility + EVIDENCE for event_attenuate
      if (!allowed.has(op.kind)) {
        issues.push({ layer: 'structural', severity: 'drop', message: `${op.kind} não permitido em ${stage.stage}`, stage: stage.stage, operationIndex: i });
        continue;
      }
      if (op.kind === 'event_attenuate' && !eventIdSet.has(op.eventId)) {
        issues.push({ layer: 'evidence', severity: 'drop', message: `eventId "${op.eventId}" não existe no relatório`, stage: stage.stage, operationIndex: i });
        continue;
      }

      // Layer 5: PARAMS
      if (op.kind === 'gain') {
        const g = clamp(op.gainDb, TREATMENT_POLICY_V1.gainDbRange[0], TREATMENT_POLICY_V1.gainDbRange[1]);
        if (g !== op.gainDb) issues.push({ layer: 'params', severity: 'clamp', message: `gainDb ${op.gainDb} clampado para ${g}`, stage: stage.stage, operationIndex: i });
        op = { ...op, gainDb: g };
      }
      if (op.kind === 'event_attenuate') {
        const a = clamp(op.attenuationDb, TREATMENT_POLICY_V1.eventAttenuationDbRange[0], 0);
        if (a !== op.attenuationDb) issues.push({ layer: 'params', severity: 'clamp', message: `attenuationDb clampado para ${a}`, stage: stage.stage, operationIndex: i });
        op = { ...op, attenuationDb: a };
      }
      if ('amount' in op) {
        const a = clamp(op.amount, 0, 100);
        if (a !== op.amount) issues.push({ layer: 'params', severity: 'clamp', message: `amount clampado para ${a}`, stage: stage.stage, operationIndex: i });
        op = { ...op, amount: a } as Operation;
      }

      // Layer 6: CUMULATIVE (soma de ganhos na mesma região não pode passar de gainDbRange)
      if (op.kind === 'gain' || op.kind === 'event_attenuate') {
        const key = `${op.region.startSec.toFixed(2)}-${op.region.endSec.toFixed(2)}`;
        const prev = cumulativeGainByRegion.get(key) ?? 0;
        const delta = op.kind === 'gain' ? op.gainDb : op.attenuationDb;
        const sum = prev + delta;
        if (sum < TREATMENT_POLICY_V1.gainDbRange[0] || sum > TREATMENT_POLICY_V1.gainDbRange[1]) {
          issues.push({ layer: 'cumulative', severity: 'drop', message: `ganho cumulativo ${sum.toFixed(1)}dB fora da faixa`, stage: stage.stage, operationIndex: i });
          continue;
        }
        cumulativeGainByRegion.set(key, sum);
      }

      kept.push(op);
      if (kept.length >= TREATMENT_POLICY_V1.maxOperationsPerStage) {
        issues.push({ layer: 'cumulative', severity: 'drop', message: `estágio ${stage.stage} atingiu limite de operações — restantes descartadas`, stage: stage.stage });
        break;
      }
    }
    cleanStages.push({ stage: stage.stage, operations: kept });
  }

  // Layer 7: CONFLICTS — no plano completo, contar ops totais
  const totalOps = cleanStages.reduce((s, st) => s + st.operations.length, 0);
  if (totalOps > TREATMENT_POLICY_V1.maxTotalOperations) {
    issues.push({ layer: 'conflicts', severity: 'reject', message: `total de operações ${totalOps} excede ${TREATMENT_POLICY_V1.maxTotalOperations}` });
    return { ok: false, issues };
  }

  return { ok: true, plan: { ...plan, stages: cleanStages }, issues };
}