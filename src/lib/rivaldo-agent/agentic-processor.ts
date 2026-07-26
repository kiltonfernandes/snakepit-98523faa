/**
 * Rivaldo Agentic V1 — processor de voz completo.
 *
 * Implementa `VoiceBufferProcessor` do pipeline atual seguindo o fluxo:
 *   1. Extrai áudio mono @ sampleRate original do AudioBuffer.
 *   2. Roda análise local V2 (loudness/spectrum/vad/noise/events).
 *   3. Envia o report compacto ao planner (OpenRouter via edge function).
 *   4. Valida o plano nos 7 layers (validatePlan).
 *   5. Executa localmente estágio por estágio.
 *   6. Verifica loudness pós-execução.
 *   7. Monta um TrackReport legado para consumo do pipeline atual.
 *
 * Cai automaticamente no worker legado se qualquer etapa falhar — o
 * usuário nunca fica sem áudio processado.
 */
import { monoDataToAudioBuffer, audioBufferToMonoData } from '@/lib/audio/decoder';
import type { VoiceProcessContext } from '@/lib/audio/pipeline';
import type { TrackReport } from '@/lib/audio/types';
import { detectClippedSamples, gainToDb, peak, rms } from '@/lib/audio/dsp';
import { VoiceWorkerClient } from '@/lib/audio/voice-worker-client';

import { analyzeAudio } from './analysis/analyze';
import { requestTreatmentPlan } from './planner/client';
import { validatePlan } from './planner/validate';
import { executePlan } from './executor/execute';
import { verifyExecution } from './executor/verify';
import type { AudioAnalysisReportV2 } from './contracts/report-v2';

const AGENT_SR = 48000;

function buildLegacyTrackReport(
  name: string,
  before: Float32Array,
  after: Float32Array,
  sampleRate: number,
  reportV2: AudioAnalysisReportV2,
  execSummary: { operationsApplied: number; perStage: Record<string, number> },
  durationsMs: Record<string, number>,
): TrackReport {
  const peakBefore = gainToDb(Math.max(peak(before), 1e-6));
  const peakAfter = gainToDb(Math.max(peak(after), 1e-6));
  const rmsBefore = gainToDb(Math.max(rms(before), 1e-6));
  const rmsAfter = gainToDb(Math.max(rms(after), 1e-6));
  const lufsBefore = rmsBefore - 0.691;
  const lufsAfter = rmsAfter - 0.691;
  return {
    trackName: name,
    dereverbApplied: (execSummary.perStage['tone'] ?? 0) > 0 || (execSummary.perStage['noise'] ?? 0) > 0,
    dereverbMode: 'auto',
    reverbScoreBefore: reportV2.acoustics.rt60EstSec,
    reverbScoreAfter: reportV2.acoustics.rt60EstSec, // pós-análise seria ideal; para não gastar CPU, mantemos o antes
    metricsBefore: {
      durationSec: before.length / sampleRate,
      sampleRate,
      peakDbfs: peakBefore,
      clippedSamples: detectClippedSamples(before),
      speechRatio: reportV2.speech.ratio,
      mutedRatio: 0,
      noiseScore: -reportV2.noise.floorDbfs,
      reverbScore: reportV2.acoustics.rt60EstSec,
      loudness: { rmsDb: rmsBefore, lufs: lufsBefore, truePeakDbtp: peakBefore },
    },
    metricsAfter: {
      durationSec: after.length / sampleRate,
      sampleRate,
      peakDbfs: peakAfter,
      clippedSamples: detectClippedSamples(after),
      speechRatio: reportV2.speech.ratio,
      mutedRatio: 0,
      noiseScore: -reportV2.noise.floorDbfs,
      reverbScore: reportV2.acoustics.rt60EstSec,
      loudness: { rmsDb: rmsAfter, lufs: lufsAfter, truePeakDbtp: peakAfter },
    },
    events: {
      clippedSegments: reportV2.events.filter((e) => e.type === 'clipping').length,
      declickEvents: execSummary.perStage['repair'] ?? 0,
      decrackleEvents: 0,
      breathsReduced: reportV2.events.filter((e) => e.type === 'breath').length,
      deEssEvents: reportV2.events.filter((e) => e.type === 'sibilance').length,
      dePlosiveEvents: reportV2.events.filter((e) => e.type === 'plosive').length,
    },
    timings: Object.entries(durationsMs).map(([stage, durationMs]) => ({ stage, durationMs })),
  };
}

