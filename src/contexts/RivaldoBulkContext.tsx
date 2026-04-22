import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { runBulkPipeline, BulkItem } from '@/lib/audio/pipeline';
import { AudioParams, DEFAULT_PARAMS, LogEntry, ProcessingProfile, DEFAULT_PROCESSING_PROFILE } from '@/lib/audio/types';
import { loadPresetAsFile } from '@/lib/assets/presets';
import { buildEpisodeFolderPath, sanitizeFilename, uploadEpisodeToOneDrive } from '@/lib/storage/onedrive';
import { useApp } from '@/contexts/AppContext';

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
  const processingRef = useRef(false);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { timestamp: Date.now(), message, type }]);
  }, []);

  const updateRow = useCallback((id: string, updates: Partial<BulkQueueRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const clearBulkState = useCallback(() => {
    if (processingRef.current) return;
    setLogs([]);
    setProgress(0);
    setProgressLabel('');
    setUploadStatuses({});
    setCurrentBatchName(null);
  }, []);

  const startBulk = useCallback(async (input: StartBulkInput) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    setProgress(0);
    setProgressLabel('');
    setLogs([]);
    setCurrentBatchName(input.batchName ?? null);

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

  return (
    <RivaldoBulkContext.Provider value={{
      isProcessing, progress, progressLabel, logs, rows, uploadStatuses,
      selectedWeekId, finalEpisodeFilename, generateFinalEpisode, uploadToCloud, currentBatchName,
      setRows, updateRow, setSelectedWeekId, setFinalEpisodeFilename, setGenerateFinalEpisode, setUploadToCloud,
      startBulk, retryUpload, clearBulkState, addLog,
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