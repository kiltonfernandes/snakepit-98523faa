import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Plus, Trash2, Layers, Play, FileAudio, X, Sparkles, Upload, CheckCircle2, Cloud, ExternalLink, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { GranularProgress } from '@/components/rivaldo/GranularProgress';
import { ProcessLog } from '@/components/rivaldo/ProcessLog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { AudioParams, DEFAULT_PARAMS, LogEntry, ProcessingProfile } from '@/lib/audio/types';
import { ElapsedTimer } from '@/components/rivaldo/ElapsedTimer';
import { loadPresetAsFile, PresetDefinition } from '@/lib/assets/presets';
import { getDesktopApi } from '@/lib/desktop/runtime';
import { DesktopJob, DesktopState } from '@/lib/desktop/types';
import { prepareDesktopBulkPayload } from '@/lib/desktop/queue';
import { useRivaldoBulk, BulkQueueRow } from '@/contexts/RivaldoBulkContext';

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

const INTRO_PRESET: PresetDefinition = { label: 'Heavynauta', url: '/presets/Heavynauta_Intro.mp3' };
const OUTRO_PRESET: PresetDefinition = { label: 'Heavynauta', url: '/presets/heavynaura_outro.mp3' };

/** Shuffle array and return a copy */
function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Assign non-repeating BGM presets to N rows */
function assignRandomBgms(count: number): string[] {
  if (count === 0) return [];
  const shuffled = shuffleArray(BGM_PRESETS);
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(shuffled[i % shuffled.length].url);
  }
  return result;
}

/** Maps filename keywords to JS getDay() values */
const DAY_KEYWORD_MAP: { keywords: string[]; dayIndex: number }[] = [
  { keywords: ['segunda'], dayIndex: 1 },
  { keywords: ['terca', 'terça'], dayIndex: 2 },
  { keywords: ['quarta'], dayIndex: 3 },
  { keywords: ['quinta'], dayIndex: 4 },
  { keywords: ['sexta'], dayIndex: 5 },
  { keywords: ['sabado', 'sábado'], dayIndex: 6 },
  { keywords: ['domingo'], dayIndex: 0 },
];

const DAY_NAMES: Record<number, string> = {
  0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado',
};

function detectDayFromFilename(filename: string): number | null {
  const normalized = filename.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const entry of DAY_KEYWORD_MAP) {
    for (const kw of entry.keywords) {
      const normalizedKw = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (normalized.includes(normalizedKw)) return entry.dayIndex;
    }
  }
  return null;
}

interface QueueRow {
  id: string;
  masterMode: 'single' | 'multi';
  masterFile: File | null;
  masterTracks: File[];
  bgmFile: File | null;
  bgmPreset: string | null;
  filename: string;
  dayIndex: number | null; // for matching
  materialId?: string;    // episode_materials.id for the matched episode
  episodeDate?: string;   // YYYY-MM-DD for folder structure
}

interface EpisodeTitle {
  id: string;
  title: string;
  label: string;
  dayOfWeek: number;
  weekId: string;
  episodeDate: string;
}

interface BulkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  introFile: File | null;
  outroFile: File | null;
  audioParams?: AudioParams;
  processingProfile: ProcessingProfile;
  desktopMode?: boolean;
  desktopState?: DesktopState | null;
  desktopQueueAvailable?: boolean;
  desktopQueueStatusMessage?: string | null;
  onDesktopJobQueued?: (job: DesktopJob) => void;
}

function createEmptyRow(dayIndex: number | null = null): QueueRow {
  return {
    id: crypto.randomUUID(),
    masterMode: 'single',
    masterFile: null,
    masterTracks: [],
    bgmFile: null,
    bgmPreset: null,
    filename: '',
    dayIndex,
  };
}

