/**
 * Rivaldo Agentic V1 — Session orchestrator (Wave B).
 *
 * Uma única chamada por episódio:
 *   decode masters → analyze all (paralelo) → 1 POST planner → validate →
 *   execute per track → devolve mapa nomeTrack → { buffer, report } + outcome.
 *
 * Se qualquer estágio falhar, o outcome discrimina onde e por quê. O
 * consumidor decide se aplica o fallback legado (o processVoiceBuffer
 * default do pipeline já é o worker legado).
 */
import { decodeFile, audioBufferToMonoData, monoDataToAudioBuffer } from '@/lib/audio/decoder';
import { detectClippedSamples, gainToDb, peak, rms } from '@/lib/audio/dsp';
import type { TrackReport } from '@/lib/audio/types';

import { AnalyzerClient } from './analysis/analyzer-client';
import { requestEpisodeTreatmentPlan } from './planner/client';
import { validatePlan, type ValidationIssue } from './planner/validate';
import { executePlan } from './executor/execute';
import type { AudioAnalysisReportV2 } from './contracts/report-v2';
import type { EpisodePlanV1, PlannerEnvelope } from './contracts/episode-plan-v1';

const AGENT_SR = 48000;

export interface AgenticTrackInput { id: string; name: string; file: File; }

export interface AgenticTreatedTrack { buffer: AudioBuffer; report: TrackReport; }

export type AgenticFailedStage = 'analysis' | 'planning' | 'validation' | 'execution';

export type AgenticOutcome =
  | {
      mode: 'agentic';
      requestId: string;
      episodeId: string;
      analysisIds: string[];
      planHash: string;
      acceptedOperations: number;
      envelope: PlannerEnvelope;
      treatedByTrackId: Map<string, AgenticTreatedTrack>;
      issues: ValidationIssue[];
    }
  | {
      mode: 'fallback';
      failedStage: AgenticFailedStage;
      reasonCode: string;
      message: string;
      /** Reports coletados até o ponto de falha, quando disponíveis. */
      partialReports?: AudioAnalysisReportV2[];
      envelope?: PlannerEnvelope;
    };

export type AgenticStatus =
  | 'analyzing' | 'planning' | 'validating' | 'executing'
  | 'agentic_success' | 'legacy_fallback' | 'failed';

export interface AgenticStatusEvent {
  status: AgenticStatus;
  message: string;
  progress?: number;
}

function trackReportFromExec(
  name: string,
  before: Float32Array,
  after: Float32Array,
  sampleRate: number,
  reportV2: AudioAnalysisReportV2,
  perStage: Record<string, number>,
): TrackReport {
  const peakBefore = gainToDb(Math.max(peak(before), 1e-6));
  const peakAfter = gainToDb(Math.max(peak(after), 1e-6));
  const rmsBefore = gainToDb(Math.max(rms(before), 1e-6));
  const rmsAfter = gainToDb(Math.max(rms(after), 1e-6));
  return {
    trackName: name,
    dereverbApplied: false, // Wave A removeu dereverb
    dereverbMode: 'auto',
    reverbScoreBefore: reportV2.acoustics.rt60EstSec,
    reverbScoreAfter: reportV2.acoustics.rt60EstSec,
    metricsBefore: {
      durationSec: before.length / sampleRate, sampleRate,
      peakDbfs: peakBefore, clippedSamples: detectClippedSamples(before),
      speechRatio: reportV2.speech.ratio, mutedRatio: 0,
      noiseScore: -reportV2.noise.floorDbfs, reverbScore: reportV2.acoustics.rt60EstSec,
      loudness: { rmsDb: rmsBefore, lufs: rmsBefore - 0.691, truePeakDbtp: peakBefore },
    },
    metricsAfter: {
      durationSec: after.length / sampleRate, sampleRate,
      peakDbfs: peakAfter, clippedSamples: detectClippedSamples(after),
      speechRatio: reportV2.speech.ratio, mutedRatio: 0,
      noiseScore: -reportV2.noise.floorDbfs, reverbScore: reportV2.acoustics.rt60EstSec,
      loudness: { rmsDb: rmsAfter, lufs: rmsAfter - 0.691, truePeakDbtp: peakAfter },
    },
    events: {
      clippedSegments: reportV2.events.filter((e) => e.type === 'clipping').length,
      declickEvents: perStage['repair'] ?? 0, decrackleEvents: 0,
      breathsReduced: reportV2.events.filter((e) => e.type === 'breath').length,
      deEssEvents: reportV2.events.filter((e) => e.type === 'sibilance').length,
      dePlosiveEvents: reportV2.events.filter((e) => e.type === 'plosive').length,
    },
    timings: [],
  };
}

function hashPlan(plan: EpisodePlanV1): string {
  const summary = plan.trackPlans.map((tp) => `${tp.reportId}:${tp.plan.stages.reduce((s, st) => s + st.operations.length, 0)}`).join('|');
  return `${plan.trackPlans.length}#${summary}`;
}

/**
 * Executa o episódio inteiro em modo agentic. NUNCA lança — devolve outcome
 * discriminado para o chamador decidir fallback.
 */
