import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AudioParams, DEFAULT_PARAMS, DEFAULT_PROCESSING_PROFILE, LogEntry, MasterReport, ProcessingProfile, TrackReport } from '@/lib/audio/types';
import { runPipeline, PipelineInput } from '@/lib/audio/pipeline';
import { DetailedLogger } from '@/lib/audio/detailed-logger';
import { buildEpisodeFolderPath, sanitizeFilename, uploadEpisodeToOneDrive } from '@/lib/storage/onedrive';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';

export interface PipelineUploadOptions {
  enabled: boolean;
  episodeMaterialId?: string;
  episodeDate?: string; // YYYY-MM-DD
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

    const dlog = new DetailedLogger();
    dlog.resetClock();
    const startedIso = new Date().toISOString();
    let finalStatus: 'SUCCESS' | 'ERROR' = 'SUCCESS';
    let errorMessage: string | undefined;

    try {
      const uploadEnabled = upload?.enabled ?? false;
      const result = await runPipeline(
        input,
        params,
        (value, label) => { setProgress(value); setProgressLabel(label); },
        (message, type) => { setLogs(prev => [...prev, { timestamp: Date.now(), message, type: type || 'info' }]); },
        { exportMode: uploadEnabled ? 'blob' : 'download', returnFinalBuffer: false, logger: dlog }
      );
      setTrackReports(result.trackReports);
      setMasterReport(result.masterReport);

      if (uploadEnabled && result.outputBlob) {
        try {
          addLog('Enviando para OneDrive...', 'step');
          dlog.log('upload', 'step', 'Iniciando upload para OneDrive');
          setProgressLabel('Enviando para OneDrive...');
          const folderPath = buildEpisodeFolderPath(upload?.episodeDate);
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
