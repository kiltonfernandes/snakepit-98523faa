// HMR refresh marker
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { runBulkPipeline, BulkItem } from '@/lib/audio/pipeline';
import { AudioParams, DEFAULT_PARAMS, LogEntry, ProcessingProfile, DEFAULT_PROCESSING_PROFILE } from '@/lib/audio/types';
import { loadPresetAsFile } from '@/lib/assets/presets';
import { buildEpisodeFolderPath, sanitizeFilename, uploadEpisodeToOneDrive } from '@/lib/storage/onedrive';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { downloadBlob } from '@/lib/audio/encoder';

const BGM_PRESETS = [
  { label: 'BGM 1', url: '/presets/zzzzaaaaBGM_Heavynauta_2.0.mp3' },
  { label: 'BGM 2', url: '/presets/zzzzbbbbBGM_Heavynauta_2.0.mp3' },
  { label: 'BGM 3', url: '/presets/zzzzccccBGM_Heavynauta_2.0.mp3' },
  { label: 'BGM 4', url: '/presets/zzzzddddBGM_Heavynauta_2.0.mp3' },
  { label: 'BGM 5', url: '/presets/zzzzeeeeBGM_Heavynauta_2.0.mp3' },
  { label: 'BGM 6', url: '/presets/zzzzffffBGM_Heavynauta_2.0.mp3' },
  { label: 'BGM 7', url: '/presets/zzzzggggBGM_Heavynauta_2.0.mp3' },
  { label: 'BGM 8', url: '/presets/zzzzhhhhBGM_Heavynauta_2.0.mp3' },
];

export interface BulkQueueRow {
  id: string;
  masterMode: 'single' | 'multi';
  masterFile: File | null;
  masterTracks: File[];
  bgmFile: File | null;
  bgmPreset: string | null;
  filename: string;
  dayIndex: number | null;
  materialId?: string;
  episodeDate?: string;
}

export type BulkUploadStatus = {
  state: 'idle' | 'uploading' | 'done' | 'error';
  webUrl?: string;
  error?: string;
  fileId?: string;
  folderPath?: string;
  uploadedFilename?: string;
};

export type FinalEpisodeUploadStatus = {
  state: 'idle' | 'uploading' | 'done' | 'error';
  webUrl?: string;
  fileId?: string;
  folderPath?: string;
  uploadedFilename?: string;
  error?: string;
};

export interface StartBulkInput {
  rows: BulkQueueRow[];
  intro: File;
  outro: File;
  audioParams?: AudioParams;
  processingProfile: ProcessingProfile;
  generateFinalEpisode: boolean;
  finalFilename?: string;
  uploadToCloud: boolean;
  batchName?: string;
}

export interface CompileCloudDayInput {
  dayIndex: number; // 1=Mon..6=Sat
  materialId?: string;
  fileId?: string | null; // OneDrive file id (preferred source)
  override?: File | null; // local file fallback
  label: string; // human label e.g. "Segunda — Título"
}

export interface CompileFromCloudInput {
  weekId: string;
  finalFilename: string;
  days: CompileCloudDayInput[];
}

interface RivaldoBulkContextType {
  // persistent state
  isProcessing: boolean;
  progress: number;
  progressLabel: string;
  logs: LogEntry[];
  rows: BulkQueueRow[];
  uploadStatuses: Record<string, BulkUploadStatus>;
  selectedWeekId: string;
  finalEpisodeFilename: string;
  generateFinalEpisode: boolean;
  uploadToCloud: boolean;
  currentBatchName: string | null;
  finalEpisodeStatus: FinalEpisodeUploadStatus;

  // compile-from-cloud state
  isCompiling: boolean;
  compileProgress: number;
  compileProgressLabel: string;
  compileLogs: LogEntry[];

  // setters (UI config persistence)
  setRows: React.Dispatch<React.SetStateAction<BulkQueueRow[]>>;
  updateRow: (id: string, updates: Partial<BulkQueueRow>) => void;
  setSelectedWeekId: (id: string) => void;
  setFinalEpisodeFilename: (v: string) => void;
  setGenerateFinalEpisode: (v: boolean) => void;
  setUploadToCloud: (v: boolean) => void;

