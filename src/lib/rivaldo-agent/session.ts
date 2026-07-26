/**
 * Rivaldo Agentic V1 session orchestrator.
 *
 * Uma chamada por episódio:
 *   decode masters -> analyze all -> group findings -> 1 POST planner ->
 *   validate -> execute per track -> return treated buffers and outcome.
 */
import { decodeFile, audioBufferToMonoData, monoDataToAudioBuffer } from '@/lib/audio/decoder';
import { detectClippedSamples, gainToDb, peak, rms } from '@/lib/audio/dsp';
import type { TrackReport } from '@/lib/audio/types';

import { AnalyzerClient } from './analysis/analyzer-client';
import { requestEpisodeTreatmentPlan } from './planner/client';
import { buildPlannerDigest, type PlannerDigestStats } from './planner/findings';
import { validatePlan, type ValidationIssue } from './planner/validate';
import { ExecutorClient } from './executor/executor-client';
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
      plannerDigest: PlannerDigestStats;
      envelope: PlannerEnvelope;
      treatedByTrackId: Map<string, AgenticTreatedTrack>;
      issues: ValidationIssue[];
    }
  | {
      mode: 'fallback';
      failedStage: AgenticFailedStage;
      reasonCode: string;
      message: string;
      /** Reports completos coletados localmente até o ponto de falha. */
      partialReports?: AudioAnalysisReportV2[];
      plannerDigest?: PlannerDigestStats;
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
    dereverbApplied: false,
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
      clippedSegments: reportV2.events.filter((event) => event.type === 'clipping').length,
      declickEvents: perStage['repair'] ?? 0,
      decrackleEvents: 0,
      breathsReduced: reportV2.events.filter((event) => event.type === 'breath').length,
      deEssEvents: reportV2.events.filter((event) => event.type === 'sibilance').length,
      dePlosiveEvents: reportV2.events.filter((event) => event.type === 'plosive').length,
    },
    timings: [],
  };
}

function hashPlan(plan: EpisodePlanV1): string {
  const summary = plan.trackPlans
    .map((trackPlan) =>
      `${trackPlan.reportId}:${trackPlan.plan.stages.reduce(
        (sum, stage) => sum + stage.operations.length,
        0,
      )}`,
    )
    .join('|');
  return `${plan.trackPlans.length}#${summary}`;
}

/**
 * Executa o episódio inteiro em modo agentic. Nunca lança. O outcome
 * discriminado permite que o chamador aplique o fallback legado.
 */