/** Fallback: usa o worker legado (VoiceWorkerClient) para não quebrar o export. */
async function fallbackToLegacyWorker(context: VoiceProcessContext): Promise<{ buffer: AudioBuffer; report: TrackReport }> {
  const worker = new VoiceWorkerClient();
  try {
    const mono = audioBufferToMonoData(context.buffer, AGENT_SR);
    const result = await worker.process(
      {
        id: context.id,
        name: context.name,
        sampleRate: AGENT_SR,
        channelData: mono,
        profile: context.profile,
        audioParams: context.audioParams,
        smartMuteEnabled: context.smartMuteEnabled,
      },
      (fraction, label) => context.onProgress((context.progressBase + context.progressSpan * fraction) * 100, `${context.name} (fallback): ${label}`),
    );
    return { buffer: monoDataToAudioBuffer(result.channelData, result.sampleRate), report: result.report };
  } finally {
    worker.terminate();
  }
}

export async function agenticVoiceProcessor(context: VoiceProcessContext): Promise<{ buffer: AudioBuffer; report: TrackReport }> {
  const { name, buffer, progressBase, progressSpan, onProgress } = context;
  const step = (fraction: number, label: string) => onProgress((progressBase + progressSpan * Math.max(0, Math.min(1, fraction))) * 100, `${name} [agentic]: ${label}`);
  const durations: Record<string, number> = {};
  const stopwatch = (label: string, fn: () => void) => { const t = performance.now(); fn(); durations[label] = performance.now() - t; };

  try {
    step(0.02, 'preparando análise');
    const mono = audioBufferToMonoData(buffer, AGENT_SR);
    const before = new Float32Array(mono); // preserva o "antes" para métricas

    let report!: AudioAnalysisReportV2;
    stopwatch('analysis', () => {
      report = analyzeAudio({ channelData: mono, sampleRate: AGENT_SR, filename: name, channels: 1 }, (p) => step(0.05 + 0.35 * p.progress, `analyze:${p.stage}`));
    });

    step(0.42, 'consultando planner');
    const t0 = performance.now();
    const { plan, issues: plannerIssues } = await requestTreatmentPlan(report);
    durations['plan'] = performance.now() - t0;

    step(0.55, 'validando plano');
    const validation = validatePlan(plan, report);
    if (!validation.ok || !validation.plan) {
      throw new Error(`plan_invalid: ${validation.issues.map((i) => `${i.layer}/${i.severity}`).join(', ')}`);
    }
    for (const issue of [...plannerIssues, ...validation.issues]) {
      // eslint-disable-next-line no-console
      console.warn('[rivaldo-agent] validation issue:', issue);
    }

    let executed!: ReturnType<typeof executePlan>;
    stopwatch('execute', () => {
      executed = executePlan(mono, AGENT_SR, validation.plan!, (p) => step(0.6 + 0.3 * p.progress, p.stage));
    });

    step(0.94, 'verificando loudness');
    const verify = verifyExecution(executed.channelData, AGENT_SR, validation.plan);
    for (const issue of verify.issues) {
      // eslint-disable-next-line no-console
      console.warn('[rivaldo-agent] verify issue:', issue);
    }

    const outBuffer = monoDataToAudioBuffer(executed.channelData, AGENT_SR);
    const trackReport = buildLegacyTrackReport(name, before, executed.channelData, AGENT_SR, report, executed, durations);
    step(1, 'concluído');
    return { buffer: outBuffer, report: trackReport };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[rivaldo-agent] fallback for track', name, err);
    step(0.5, `fallback legado (${err instanceof Error ? err.message : 'erro'})`);
    return fallbackToLegacyWorker(context);
  }
}