import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AudioParams, DEFAULT_PARAMS, DEFAULT_PROCESSING_PROFILE, LogEntry, MasterReport, ProcessingProfile, TrackReport } from '@/lib/audio/types';
import { runPipeline, PipelineInput } from '@/lib/audio/pipeline';
import { DetailedLogger } from '@/lib/audio/detailed-logger';
import { buildOneDriveFolderPath, sanitizeFilename, uploadEpisodeToOneDrive } from '@/lib/storage/onedrive';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';
import {
  loadAgenticFlag, runAgenticEpisode, buildAgenticVoiceProcessorFromSession,
  type AgenticOutcome, type AgenticStatus,
} from '@/lib/rivaldo-agent';

export type AgenticRunStatus =
  | 'off' | 'enabled_idle' | AgenticStatus;

export interface PipelineUploadOptions {
  enabled: boolean;
  episodeMaterialId?: string;
  episodeDate?: string; // YYYY-MM-DD
  /** When true, route the upload to Snakepit/Avulsos/YYYY-MM instead of the weekly folder. */
  isStandalone?: boolean;
}

interface RivaldoState {
  isProcessing: boolean;
  progress: number;
  progressLabel: string;
  logs: LogEntry[];
  trackReports: TrackReport[];
  masterReport: MasterReport | null;
  currentFilename: string;
  lastUpload: { fileId: string; webUrl: string; filename: string } | null;
  agenticStatus: AgenticRunStatus;
  agenticOutcome: AgenticOutcome | null;
}