export async function runAgenticEpisode(
  episodeId: string,
  tracks: AgenticTrackInput[],
  onStatus: (evt: AgenticStatusEvent) => void,
): Promise<AgenticOutcome> {
  if (tracks.length === 0) {
    return { mode: 'fallback', failedStage: 'analysis', reasonCode: 'no_tracks', message: 'Nenhuma track de voz recebida.' };
  }

  // --- Stage 1: decode + analyze (paralelo) ---
  onStatus({ status: 'analyzing', message: `Analisando ${tracks.length} track(s) localmente…`, progress: 0.05 });
  let reports: AudioAnalysisReportV2[] = [];
  let decodedMonos: Float32Array[] = [];
  const analyzer = new AnalyzerClient();
  try {
    const decoded = await Promise.all(tracks.map((t) => decodeFile(t.file).then((buf) => audioBufferToMonoData(buf, AGENT_SR))));
    decodedMonos = decoded;
    // Wave C: análise em worker (transfer buffer). Enviamos cópia para preservar
    // o mono original para o executor local.
    reports = await Promise.all(decoded.map((mono, i) => {
      const copy = new Float32Array(mono); // transferable clone
      return analyzer.analyze(
        { channelData: copy, sampleRate: AGENT_SR, filename: tracks[i].name, channels: 1 },
        (p, stage) => onStatus({ status: 'analyzing', message: `[${tracks[i].name}] ${stage}`, progress: 0.05 + p * 0.25 }),
      );
    }));
  } catch (err) {
    analyzer.terminate();
    return { mode: 'fallback', failedStage: 'analysis', reasonCode: 'analyze_failed', message: err instanceof Error ? err.message : 'analyze_failed' };
  } finally {
    // worker liberado após análises paralelas
  }
  analyzer.terminate();

  // --- Stage 2: 1 planner call ---
  onStatus({ status: 'planning', message: 'Chamando planner (1 requisição por episódio)…', progress: 0.35 });
  let envelope: PlannerEnvelope;
  try {
    envelope = await requestEpisodeTreatmentPlan({ episodeId, reports });
  } catch (err) {
    return { mode: 'fallback', failedStage: 'planning', reasonCode: 'planner_error', message: err instanceof Error ? err.message : 'planner_error', partialReports: reports };
  }
  if (!envelope.requestId) {
    return { mode: 'fallback', failedStage: 'planning', reasonCode: 'planner_missing_request_id', message: 'Planner retornou sem requestId real.', partialReports: reports, envelope };
  }

  // --- Stage 3: validate per track (defense in depth; EF já validou) ---
  onStatus({ status: 'validating', message: 'Validando plano em 7 camadas por track…', progress: 0.55 });
  const collectedIssues: ValidationIssue[] = [];
  const validatedTrackPlans: { reportId: string; plan: EpisodePlanV1['trackPlans'][number]['plan'] }[] = [];
  for (const tp of envelope.plan.trackPlans) {
    const report = reports.find((r) => r.reportId === tp.reportId);
    if (!report) {
      collectedIssues.push({ layer: 'identity', severity: 'drop', message: `sem report para ${tp.reportId}` });
      continue;
    }
    const v = validatePlan(tp.plan, report);
    collectedIssues.push(...v.issues);
    if (!v.ok || !v.plan) continue;
    validatedTrackPlans.push({ reportId: tp.reportId, plan: v.plan });
  }
  if (validatedTrackPlans.length !== reports.length) {
    return { mode: 'fallback', failedStage: 'validation', reasonCode: 'plan_incomplete_after_validation', message: 'Um ou mais trackPlans falharam na validação.', partialReports: reports, envelope };
  }

  // --- Stage 4: execute per track ---
  onStatus({ status: 'executing', message: 'Executando tratamento local por track…', progress: 0.7 });
  const treatedByTrackId = new Map<string, AgenticTreatedTrack>();
  let acceptedOperations = 0;
  try {
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const report = reports[i];
      const vplan = validatedTrackPlans.find((v) => v.reportId === report.reportId);
      if (!vplan) throw new Error(`missing_plan_for_${report.reportId}`);
      const before = new Float32Array(decodedMonos[i]);
      const executed = executePlan(decodedMonos[i], AGENT_SR, vplan.plan, () => { /* progress per stage handled elsewhere */ });
      acceptedOperations += vplan.plan.stages.reduce((s, st) => s + st.operations.length, 0);
      const trackReport = trackReportFromExec(track.name, before, executed.channelData, AGENT_SR, report, executed.perStage);
      treatedByTrackId.set(track.id, {
        buffer: monoDataToAudioBuffer(executed.channelData, AGENT_SR),
        report: trackReport,
      });
    }
  } catch (err) {
    return { mode: 'fallback', failedStage: 'execution', reasonCode: 'executor_error', message: err instanceof Error ? err.message : 'executor_error', partialReports: reports, envelope };
  }

  if (acceptedOperations === 0) {
    return { mode: 'fallback', failedStage: 'validation', reasonCode: 'no_accepted_operations', message: 'Planner devolveu zero operações válidas.', partialReports: reports, envelope };
  }

  onStatus({ status: 'agentic_success', message: `Agentic executado — ${acceptedOperations} operações aplicadas.`, progress: 1 });
  return {
    mode: 'agentic',
    requestId: envelope.requestId,
    episodeId,
    analysisIds: reports.map((r) => r.reportId),
    planHash: hashPlan(envelope.plan),
    acceptedOperations,
    envelope,
    treatedByTrackId,
    issues: collectedIssues,
  };
}