export async function runAgenticEpisode(
  episodeId: string,
  tracks: AgenticTrackInput[],
  onStatus: (evt: AgenticStatusEvent) => void,
): Promise<AgenticOutcome> {
  if (tracks.length === 0) {
    return {
      mode: 'fallback',
      failedStage: 'analysis',
      reasonCode: 'no_tracks',
      message: 'Nenhuma track de voz recebida.',
    };
  }

  onStatus({
    status: 'analyzing',
    message: `Analisando ${tracks.length} track(s) localmente...`,
    progress: 0.05,
  });
  let reports: AudioAnalysisReportV2[] = [];
  let decodedMonos: Float32Array[] = [];
  const analyzer = new AnalyzerClient();
  try {
    decodedMonos = await Promise.all(
      tracks.map((track) =>
        decodeFile(track.file).then((buffer) => audioBufferToMonoData(buffer, AGENT_SR)),
      ),
    );
    reports = await Promise.all(
      decodedMonos.map((mono, index) => {
        const copy = new Float32Array(mono);
        return analyzer.analyze(
          {
            channelData: copy,
            sampleRate: AGENT_SR,
            filename: tracks[index].name,
            channels: 1,
          },
          (progress, stage) =>
            onStatus({
              status: 'analyzing',
              message: `[${tracks[index].name}] ${stage}`,
              progress: 0.05 + progress * 0.25,
            }),
        );
      }),
    );
  } catch (err) {
    analyzer.terminate();
    return {
      mode: 'fallback',
      failedStage: 'analysis',
      reasonCode: 'analyze_failed',
      message: err instanceof Error ? err.message : 'analyze_failed',
    };
  }
  analyzer.terminate();

  let plannerDigest;
  try {
    plannerDigest = buildPlannerDigest(episodeId, reports);
  } catch (err) {
    return {
      mode: 'fallback',
      failedStage: 'planning',
      reasonCode: 'planner_digest_failed',
      message: err instanceof Error ? err.message : 'planner_digest_failed',
      partialReports: reports,
    };
  }

  const digestKb = Math.ceil(plannerDigest.stats.payloadBytes / 1024);
  onStatus({
    status: 'planning',
    message:
      `Findings agrupados: ${plannerDigest.stats.sourceEvents.toLocaleString('pt-BR')} eventos locais ` +
      `-> ${plannerDigest.stats.groupedFindings} findings (${digestKb} KB). Chamando planner uma vez...`,
    progress: 0.35,
  });

  let envelope: PlannerEnvelope;
  try {
    envelope = await requestEpisodeTreatmentPlan({
      episodeId,
      reports: plannerDigest.reports,
    });
  } catch (err) {
    return {
      mode: 'fallback',
      failedStage: 'planning',
      reasonCode: 'planner_error',
      message: err instanceof Error ? err.message : 'planner_error',
      partialReports: reports,
      plannerDigest: plannerDigest.stats,
    };
  }
  if (!envelope.requestId) {
    return {
      mode: 'fallback',
      failedStage: 'planning',
      reasonCode: 'planner_missing_request_id',
      message: 'Planner retornou sem requestId real.',
      partialReports: reports,
      plannerDigest: plannerDigest.stats,
      envelope,
    };
  }

  onStatus({
    status: 'validating',
    message: 'Validando plano em 7 camadas por track...',
    progress: 0.55,
  });
  const collectedIssues: ValidationIssue[] = [];
  const validatedTrackPlans: {
    reportId: string;
    plan: EpisodePlanV1['trackPlans'][number]['plan'];
  }[] = [];

  for (const trackPlan of envelope.plan.trackPlans) {
    const report = plannerDigest.reports.find(
      (candidate) => candidate.reportId === trackPlan.reportId,
    );
    if (!report) {
      collectedIssues.push({
        layer: 'identity',
        severity: 'drop',
        message: `sem report para ${trackPlan.reportId}`,
      });
      continue;
    }
    const validation = validatePlan(trackPlan.plan, report);
    collectedIssues.push(...validation.issues);
    if (!validation.ok || !validation.plan) continue;
    validatedTrackPlans.push({
      reportId: trackPlan.reportId,
      plan: validation.plan,
    });
  }

  if (validatedTrackPlans.length !== reports.length) {
    return {
      mode: 'fallback',
      failedStage: 'validation',
      reasonCode: 'plan_incomplete_after_validation',
      message: 'Um ou mais trackPlans falharam na validação.',
      partialReports: reports,
      plannerDigest: plannerDigest.stats,
      envelope,
    };
  }

  onStatus({
    status: 'executing',
    message: 'Executando tratamento local por track...',
    progress: 0.7,
  });
  const treatedByTrackId = new Map<string, AgenticTreatedTrack>();
  let acceptedOperations = 0;
  const executor = new ExecutorClient();
  try {
    for (let index = 0; index < tracks.length; index++) {
      const track = tracks[index];
      const report = reports[index];
      const validated = validatedTrackPlans.find(
        (candidate) => candidate.reportId === report.reportId,
      );
      if (!validated) throw new Error(`missing_plan_for_${report.reportId}`);

      const before = new Float32Array(decodedMonos[index]);
      const buffer = new Float32Array(decodedMonos[index]);
      const executed = await executor.execute(
        { channelData: buffer, sampleRate: AGENT_SR, plan: validated.plan },
        (progress, stage) =>
          onStatus({
            status: 'executing',
            message: `[${track.name}] ${stage}`,
            progress: 0.7 + ((index + progress) / tracks.length) * 0.28,
          }),
      );
      acceptedOperations += validated.plan.stages.reduce(
        (sum, stage) => sum + stage.operations.length,
        0,
      );
      const trackReport = trackReportFromExec(
        track.name,
        before,
        executed.channelData,
        AGENT_SR,
        report,
        executed.perStage,
      );
      treatedByTrackId.set(track.id, {
        buffer: monoDataToAudioBuffer(executed.channelData, AGENT_SR),
        report: trackReport,
      });
    }
  } catch (err) {
    executor.terminate();
    return {
      mode: 'fallback',
      failedStage: 'execution',
      reasonCode: 'executor_error',
      message: err instanceof Error ? err.message : 'executor_error',
      partialReports: reports,
      plannerDigest: plannerDigest.stats,
      envelope,
    };
  }
  executor.terminate();

  if (acceptedOperations === 0) {
    return {
      mode: 'fallback',
      failedStage: 'validation',
      reasonCode: 'no_accepted_operations',
      message: 'Planner devolveu zero operações válidas.',
      partialReports: reports,
      plannerDigest: plannerDigest.stats,
      envelope,
    };
  }

  onStatus({
    status: 'agentic_success',
    message: `Agentic executado: ${acceptedOperations} operações aplicadas.`,
    progress: 1,
  });
  return {
    mode: 'agentic',
    requestId: envelope.requestId,
    episodeId,
    analysisIds: reports.map((report) => report.reportId),
    planHash: hashPlan(envelope.plan),
    acceptedOperations,
    plannerDigest: plannerDigest.stats,
    envelope,
    treatedByTrackId,
    issues: collectedIssues,
  };
}