interface RivaldoContextType extends RivaldoState {
  startPipeline: (input: PipelineInput, params: AudioParams, upload?: PipelineUploadOptions) => Promise<void>;
  addLog: (message: string, type?: LogEntry['type']) => void;
  clearState: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
const RivaldoContext = createContext<RivaldoContextType | null>(null);

export function RivaldoProvider({ children }: { children: React.ReactNode }) {
  const { updateMaterial } = useApp();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [trackReports, setTrackReports] = useState<TrackReport[]>([]);
  const [masterReport, setMasterReport] = useState<MasterReport | null>(null);
  const [currentFilename, setCurrentFilename] = useState('');
  const [lastUpload, setLastUpload] = useState<{ fileId: string; webUrl: string; filename: string } | null>(null);
  const [agenticStatus, setAgenticStatus] = useState<AgenticRunStatus>('off');
  const [agenticOutcome, setAgenticOutcome] = useState<AgenticOutcome | null>(null);
  const processingRef = useRef(false);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs((prev) => [...prev, { timestamp: Date.now(), message, type }]);
  }, []);

  const clearState = useCallback(() => {
    setLogs([]);
    setTrackReports([]);
    setMasterReport(null);
    setProgress(0);
    setProgressLabel('');
    setCurrentFilename('');
    setLastUpload(null);
    setAgenticOutcome(null);
    setAgenticStatus('off');
  }, []);

  const startPipeline = useCallback(async (input: PipelineInput, params: AudioParams, upload?: PipelineUploadOptions) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    setProgress(0);
    setLogs([]);
    setTrackReports([]);
    setMasterReport(null);
    setLastUpload(null);
    setCurrentFilename(input.filename);
    setAgenticOutcome(null);
    setAgenticStatus('off');

    const dlog = new DetailedLogger();
    dlog.resetClock();
    const startedIso = new Date().toISOString();
    let finalStatus: 'SUCCESS' | 'ERROR' = 'SUCCESS';
    let errorMessage: string | undefined;

    try {
      const uploadEnabled = upload?.enabled ?? false;
      const agenticEnabled = await loadAgenticFlag().catch((e) => {
        addLog(`Aviso: falha ao ler flag Agentic (${e instanceof Error ? e.message : 'erro'}) — usando OFF.`, 'error');
        return false;
      });

      let agenticProcessor: ReturnType<typeof buildAgenticVoiceProcessorFromSession> = null;
      let outcome: AgenticOutcome | null = null;

      if (agenticEnabled) {
        setAgenticStatus('enabled_idle');
        addLog('Rivaldo Agentic V1 ativo — 1 chamada por episódio.', 'step');
        dlog.log('pipeline', 'step', 'Rivaldo Agentic V1 ON: analyze all → 1 plan call → validate → execute local');

        // Coleta as tracks de voz do input (multi ou single).
        const trackFiles = input.masterMode === 'multi' && input.masterTracks?.length
          ? input.masterTracks.map((f, i) => ({ id: `${i}-${f.name}`, name: f.name, file: f }))
          : (input.master ? [{ id: 'single-master', name: input.master.name, file: input.master }] : []);

        outcome = await runAgenticEpisode(
          input.filename || `episode-${Date.now()}`,
          trackFiles,
          (evt) => {
            setAgenticStatus(evt.status);
            setProgressLabel(evt.message);
            addLog(`[agentic] ${evt.message}`, evt.status === 'agentic_success' ? 'success' : 'info');
            dlog.log('agentic', evt.status === 'agentic_success' ? 'success' : 'step', evt.message);
          },
        );
        setAgenticOutcome(outcome);

        if (outcome.mode === 'agentic') {
          agenticProcessor = buildAgenticVoiceProcessorFromSession(outcome);
          dlog.log('agentic', 'success', `Planner OK — requestId=${outcome.requestId}, ops=${outcome.acceptedOperations}, tracks=${outcome.analysisIds.length}, hash=${outcome.planHash}`, {
            data: { model: outcome.envelope.model, usage: outcome.envelope.usage, durationMs: outcome.envelope.durationMs },
          });
          // Wave E: seções estruturadas no export log
          dlog.attachData('[AGENTIC STATUS]', {
            mode: 'agentic',
            episodeId: outcome.episodeId,
            requestId: outcome.requestId,
            planHash: outcome.planHash,
            acceptedOperations: outcome.acceptedOperations,
            tracks: outcome.analysisIds.length,
            plannerDigest: outcome.plannerDigest,
          });
          dlog.attachData('[PLANNER DIGEST]', outcome.plannerDigest);
          dlog.attachData('[ANALYSIS]', outcome.envelope.plan.trackPlans.map((tp, i) => ({
            reportId: tp.reportId,
            operationsPlanned: tp.plan.stages.reduce((s, st) => s + st.operations.length, 0),
          })));
          dlog.attachData('[PLANNER PLAN]', {
            episodeSummary: outcome.envelope.plan.summary,
            model: outcome.envelope.plan.modelUsed,
            tracks: outcome.envelope.plan.trackPlans.map((trackPlan) => ({
              reportId: trackPlan.reportId,
              planId: trackPlan.plan.planId,
              summary: trackPlan.plan.summary,
              predictedFinalLoudness: trackPlan.plan.predictedFinalLoudness,
              stages: trackPlan.plan.stages.map((stage) => ({
                stage: stage.stage,
                operationCount: stage.operations.length,
                operations: stage.operations.map((operation, operationIndex) => ({
                  operationIndex,
                  ...operation,
                })),
              })),
            })),
          });
          const appliedOperations = outcome.executedPlans.flatMap((trackPlan) =>
            trackPlan.plan.stages.flatMap((stage) =>
              stage.operations.map((operation, operationIndex) => ({
                reportId: trackPlan.reportId,
                stage: stage.stage,
                operationIndex,
                ...operation,
              })),
            ),
          );
          dlog.attachData('[APPLIED OPERATIONS]', {
            total: appliedOperations.length,
            byKind: appliedOperations.reduce<Record<string, number>>((counts, operation) => {
              counts[operation.kind] = (counts[operation.kind] ?? 0) + 1;
              return counts;
            }, {}),
            operations: appliedOperations,
          });
          dlog.attachData('[OPENROUTER PLANNING]', {
            requestId: outcome.envelope.requestId,
            model: outcome.envelope.model,
            durationMs: outcome.envelope.durationMs,
            usage: outcome.envelope.usage,
          });
          dlog.attachData('[VALIDATION]', {
            issues: outcome.issues,
            accepted: outcome.acceptedOperations,
          });
          dlog.attachData('[LOCAL EXECUTION]', Array.from(outcome.treatedByTrackId.entries()).map(([id, t]) => ({
            trackId: id,
            trackName: t.report.trackName,
            metricsBefore: t.report.metricsBefore,
            metricsAfter: t.report.metricsAfter,
            events: t.report.events,
          })));
          dlog.attachData('[ARTIFACTS]', {
            requestId: outcome.envelope.requestId,
            planHash: outcome.planHash,
            trackIds: Array.from(outcome.treatedByTrackId.keys()),
          });
        } else {
          setAgenticStatus('legacy_fallback');
          addLog(`Fallback legado: ${outcome.failedStage} — ${outcome.message}`, 'error');
          dlog.log('agentic', 'error', `Fallback ${outcome.failedStage}/${outcome.reasonCode}: ${outcome.message}`, {
            data: outcome.envelope ? { requestId: outcome.envelope.requestId } : undefined,
          });
          dlog.attachData('[AGENTIC STATUS]', {
            mode: 'fallback',
            failedStage: outcome.failedStage,
            reasonCode: outcome.reasonCode,
            message: outcome.message,
            requestId: outcome.envelope?.requestId,
            plannerDigest: outcome.plannerDigest,
          });
          if (outcome.plannerDigest) {
            dlog.attachData('[PLANNER DIGEST]', outcome.plannerDigest);
          }
          if (outcome.partialReports) {
            dlog.attachData('[ANALYSIS]', outcome.partialReports.map((r) => ({
              reportId: r.reportId,
              durationSec: r.source.durationSec,
              speechRatio: r.speech.ratio,
              noiseFloorDbfs: r.noise.floorDbfs,
              events: r.events.length,
            })));
          }
          if (outcome.envelope) {
            dlog.attachData('[OPENROUTER PLANNING]', {
              requestId: outcome.envelope.requestId,
              model: outcome.envelope.model,
              durationMs: outcome.envelope.durationMs,
              usage: outcome.envelope.usage,
            });
          }
          dlog.attachData('[VALIDATION]', { failedAt: outcome.failedStage, reason: outcome.reasonCode });
          dlog.attachData('[LOCAL EXECUTION]', { skipped: true, reason: 'fallback_to_legacy' });
          dlog.attachData('[ARTIFACTS]', { fallback: true });
        }
      } else {
        dlog.attachData('[AGENTIC STATUS]', { mode: 'off', reason: 'flag_disabled' });
      }

      const result = await runPipeline(
        input,
        params,
        (value, label) => { setProgress(value); setProgressLabel(label); },
        (message, type) => { setLogs(prev => [...prev, { timestamp: Date.now(), message, type: type || 'info' }]); },
        {
          exportMode: uploadEnabled ? 'blob' : 'download',
          returnFinalBuffer: false,
          logger: dlog,
          ...(agenticProcessor ? { processVoiceBuffer: agenticProcessor } : {}),
        }
      );
      setTrackReports(result.trackReports);
      setMasterReport(result.masterReport);

      if (uploadEnabled && result.outputBlob) {
        try {
          addLog('Enviando para OneDrive...', 'step');
          dlog.log('upload', 'step', 'Iniciando upload para OneDrive');
          setProgressLabel('Enviando para OneDrive...');
          const folderPath = buildOneDriveFolderPath({ episodeDate: upload?.episodeDate, isStandalone: upload?.isStandalone });
          const filename = sanitizeFilename(input.filename);
          const uploaded = await uploadEpisodeToOneDrive({
            folderPath,
            filename,
            blob: result.outputBlob,
            onProgress: ({ fraction }) => {
              setProgress(95 + fraction * 5);
              setProgressLabel(`Upload OneDrive ${Math.round(fraction * 100)}%`);
            },
          });
          setLastUpload(uploaded);
          addLog(`OneDrive: ${uploaded.filename} (${(uploaded.size / 1024 / 1024).toFixed(1)} MB)`, 'success');
          dlog.log('upload', 'success', `OneDrive: ${uploaded.filename} (${(uploaded.size / 1024 / 1024).toFixed(2)} MB)`, { data: { folderPath, webUrl: uploaded.webUrl, fileId: uploaded.fileId } });

          if (upload?.episodeMaterialId) {
            try {
              updateMaterial(upload.episodeMaterialId, {
                repository_provider: 'onedrive',
                repository_url: uploaded.webUrl,
                repository_file_id: uploaded.fileId,
                repository_uploaded_at: new Date().toISOString(),
              });
              addLog('Link salvo no episódio', 'success');
              dlog.log('materials', 'success', `Link salvo no episode_material ${upload.episodeMaterialId}`);
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'erro desconhecido';
              addLog(`Aviso: falha em sincronizar materials (${msg})`, 'error');
              dlog.log('materials', 'error', `Aviso: falha em sincronizar materials (${msg})`);
            }
          }
        } catch (uploadErr) {
          const msg = uploadErr instanceof Error ? uploadErr.message : 'Falha no upload OneDrive';
          addLog(`OneDrive: ${msg}`, 'error');
          dlog.log('upload', 'error', `OneDrive falhou: ${msg}`);
        }
      }

      addLog('Memória liberada após export', 'info');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro no pipeline 3.2';
      addLog(msg, 'error');
      finalStatus = 'ERROR';
      errorMessage = msg;
      dlog.log('pipeline', 'error', `Pipeline abortado: ${msg}`, { data: { stack: error instanceof Error ? error.stack : undefined } });
    } finally {
      setIsProcessing(false);
      processingRef.current = false;
      const finishedIso = new Date().toISOString();
      const ts = startedIso.replace(/[:.]/g, '-');
      const safeName = (input.filename || 'rivaldo').replace(/[^A-Za-z0-9._-]+/g, '_');
      dlog.download(`rivaldo_single__${safeName}__${ts}__${finalStatus}`, {
        filename: input.filename,
        mode: 'single',
        startedIso,
        finishedIso,
        status: finalStatus,
        pipelineVersion: '3.2',
        errorMessage,
      });
    }
  }, [addLog, updateMaterial]);

  return (
    <RivaldoContext.Provider value={{
      isProcessing, progress, progressLabel, logs, trackReports, masterReport, currentFilename, lastUpload,
      agenticStatus, agenticOutcome,
      startPipeline, addLog, clearState,
    }}>
      {children}
    </RivaldoContext.Provider>
  );
}

export function useRivaldo() {
  const ctx = useContext(RivaldoContext);
  if (!ctx) throw new Error('useRivaldo must be used within RivaldoProvider');
  return ctx;
}
