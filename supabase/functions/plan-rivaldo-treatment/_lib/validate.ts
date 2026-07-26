import {
  TreatmentPlanV1Schema, POLICY,
  type TreatmentPlanV1, type Operation, type Stage,
} from './schemas.ts';
import type { AudioAnalysisReportV2 } from './schemas.ts';

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

const STAGE_ORDER = ['repair','noise','tone','events','dynamics','finish'] as const;
const ALLOWED_OPS_BY_STAGE: Record<Stage['stage'], Set<Operation['kind']>> = {
  repair:   new Set(['declip','declick','decrackle']),
  noise:    new Set(['denoise','dehum']),
  tone:     new Set(['eq','de_esser','de_plosive']),
  events:   new Set(['event_attenuate']),
  dynamics: new Set(['compressor']),
  finish:   new Set(['gain']),
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function validatePlan(raw: unknown, report: AudioAnalysisReportV2): ValidationResult {
  const issues: ValidationIssue[] = [];
  const parsed = TreatmentPlanV1Schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.errors.map((e) => ({
      layer: 'structural', severity: 'reject',
      message: `${e.path.join('.') || '<root>'}: ${e.message}`,
    })) };
  }
  let plan = parsed.data;
  if (plan.reportId !== report.reportId) {
    issues.push({ layer: 'identity', severity: 'clamp', message: `reportId mismatch: forçado` });
    plan = { ...plan, reportId: report.reportId };
  }
  const eventIds = new Set(report.events.map((e) => e.id));
  const durationSec = report.source.durationSec;
  const cumByRegion = new Map<string, number>();

  const cleanStages: Stage[] = [];
  for (const st of plan.stages) {
    if (!STAGE_ORDER.includes(st.stage)) {
      issues.push({ layer: 'structural', severity: 'drop', message: `stage desconhecido`, stage: st.stage });
      continue;
    }
    const allowed = ALLOWED_OPS_BY_STAGE[st.stage];
    const kept: Operation[] = [];
    for (let i = 0; i < st.operations.length; i++) {
      let op = st.operations[i];
      if (op.region.startSec >= op.region.endSec) {
        issues.push({ layer: 'temporal', severity: 'drop', message: 'startSec>=endSec', stage: st.stage, operationIndex: i });
        continue;
      }
      const s = clamp(op.region.startSec, 0, durationSec);
      const e = clamp(op.region.endSec, s + 0.001, durationSec);
      const ms = (e - s) * 1000;
      if (ms < POLICY.minRegionMs) {
        issues.push({ layer: 'temporal', severity: 'drop', message: `região ${ms.toFixed(1)}ms muito curta`, stage: st.stage, operationIndex: i });
        continue;
      }
      if ((e - s) > POLICY.maxRegionSec) issues.push({ layer: 'temporal', severity: 'clamp', message: 'região truncada', stage: st.stage, operationIndex: i });
      op = { ...op, region: {
        startSec: s,
        endSec: Math.min(e, s + POLICY.maxRegionSec),
        fadeInMs: clamp(op.region.fadeInMs, POLICY.regionFadeMsRange[0], POLICY.regionFadeMsRange[1]),
        fadeOutMs: clamp(op.region.fadeOutMs, POLICY.regionFadeMsRange[0], POLICY.regionFadeMsRange[1]),
      }};
      if (!allowed.has(op.kind)) {
        issues.push({ layer: 'structural', severity: 'drop', message: `${op.kind} não permitido em ${st.stage}`, stage: st.stage, operationIndex: i });
        continue;
      }
      if (op.kind === 'event_attenuate' && !eventIds.has(op.eventId)) {
        issues.push({ layer: 'evidence', severity: 'drop', message: `eventId "${op.eventId}" ausente`, stage: st.stage, operationIndex: i });
        continue;
      }
      if (op.kind === 'gain') {
        const g = clamp(op.gainDb, POLICY.gainDbRange[0], POLICY.gainDbRange[1]);
        if (g !== op.gainDb) issues.push({ layer: 'params', severity: 'clamp', message: `gainDb ${op.gainDb}→${g}`, stage: st.stage, operationIndex: i });
        op = { ...op, gainDb: g };
      }
      if (op.kind === 'event_attenuate') {
        const a = clamp(op.attenuationDb, POLICY.eventAttenuationDbRange[0], 0);
        if (a !== op.attenuationDb) issues.push({ layer: 'params', severity: 'clamp', message: `attenuationDb clampado`, stage: st.stage, operationIndex: i });
        op = { ...op, attenuationDb: a };
      }
      if ('amount' in op) {
        const a = clamp(op.amount, 0, 100);
        if (a !== op.amount) issues.push({ layer: 'params', severity: 'clamp', message: `amount clampado`, stage: st.stage, operationIndex: i });
        op = { ...op, amount: a } as Operation;
      }
      if (op.kind === 'gain' || op.kind === 'event_attenuate') {
        const key = `${op.region.startSec.toFixed(2)}-${op.region.endSec.toFixed(2)}`;
        const prev = cumByRegion.get(key) ?? 0;
        const delta = op.kind === 'gain' ? op.gainDb : op.attenuationDb;
        const sum = prev + delta;
        if (sum < POLICY.gainDbRange[0] || sum > POLICY.gainDbRange[1]) {
          issues.push({ layer: 'cumulative', severity: 'drop', message: `soma ${sum.toFixed(1)}dB fora`, stage: st.stage, operationIndex: i });
          continue;
        }
        cumByRegion.set(key, sum);
      }
      kept.push(op);
      if (kept.length >= POLICY.maxOperationsPerStage) {
        issues.push({ layer: 'cumulative', severity: 'drop', message: `${st.stage}: limite de ops`, stage: st.stage });
        break;
      }
    }
    cleanStages.push({ stage: st.stage, operations: kept });
  }
  const total = cleanStages.reduce((s, st) => s + st.operations.length, 0);
  if (total > POLICY.maxTotalOperations) {
    issues.push({ layer: 'conflicts', severity: 'reject', message: `total ${total} > ${POLICY.maxTotalOperations}` });
    return { ok: false, issues };
  }
  return { ok: true, plan: { ...plan, stages: cleanStages }, issues };
}