export function BulkModal({
  open,
  onOpenChange,
  introFile,
  outroFile,
  audioParams = DEFAULT_PARAMS,
  processingProfile,
  desktopMode = false,
  desktopState = null,
  desktopQueueAvailable = true,
  desktopQueueStatusMessage = null,
  onDesktopJobQueued,
}: BulkModalProps) {
  const bulk = useRivaldoBulk();
  const {
    isProcessing, progress, progressLabel, logs,
    rows, uploadStatuses,
    selectedWeekId, finalEpisodeFilename, generateFinalEpisode, uploadToCloud,
    setRows, updateRow: updateRowCtx, setSelectedWeekId, setFinalEpisodeFilename,
    setGenerateFinalEpisode, setUploadToCloud,
    startBulk, retryUpload: retryUploadCtx,
  } = bulk;
  const [desktopFeedback, setDesktopFeedback] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);
  const [isQueueSubmitting, setIsQueueSubmitting] = useState(false);
  const [allEpisodeTitles, setAllEpisodeTitles] = useState<EpisodeTitle[]>([]);
  const [weeks, setWeeks] = useState<{ id: string; start_date: string }[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const [autoIntroFile, setAutoIntroFile] = useState<File | null>(null);
  const [autoOutroFile, setAutoOutroFile] = useState<File | null>(null);

  // Resolve intro/outro: use prop if provided, otherwise auto-loaded preset
  const resolvedIntro = introFile || autoIntroFile;
  const resolvedOutro = outroFile || autoOutroFile;

  // Derived: episodes for the selected week
  const weekEpisodes = useMemo(
    () => allEpisodeTitles.filter(ep => ep.weekId === selectedWeekId),
    [allEpisodeTitles, selectedWeekId],
  );

  const sundayTitles = useMemo(() => weekEpisodes.filter(t => t.dayOfWeek === 0), [weekEpisodes]);

  // Auto-load intro/outro presets on open
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [intro, outro] = await Promise.all([
          loadPresetAsFile(INTRO_PRESET),
          loadPresetAsFile(OUTRO_PRESET),
        ]);
        setAutoIntroFile(intro);
        setAutoOutroFile(outro);
      } catch (e) {
        console.warn('[BulkModal] Failed to auto-load intro/outro presets', e);
      }
    })();
  }, [open]);

  // Load weeks + all episodes on open
  useEffect(() => {
    if (!open) return;
    (async () => {
      const [weeksRes, matsRes] = await Promise.all([
        supabase.from('editorial_weeks').select('id, start_date').order('start_date', { ascending: false }),
        supabase.from('episode_materials').select('id, title_options_json, selected_title_index, episode_date, week_id').order('episode_date', { ascending: true }),
      ]);

      if (weeksRes.data) setWeeks(weeksRes.data);

      if (matsRes.data) {
        const titles: EpisodeTitle[] = [];
        for (const row of matsRes.data) {
          const opts = Array.isArray(row.title_options_json) ? row.title_options_json : [];
          const idx = row.selected_title_index ?? 0;
          const selected = opts[idx] as { text?: string } | undefined;
          const title = selected?.text || (opts[0] as { text?: string })?.text;
          if (title) {
            const d = new Date(`${row.episode_date}T12:00:00`);
            const dayName = DAY_NAMES[d.getDay()] || '';
            titles.push({ id: row.id, title, label: `[${dayName}] - ${title}`, dayOfWeek: d.getDay(), weekId: row.week_id, episodeDate: row.episode_date });
          }
        }
        setAllEpisodeTitles(titles);
      }
    })();
  }, [open]);

  // When week changes, auto-create rows with random non-repeating BGMs
  useEffect(() => {
    if (!selectedWeekId) { setRows([]); return; }
    const eps = allEpisodeTitles.filter(ep => ep.weekId === selectedWeekId && ep.dayOfWeek !== 0);
    // Sort by day index (Mon=1 .. Sat=6)
    const sorted = [...eps].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    const bgmAssignments = assignRandomBgms(sorted.length);
    const newRows: QueueRow[] = sorted.map((ep, i) => ({
      id: crypto.randomUUID(),
      masterMode: 'single',
      masterFile: null,
      masterTracks: [],
      bgmFile: null,
      bgmPreset: bgmAssignments[i],
      filename: ep.title,
      dayIndex: ep.dayOfWeek,
      materialId: ep.id,
      episodeDate: ep.episodeDate,
    }));
    if (newRows.length === 0) newRows.push(createEmptyRow());
    setRows(newRows);
    // Auto-select sunday title for final episode
    const sunday = allEpisodeTitles.find(ep => ep.weekId === selectedWeekId && ep.dayOfWeek === 0);
    setFinalEpisodeFilename(sunday?.title || '');
  }, [selectedWeekId, allEpisodeTitles]);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs((prev) => [...prev, { timestamp: Date.now(), message, type }]);
  }, []);

  const updateRow = (id: string, updates: Partial<QueueRow>) => {
    setRows((prev) => prev.map((row) => row.id === id ? { ...row, ...updates } : row));
  };

  /** Retry uploading a single row's blob — re-encodes via runPipeline of just that item. */
  const retryUpload = useCallback(async (row: QueueRow) => {
    if (!resolvedIntro || !resolvedOutro) return;
    setUploadStatuses(prev => ({ ...prev, [row.id]: { state: 'uploading' } }));
    try {
      let bgm = row.bgmFile;
      if (!bgm && row.bgmPreset) {
        const preset = BGM_PRESETS.find((p) => p.url === row.bgmPreset);
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
          processingProfile,
          bgm,
          intro: resolvedIntro,
          outro: resolvedOutro,
          filename: row.filename.trim(),
        },
        audioParams,
        () => undefined,
        addLog,
        { exportMode: 'blob', returnFinalBuffer: false }
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
      setUploadStatuses(prev => ({ ...prev, [row.id]: { state: 'done', webUrl: uploaded.webUrl, fileId: uploaded.fileId, folderPath, uploadedFilename: uploaded.filename } }));
      if (row.materialId) {
        await supabase.from('episode_materials').update({
          repository_provider: 'onedrive',
          repository_url: uploaded.webUrl,
          repository_file_id: uploaded.fileId,
          repository_uploaded_at: new Date().toISOString(),
        }).eq('id', row.materialId);
      }
      addLog(`Reupload concluído: ${uploaded.filename}`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha';
      setUploadStatuses(prev => ({ ...prev, [row.id]: { state: 'error', error: msg } }));
      addLog(`Falha no reupload de ${row.filename}: ${msg}`, 'error');
    }
  }, [addLog, audioParams, processingProfile, resolvedIntro, resolvedOutro]);

  // Auto-match uploaded files to rows by day name in filename
  const handleBulkFileDrop = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.type === 'audio/mpeg' || f.name.endsWith('.mp3'));
    if (fileArray.length === 0) return;

    setRows(prevRows => {
      const updated = [...prevRows];
      const unmatched: File[] = [];

      for (const file of fileArray) {
        const dayIdx = detectDayFromFilename(file.name);
        if (dayIdx !== null) {
          const rowIdx = updated.findIndex(r => r.dayIndex === dayIdx);
          if (rowIdx !== -1) {
            updated[rowIdx] = { ...updated[rowIdx], masterFile: file };
            continue;
          }
        }
        unmatched.push(file);
      }

      // Assign unmatched files to empty rows in order
      for (const file of unmatched) {
        const emptyIdx = updated.findIndex(r => !r.masterFile && r.masterMode === 'single');
        if (emptyIdx !== -1) {
          updated[emptyIdx] = { ...updated[emptyIdx], masterFile: file };
        }
      }

      return updated;
    });
  }, []);

  const matchedCount = rows.filter(r => r.masterFile).length;

  const canStart = rows.length > 0 && rows.every((row) => {
    const masterReady = row.masterMode === 'single' ? !!row.masterFile : row.masterTracks.length > 0;
    return masterReady && (row.bgmFile || row.bgmPreset) && row.filename.trim();
  }) && resolvedIntro && resolvedOutro && !isProcessing && (!desktopMode || (desktopQueueAvailable && !isQueueSubmitting));

  const handleStart = async () => {
    if (!canStart) return;
    if (desktopMode) {
      const api = getDesktopApi();
      setDesktopFeedback(null);

      if (!api) {
        const message = 'Bridge desktop indisponivel no renderer.';
        setDesktopFeedback({ type: 'error', message });
        addLog(message, 'error');
        return;
      }

      const payloadResult = await prepareDesktopBulkPayload({
        desktopState,
        rows,
        introFile: resolvedIntro,
        outroFile: resolvedOutro,
        audioParams,
        processingProfile,
        generateFinalEpisode,
      });

      if (!payloadResult.ok) {
        const e = (payloadResult as { ok: false; error: { message: string } }).error;
        setDesktopFeedback({ type: 'error', message: e.message });
        addLog(e.message, 'error');
        return;
      }

      setIsQueueSubmitting(true);
      try {
        const job = await api.enqueueBulkJob(payloadResult.value);
        const message = `Job ${job.name} enfileirado com status ${job.status}.`;
        setDesktopFeedback({ type: 'success', message });
        addLog(message, 'success');
        onDesktopJobQueued?.(job);
        onOpenChange(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao criar job na fila desktop.';
        setDesktopFeedback({ type: 'error', message });
        addLog(message, 'error');
      } finally {
        setIsQueueSubmitting(false);
      }
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setLogs([]);

    try {
      const items: BulkItem[] = await Promise.all(
        rows.map(async (row) => {
          let bgm = row.bgmFile;
          if (!bgm && row.bgmPreset) {
            const preset = BGM_PRESETS.find((item) => item.url === row.bgmPreset);
            bgm = await loadPresetAsFile(preset ?? { label: 'BGM', url: row.bgmPreset });
          }
          return {
            masterMode: row.masterMode,
            master: row.masterFile,
            masterTracks: row.masterTracks,
            processingProfile,
            bgm: bgm!,
            filename: row.filename.trim(),
          };
        })
      );

      // Reset upload statuses
      const initial: Record<string, UploadStatus> = {};
      rows.forEach(r => { initial[r.id] = { state: 'idle' }; });
      setUploadStatuses(initial);

      await runBulkPipeline(
        { items, intro: resolvedIntro!, outro: resolvedOutro!, generateFinalEpisode, finalFilename: finalEpisodeFilename || undefined },
        audioParams,
        (value, label) => {
          setProgress(value);
          setProgressLabel(label);
        },
        addLog,
        {
          exportMode: 'blob',
          downloadIndividualItems: !uploadToCloud,
          onItemEncoded: async (_item, index, result) => {
            const row = rows[index];
            if (!row) return;
            if (uploadToCloud && result.outputBlob) {
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
                setUploadStatuses(prev => ({ ...prev, [row.id]: { state: 'done', webUrl: uploaded.webUrl, fileId: uploaded.fileId, folderPath, uploadedFilename: uploaded.filename } }));
                addLog(`OneDrive: ${uploaded.filename} → ${uploaded.webUrl}`, 'success');
                if (row.materialId) {
                  await supabase.from('episode_materials').update({
                    repository_provider: 'onedrive',
                    repository_url: uploaded.webUrl,
                    repository_file_id: uploaded.fileId,
                    repository_uploaded_at: new Date().toISOString(),
                  }).eq('id', row.materialId);
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
        }
      );
      addLog('Bulk finalizado com sucesso!', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido no bulk pipeline';
      addLog(message, 'error');
      console.error('[Bulk Pipeline Error]', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const weekLabel = (w: { start_date: string }) => {
    const d = new Date(`${w.start_date}T12:00:00`);
    return `Semana de ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            Bulk Processing 3.2
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Selecione a semana e arraste os MP3s — o match é automático pelo nome do arquivo.
          </DialogDescription>
        </DialogHeader>

        {(desktopFeedback || (desktopMode && desktopQueueStatusMessage)) && (
          <div
            role={desktopFeedback?.type === 'error' ? 'alert' : 'status'}
            data-testid="bulk-desktop-feedback"
            className={`rounded-md border px-3 py-2 text-xs font-mono ${
              desktopFeedback?.type === 'error'
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : desktopFeedback?.type === 'success'
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border bg-muted/40 text-muted-foreground'
            }`}
          >
            {desktopFeedback?.message ?? desktopQueueStatusMessage}
          </div>
        )}

        {/* Week Selector */}
        <div className="space-y-1">
          <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Semana</Label>
          <Select value={selectedWeekId} onValueChange={setSelectedWeekId} disabled={isProcessing}>
            <SelectTrigger className="h-9 text-sm font-mono">
              <SelectValue placeholder="Selecione a semana..." />
            </SelectTrigger>
            <SelectContent>
              {weeks.map(w => (
                <SelectItem key={w.id} value={w.id} className="text-sm font-mono">
                  {weekLabel(w)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Bulk File Drop Zone */}
        {selectedWeekId && rows.length > 0 && (
          <div
            ref={dropRef}
            onDragOver={(e) => { e.preventDefault(); setIsDraggingFiles(true); }}
            onDragLeave={() => setIsDraggingFiles(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFiles(false);
              if (e.dataTransfer.files.length > 0) handleBulkFileDrop(e.dataTransfer.files);
            }}
            className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
              isDraggingFiles
                ? 'border-primary bg-primary/5'
                : matchedCount === rows.length && matchedCount > 0
                ? 'border-primary/40 bg-primary/5'
                : 'border-border hover:border-muted-foreground/50'
            }`}
          >
            <input
              type="file"
              accept=".mp3,audio/mpeg"
              multiple
              className="absolute inset-0 opacity-0 cursor-pointer"
              disabled={isProcessing}
              onChange={(e) => {
                if (e.target.files) handleBulkFileDrop(e.target.files);
                e.target.value = '';
              }}
            />
            {matchedCount === rows.length && matchedCount > 0 ? (
              <div className="flex items-center justify-center gap-2 text-primary">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm font-mono">{matchedCount}/{rows.length} episódios matched</span>
              </div>
            ) : (
              <div className="space-y-1">
                <Upload className="w-6 h-6 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground font-mono">
                  Arraste os MP3s aqui (segunda.mp3, terca.mp3, ...)
                </p>
                {matchedCount > 0 && (
                  <p className="text-xs text-primary font-mono">{matchedCount}/{rows.length} matched</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Episode Rows */}
        <div className="space-y-3 mt-2">
          {rows.map((row, idx) => (
            <motion.div
              key={row.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`border rounded-lg p-3 space-y-2 ${
                row.masterFile
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border bg-muted/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground flex items-center gap-2">
                  {row.dayIndex !== null && (
                    <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider">
                      {DAY_NAMES[row.dayIndex]}
                    </span>
                  )}
                  Episódio {idx + 1}
                  {row.masterFile && (
                    <CheckCircle2 className="w-3 h-3 text-primary" />
                  )}
                  {(() => {
                    const status = uploadStatuses[row.id];
                    if (!status || status.state === 'idle') return null;
                    if (status.state === 'uploading') return (
                      <span className="flex items-center gap-1 text-[10px] text-primary"><Loader2 className="w-3 h-3 animate-spin" /> upload...</span>
                    );
                    if (status.state === 'done') return (
                      <a href={status.webUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] text-primary hover:underline">
                        <Cloud className="w-3 h-3" /> no Drive <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    );
                    if (status.state === 'error') return (
                      <span className="flex items-center gap-1 text-[10px] text-destructive" title={status.error}>
                        <AlertCircle className="w-3 h-3" /> falhou
                        <button onClick={() => retryUpload(row)} className="ml-1 underline hover:text-primary inline-flex items-center gap-0.5">
                          <RefreshCw className="w-2.5 h-2.5" /> retry
                        </button>
                      </span>
                    );
                    return null;
                  })()}
                </span>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={row.masterMode === 'multi'}
                    onCheckedChange={(checked) => updateRow(row.id, { masterMode: checked ? 'multi' : 'single' })}
                    disabled={isProcessing}
                    className="h-4 w-8"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setRows((prev) => prev.length > 1 ? prev.filter((item) => item.id !== row.id) : prev)}
                    disabled={rows.length === 1 || isProcessing}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Master</label>
                  {row.masterMode === 'single' ? (
                    <label className="block mt-1 cursor-pointer">
                      <div className={`text-xs border border-border rounded px-2 py-1.5 truncate transition-colors ${row.masterFile ? 'bg-primary/10 text-primary border-primary/30' : 'bg-background hover:bg-muted'}`}>
                        {row.masterFile ? row.masterFile.name : 'Selecionar...'}
                      </div>
                      <input
                        type="file"
                        accept=".mp3,audio/mpeg"
                        className="hidden"
                        disabled={isProcessing}
                        onChange={(e) => updateRow(row.id, { masterFile: e.target.files?.[0] || null })}
                      />
                    </label>
                  ) : (
                    <div className="mt-1 space-y-1">
                      {row.masterTracks.length > 0 && (
                        <div className="space-y-0.5 max-h-[60px] overflow-y-auto">
                          {row.masterTracks.map((file, fileIndex) => (
                            <div key={`${file.name}-${fileIndex}`} className="flex items-center gap-1 text-[9px] bg-muted/50 rounded px-1.5 py-0.5">
                              <FileAudio className="w-2.5 h-2.5 text-primary shrink-0" />
                              <span className="truncate flex-1 font-mono">{file.name}</span>
                              <button
                                onClick={() => updateRow(row.id, { masterTracks: row.masterTracks.filter((_, i) => i !== fileIndex) })}
                                className="shrink-0"
                              >
                                <X className="w-2.5 h-2.5 text-muted-foreground hover:text-destructive" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <label className="block cursor-pointer">
                        <div className="text-[9px] border border-dashed border-border rounded px-2 py-1 text-center text-muted-foreground hover:border-primary/50 transition-colors">
                          + Adicionar trilhas ({row.masterTracks.length})
                        </div>
                        <input
                          type="file"
                          accept=".mp3,audio/mpeg"
                          multiple
                          className="hidden"
                          disabled={isProcessing}
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            updateRow(row.id, { masterTracks: [...row.masterTracks, ...files] });
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">BGM</label>
                  <div className="mt-1 space-y-1">
                    <div className="flex flex-wrap gap-1">
                      {BGM_PRESETS.map((preset) => (
                        <button
                          key={preset.url}
                          disabled={isProcessing}
                          onClick={() => updateRow(row.id, { bgmPreset: preset.url, bgmFile: null })}
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition-colors ${
                            row.bgmPreset === preset.url ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <label className="block cursor-pointer">
                      <div className={`text-[9px] border border-border rounded px-2 py-1 truncate transition-colors ${
                        row.bgmFile ? 'bg-primary/10 text-primary border-primary/30' : 'bg-background hover:bg-muted text-muted-foreground'
                      }`}>
                        {row.bgmFile ? row.bgmFile.name : 'ou upload...'}
                      </div>
                      <input
                        type="file"
                        accept=".mp3,audio/mpeg"
                        className="hidden"
                        disabled={isProcessing}
                        onChange={(e) => updateRow(row.id, { bgmFile: e.target.files?.[0] || null, bgmPreset: null })}
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Nome</label>
                  <Select
                    value={row.filename}
                    onValueChange={(value) => updateRow(row.id, { filename: value })}
                    disabled={isProcessing}
                  >
                    <SelectTrigger className="mt-1 h-auto text-xs font-mono py-1.5">
                      <SelectValue placeholder="Selecionar episódio..." />
                    </SelectTrigger>
                    <SelectContent>
                      {weekEpisodes.map((ep) => (
                        <SelectItem key={ep.id} value={ep.title} className="text-xs font-mono">
                          {ep.label}
                        </SelectItem>
                      ))}
                      {weekEpisodes.length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum episódio disponível</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, createEmptyRow()])} disabled={isProcessing} className="w-full border-dashed">
          <Plus className="w-3 h-3 mr-1" />
          Adicionar episódio
        </Button>

        <div className="flex items-center gap-2 py-1">
          <Checkbox
            id="final-episode"
            checked={generateFinalEpisode}
            onCheckedChange={(checked) => setGenerateFinalEpisode(checked === true)}
            disabled={isProcessing}
          />
          <Label htmlFor="final-episode" className="text-xs font-mono text-muted-foreground cursor-pointer">
            Gerar episódio final consolidado
          </Label>
        </div>

        <div className="flex items-center gap-2 py-1">
          <Checkbox
            id="bulk-upload-cloud"
            checked={uploadToCloud}
            onCheckedChange={(checked) => setUploadToCloud(checked === true)}
            disabled={isProcessing}
          />
          <Label htmlFor="bulk-upload-cloud" className="text-xs font-mono text-muted-foreground cursor-pointer flex items-center gap-1.5">
            <Cloud className="w-3.5 h-3.5" />
            Enviar todos para OneDrive (Snakepit/{new Date().getFullYear()}-W##/)
          </Label>
        </div>

        {generateFinalEpisode && (
          <div className="space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">Nome do episódio consolidado</Label>
            <Select value={finalEpisodeFilename} onValueChange={setFinalEpisodeFilename} disabled={isProcessing}>
              <SelectTrigger className="h-8 text-xs font-mono">
                <SelectValue placeholder="Selecione o título (Domingo)" />
              </SelectTrigger>
              <SelectContent>
                {sundayTitles.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum episódio de domingo encontrado</div>
                )}
                {sundayTitles.map((ep) => (
                  <SelectItem key={ep.id} value={ep.title} className="text-xs font-mono">
                    {ep.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button onClick={handleStart} disabled={!canStart} className="w-full h-10" data-testid="bulk-enqueue-button">
          {isProcessing ? (
            <span className="flex items-center gap-2">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
              />
              Processando...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Play className="w-4 h-4" />
              {desktopMode ? (isQueueSubmitting ? 'Enfileirando...' : `Enviar para fila 3.2 (${rows.length})`) : `Iniciar fila 3.2 (${rows.length})`}
            </span>
          )}
        </Button>

        <ElapsedTimer isRunning={isProcessing} />
        <GranularProgress progress={progress} label={progressLabel} isRunning={isProcessing} />
        {logs.length > 0 && <ProcessLog logs={logs} />}
      </DialogContent>
    </Dialog>
  );
}