  // actions
  startBulk: (input: StartBulkInput) => Promise<void>;
  retryUpload: (rowId: string, ctx: { intro: File; outro: File; audioParams?: AudioParams; processingProfile: ProcessingProfile }) => Promise<void>;
  compileFromCloud: (input: CompileFromCloudInput) => Promise<void>;
  clearBulkState: () => void;
  addLog: (message: string, type?: LogEntry['type']) => void;
}

const RivaldoBulkContext = createContext<RivaldoBulkContextType | null>(null);

export function RivaldoBulkProvider({ children }: { children: React.ReactNode }) {
  const { updateMaterial } = useApp();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [rows, setRows] = useState<BulkQueueRow[]>([]);
  const [uploadStatuses, setUploadStatuses] = useState<Record<string, BulkUploadStatus>>({});
  const [selectedWeekId, setSelectedWeekId] = useState<string>('');
  const [finalEpisodeFilename, setFinalEpisodeFilename] = useState('');
  const [generateFinalEpisode, setGenerateFinalEpisode] = useState(true);
  const [uploadToCloud, setUploadToCloud] = useState(true);
  const [currentBatchName, setCurrentBatchName] = useState<string | null>(null);
  const [finalEpisodeStatus, setFinalEpisodeStatus] = useState<FinalEpisodeUploadStatus>({ state: 'idle' });
  const processingRef = useRef(false);

  // Compile-from-cloud state
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileProgress, setCompileProgress] = useState(0);
  const [compileProgressLabel, setCompileProgressLabel] = useState('');
  const [compileLogs, setCompileLogs] = useState<LogEntry[]>([]);
  const compilingRef = useRef(false);

  const addCompileLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setCompileLogs(prev => [...prev, { timestamp: Date.now(), message, type }]);
  }, []);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { timestamp: Date.now(), message, type }]);
  }, []);

  const updateRow = useCallback((id: string, updates: Partial<BulkQueueRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const clearBulkState = useCallback(() => {
    if (processingRef.current || compilingRef.current) return;
    setLogs([]);
    setProgress(0);
    setProgressLabel('');
    setUploadStatuses({});
    setCurrentBatchName(null);
    setFinalEpisodeStatus({ state: 'idle' });
    setCompileLogs([]);
    setCompileProgress(0);
    setCompileProgressLabel('');
  }, []);

  const startBulk = useCallback(async (input: StartBulkInput) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    setProgress(0);
    setProgressLabel('');
    setLogs([]);
    setCurrentBatchName(input.batchName ?? null);
    setFinalEpisodeStatus({ state: 'idle' });

    const params = input.audioParams ?? DEFAULT_PARAMS;
    const initial: Record<string, BulkUploadStatus> = {};
    input.rows.forEach(r => { initial[r.id] = { state: 'idle' }; });
    setUploadStatuses(initial);

    try {
      const items: BulkItem[] = await Promise.all(
        input.rows.map(async (row) => {
          let bgm = row.bgmFile;
          if (!bgm && row.bgmPreset) {
            const preset = BGM_PRESETS.find(p => p.url === row.bgmPreset);
            bgm = await loadPresetAsFile(preset ?? { label: 'BGM', url: row.bgmPreset });
          }
          return {
            masterMode: row.masterMode,
            master: row.masterFile,
            masterTracks: row.masterTracks,
            processingProfile: input.processingProfile,
            bgm: bgm!,
            filename: row.filename.trim(),
          };
        }),
      );

      await runBulkPipeline(
        {
          items,
          intro: input.intro,
          outro: input.outro,
          generateFinalEpisode: input.generateFinalEpisode,
          finalFilename: input.finalFilename || undefined,
        },
        params,
        (value, label) => { setProgress(value); setProgressLabel(label); },
        (msg, type) => addLog(msg, type),
        {
          exportMode: 'blob',
          downloadIndividualItems: !input.uploadToCloud,
          downloadFinalEpisode: !input.uploadToCloud,
          onItemEncoded: async (_item, index, result) => {
            const row = input.rows[index];
            if (!row) return;
            if (input.uploadToCloud && result.outputBlob) {
              setUploadStatuses(prev => ({ ...prev, [row.id]: { state: 'uploading' } }));
              try {
                const folderPath = buildEpisodeFolderPath(row.episodeDate);
                const filename = sanitizeFilename(row.filename.trim());
                addLog(`Upload OneDrive: ${folderPath}/${filename}...`, 'step');
                const uploaded = await uploadEpisodeToOneDrive({
                  folderPath,
                  filename,
                  blob: result.outputBlob,
                  onProgress: ({ fraction }) => {
                    setProgressLabel(`Upload ${row.filename}: ${Math.round(fraction * 100)}%`);
                  },
                });
                setUploadStatuses(prev => ({
                  ...prev,
                  [row.id]: {
                    state: 'done',
                    webUrl: uploaded.webUrl,
                    fileId: uploaded.fileId,
                    folderPath,
                    uploadedFilename: uploaded.filename,
                  },
                }));
                addLog(`OneDrive: ${uploaded.filename}`, 'success');
                if (row.materialId) {
                  try {
                    updateMaterial(row.materialId, {
                      repository_provider: 'onedrive',
                      repository_url: uploaded.webUrl,
                      repository_file_id: uploaded.fileId,
                      repository_uploaded_at: new Date().toISOString(),
                    });
                  } catch (e) {
                    const m = e instanceof Error ? e.message : 'erro desconhecido';
                    addLog(`Aviso: falha ao sincronizar materials (${m})`, 'error');
                  }
                }
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Falha no upload';
                setUploadStatuses(prev => ({ ...prev, [row.id]: { state: 'error', error: msg } }));
                addLog(`OneDrive falhou (${row.filename}): ${msg}`, 'error');
              }
            } else {
              addLog(`Download concluído: ${_item.filename}`, 'success');
            }
          },
          onFinalEpisodeEncoded: async (finalBlob) => {
            if (!input.generateFinalEpisode) return;
            if (!input.uploadToCloud) return;
            // Pick the row with the latest episode_date as the consolidated episode anchor
            const sortedRows = [...input.rows]
              .filter(r => r.episodeDate)
              .sort((a, b) => (a.episodeDate! < b.episodeDate! ? 1 : -1));
            const anchorRow = sortedRows[0] ?? input.rows[input.rows.length - 1];
            const baseName = (input.finalFilename || 'episodio_final').trim();
            const filename = sanitizeFilename(baseName);
            const folderPath = buildEpisodeFolderPath(anchorRow?.episodeDate);
            setFinalEpisodeStatus({ state: 'uploading', folderPath });
            addLog(`Upload OneDrive (consolidado): ${folderPath}/${filename}...`, 'step');
            try {
              const uploaded = await uploadEpisodeToOneDrive({
                folderPath,
                filename,
                blob: finalBlob,
                onProgress: ({ fraction }) => {
                  setProgressLabel(`Upload consolidado: ${Math.round(fraction * 100)}%`);
                },
              });
              setFinalEpisodeStatus({
                state: 'done',
                webUrl: uploaded.webUrl,
                fileId: uploaded.fileId,
                folderPath,
                uploadedFilename: uploaded.filename,
              });
              addLog(`OneDrive (consolidado): ${uploaded.filename}`, 'success');
              if (anchorRow?.materialId) {
                try {
                  updateMaterial(anchorRow.materialId, {
                    repository_provider: 'onedrive',
                    repository_url: uploaded.webUrl,
                    repository_file_id: uploaded.fileId,
                    repository_uploaded_at: new Date().toISOString(),
                  });
                } catch (e) {
                  const m = e instanceof Error ? e.message : 'erro desconhecido';
                  addLog(`Aviso: falha ao sincronizar material do consolidado (${m})`, 'error');
                }
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Falha no upload do consolidado';
              setFinalEpisodeStatus({ state: 'error', error: msg, folderPath });
              addLog(`OneDrive falhou (consolidado): ${msg}`, 'error');
            }
          },
        },
      );
      addLog('Bulk finalizado com sucesso!', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido no bulk pipeline';
      addLog(message, 'error');
      console.error('[Bulk Pipeline Error]', error);
    } finally {
      setIsProcessing(false);
      processingRef.current = false;
    }
  }, [addLog, updateMaterial]);

  const retryUpload = useCallback(async (rowId: string, ctx: { intro: File; outro: File; audioParams?: AudioParams; processingProfile: ProcessingProfile }) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    setUploadStatuses(prev => ({ ...prev, [row.id]: { state: 'uploading' } }));
    try {
      let bgm = row.bgmFile;
      if (!bgm && row.bgmPreset) {
        const preset = BGM_PRESETS.find(p => p.url === row.bgmPreset);
        bgm = await loadPresetAsFile(preset ?? { label: 'BGM', url: row.bgmPreset });
      }
      if (!bgm) throw new Error('BGM não disponível');
      addLog(`Reprocessando ${row.filename} para reupload...`, 'step');
      const { runPipeline } = await import('@/lib/audio/pipeline');
      const result = await runPipeline(
        {
          masterMode: row.masterMode,
          master: row.masterFile,
          masterTracks: row.masterTracks,
          processingProfile: ctx.processingProfile,
          bgm,
          intro: ctx.intro,
          outro: ctx.outro,
          filename: row.filename.trim(),
        },
        ctx.audioParams ?? DEFAULT_PARAMS,
        () => undefined,
        addLog,
        { exportMode: 'blob', returnFinalBuffer: false },
      );
      if (!result.outputBlob) throw new Error('Encode não retornou blob');
      const folderPath = buildEpisodeFolderPath(row.episodeDate);
      const filename = sanitizeFilename(row.filename.trim());
      const uploaded = await uploadEpisodeToOneDrive({
        folderPath,
        filename,
        blob: result.outputBlob,
        onProgress: ({ fraction }) => setProgressLabel(`Reupload: ${Math.round(fraction * 100)}%`),
      });
      setUploadStatuses(prev => ({
        ...prev,
        [row.id]: { state: 'done', webUrl: uploaded.webUrl, fileId: uploaded.fileId, folderPath, uploadedFilename: uploaded.filename },
      }));
      if (row.materialId) {
        try {
          updateMaterial(row.materialId, {
            repository_provider: 'onedrive',
            repository_url: uploaded.webUrl,
            repository_file_id: uploaded.fileId,
            repository_uploaded_at: new Date().toISOString(),
          });
        } catch (e) {
          const m = e instanceof Error ? e.message : 'erro desconhecido';
          addLog(`Aviso: sync materials falhou (${m})`, 'error');
        }
      }
      addLog(`Reupload concluído: ${uploaded.filename}`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha';
      setUploadStatuses(prev => ({ ...prev, [row.id]: { state: 'error', error: msg } }));
      addLog(`Falha no reupload de ${row.filename}: ${msg}`, 'error');
    }
  }, [rows, addLog, updateMaterial]);

  const compileFromCloud = useCallback(async (input: CompileFromCloudInput) => {
    if (compilingRef.current) return;
    compilingRef.current = true;
    setIsCompiling(true);
    setCompileLogs([]);
    setCompileProgress(0);
    setCompileProgressLabel('');

    // Total steps: 1 intro load + N day fetches + 1 outro load + 1 concat/download
    const dayCount = input.days.length;
    const totalSteps = 1 + dayCount + 1 + 1;
    let stepIdx = 0;
    const tickProgress = (label: string) => {
      stepIdx += 1;
      setCompileProgress(Math.min(100, Math.round((stepIdx / totalSteps) * 100)));
      setCompileProgressLabel(label);
    };

    try {
      addCompileLog('Carregando intro/outro presets...', 'step');
      const [introFile, outroFile] = await Promise.all([
        loadPresetAsFile({ label: 'Heavynauta Intro', url: '/presets/Heavynauta_Intro.mp3' }),
        loadPresetAsFile({ label: 'Heavynauta Outro', url: '/presets/heavynaura_outro.mp3' }),
      ]);
      tickProgress('Intro/Outro carregados');

      const introBlob = new Blob([await introFile.arrayBuffer()], { type: 'audio/mpeg' });

      // Fetch each day in order (Mon→Sat)
      const sortedDays = [...input.days].sort((a, b) => a.dayIndex - b.dayIndex);
      const dayBlobs: Blob[] = [];

      for (const day of sortedDays) {
        if (day.override) {
          addCompileLog(`Usando upload local: ${day.label}`, 'info');
          dayBlobs.push(new Blob([await day.override.arrayBuffer()], { type: 'audio/mpeg' }));
          tickProgress(`Local OK: ${day.label}`);
          continue;
        }
        if (!day.fileId) {
          throw new Error(`Dia "${day.label}" não tem arquivo na nuvem nem upload local.`);
        }
        addCompileLog(`Resolvendo URL OneDrive: ${day.label}...`, 'step');
        const { data, error } = await supabase.functions.invoke('upload-episode-to-onedrive', {
          body: { action: 'download', fileId: day.fileId },
        });
        if (error) throw new Error(`Falha ao resolver download (${day.label}): ${error.message}`);
        const downloadUrl = (data as { downloadUrl?: string | null })?.downloadUrl;
        if (!downloadUrl) throw new Error(`OneDrive não retornou downloadUrl para ${day.label}.`);
        addCompileLog(`Baixando ${day.label}...`, 'step');
        const res = await fetch(downloadUrl);
        if (!res.ok) throw new Error(`Falha no download de ${day.label}: HTTP ${res.status}`);
        const blob = await res.blob();
        dayBlobs.push(new Blob([blob], { type: 'audio/mpeg' }));
        tickProgress(`${day.label}: ${(blob.size / (1024 * 1024)).toFixed(1)} MB`);
      }

      const outroBlob = new Blob([await outroFile.arrayBuffer()], { type: 'audio/mpeg' });
      tickProgress('Outro pronto');

      addCompileLog('Concatenando: Intro + dias + Outro...', 'step');
      const finalBlob = new Blob([introBlob, ...dayBlobs, outroBlob], { type: 'audio/mpeg' });
      const sizeMB = (finalBlob.size / (1024 * 1024)).toFixed(1);
      addCompileLog(`Consolidado: ${sizeMB} MB`, 'success');

      const finalName = sanitizeFilename(input.finalFilename || 'episodio_consolidado');
      await downloadBlob(finalBlob, finalName);
      tickProgress('Download iniciado');
      setCompileProgress(100);
      setCompileProgressLabel('Concluído');
      addCompileLog(`Baixado: ${finalName}`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido na compilação';
      addCompileLog(msg, 'error');
      console.error('[Compile From Cloud Error]', err);
    } finally {
      setIsCompiling(false);
      compilingRef.current = false;
    }
  }, [addCompileLog]);

  return (
    <RivaldoBulkContext.Provider value={{
      isProcessing, progress, progressLabel, logs, rows, uploadStatuses,
      selectedWeekId, finalEpisodeFilename, generateFinalEpisode, uploadToCloud, currentBatchName,
      finalEpisodeStatus,
      isCompiling, compileProgress, compileProgressLabel, compileLogs,
      setRows, updateRow, setSelectedWeekId, setFinalEpisodeFilename, setGenerateFinalEpisode, setUploadToCloud,
      startBulk, retryUpload, compileFromCloud, clearBulkState, addLog,
    }}>
      {children}
    </RivaldoBulkContext.Provider>
  );
}

export function useRivaldoBulk() {
  const ctx = useContext(RivaldoBulkContext);
  if (!ctx) throw new Error('useRivaldoBulk must be used within RivaldoBulkProvider');
  return ctx;
}

// Avoid lint warning on unused import
void DEFAULT_PROCESSING_PROFILE;