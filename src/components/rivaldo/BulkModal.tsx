import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Plus, Trash2, Layers, Play, FileAudio, X, Sparkles, Upload, CheckCircle2, Cloud, ExternalLink, RefreshCw, AlertCircle, Loader2, Download, CloudOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { GranularProgress } from '@/components/rivaldo/GranularProgress';
import { ProcessLog } from '@/components/rivaldo/ProcessLog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
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
import { useRivaldoBulk, BulkQueueRow, CompileCloudDayInput } from '@/contexts/RivaldoBulkContext';

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
  repositoryFileId?: string | null;
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
    finalEpisodeStatus,
    setRows, updateRow: updateRowCtx, setSelectedWeekId, setFinalEpisodeFilename,
    setGenerateFinalEpisode, setUploadToCloud,
    startBulk, retryUpload: retryUploadCtx,
    isCompiling, compileProgress, compileProgressLabel, compileLogs,
    compileFromCloud,
  } = bulk;
  const [desktopFeedback, setDesktopFeedback] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);
  const [isQueueSubmitting, setIsQueueSubmitting] = useState(false);
  const [allEpisodeTitles, setAllEpisodeTitles] = useState<EpisodeTitle[]>([]);
  const [weeks, setWeeks] = useState<{ id: string; start_date: string }[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const [autoIntroFile, setAutoIntroFile] = useState<File | null>(null);
  const [autoOutroFile, setAutoOutroFile] = useState<File | null>(null);

  // Modal-local mode toggle (not persisted between sessions)
  const [mode, setMode] = useState<'process' | 'compile'>('process');

  // Compile mode: per-day local file overrides (when cloud file missing or user prefers)
  const [compileOverrides, setCompileOverrides] = useState<Record<number, File | null>>({});
  const [compileFinalFilename, setCompileFinalFilename] = useState('');

  // Resolve intro/outro: use prop if provided, otherwise auto-loaded preset
  const resolvedIntro = introFile || autoIntroFile;
  const resolvedOutro = outroFile || autoOutroFile;

  // Derived: episodes for the selected week
  const weekEpisodes = useMemo(
    () => allEpisodeTitles.filter(ep => ep.weekId === selectedWeekId),
    [allEpisodeTitles, selectedWeekId],
  );

  const sundayTitles = useMemo(() => weekEpisodes.filter(t => t.dayOfWeek === 0), [weekEpisodes]);

  // Compile mode: weekday episodes (Mon=1..Sat=6), sorted, with cloud presence info
  const compileDays = useMemo(() => {
    const filtered = weekEpisodes
      .filter(t => t.dayOfWeek >= 1 && t.dayOfWeek <= 6)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    return filtered.map(ep => ({
      ep,
      hasCloud: !!ep.repositoryFileId,
      override: compileOverrides[ep.dayOfWeek] || null,
    }));
  }, [weekEpisodes, compileOverrides]);

  const compileReadyCount = compileDays.filter(d => d.hasCloud || d.override).length;
  const canCompile = compileDays.length === 6 && compileReadyCount === 6 && !!compileFinalFilename.trim() && !isCompiling;

  // Reset overrides + auto-suggest final filename when week changes (compile mode)
  useEffect(() => {
    setCompileOverrides({});
    const sunday = allEpisodeTitles.find(ep => ep.weekId === selectedWeekId && ep.dayOfWeek === 0);
    if (sunday) setCompileFinalFilename(sunday.title);
  }, [selectedWeekId, allEpisodeTitles]);

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
        supabase.from('episode_materials').select('id, title_options_json, selected_title_index, episode_date, week_id, repository_file_id').order('episode_date', { ascending: true }),
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
            titles.push({
              id: row.id, title, label: `[${dayName}] - ${title}`,
              dayOfWeek: d.getDay(), weekId: row.week_id, episodeDate: row.episode_date,
              repositoryFileId: row.repository_file_id,
            });
          }
        }
        setAllEpisodeTitles(titles);
      }
    })();
  }, [open]);

  // When week changes, auto-create rows with random non-repeating BGMs.
  // Skipped while processing (preserves in-flight bulk state).
  useEffect(() => {
    if (isProcessing) return;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeekId, allEpisodeTitles]);

  const addLog = bulk.addLog;
  const updateRow = updateRowCtx;

  /** Retry uploading a single row — delegated to context. */
  const retryUpload = useCallback(async (row: QueueRow) => {
    if (!resolvedIntro || !resolvedOutro) return;
    await retryUploadCtx(row.id, {
      intro: resolvedIntro,
      outro: resolvedOutro,
      audioParams,
      processingProfile,
    });
  }, [retryUploadCtx, resolvedIntro, resolvedOutro, audioParams, processingProfile]);

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

    if (!resolvedIntro || !resolvedOutro) return;
    const week = weeks.find(w => w.id === selectedWeekId);
    const batchName = week ? `Semana de ${new Date(`${week.start_date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : undefined;
    await startBulk({
      rows: rows as BulkQueueRow[],
      intro: resolvedIntro,
      outro: resolvedOutro,
      audioParams,
      processingProfile,
      generateFinalEpisode,
      finalFilename: finalEpisodeFilename || undefined,
      uploadToCloud,
      batchName,
    });
  };

  const handleCompile = async () => {
    if (!canCompile || !selectedWeekId) return;
    const days: CompileCloudDayInput[] = compileDays.map(d => ({
      dayIndex: d.ep.dayOfWeek,
      materialId: d.ep.id,
      fileId: d.ep.repositoryFileId,
      override: d.override,
      label: `${DAY_NAMES[d.ep.dayOfWeek]} — ${d.ep.title}`,
    }));
    await compileFromCloud({
      weekId: selectedWeekId,
      finalFilename: compileFinalFilename.trim(),
      days,
    });
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
          <Select value={selectedWeekId} onValueChange={setSelectedWeekId} disabled={isProcessing || isCompiling}>
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

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'process' | 'compile')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="process" disabled={isCompiling}>
              <Layers className="w-3.5 h-3.5 mr-1.5" /> Processar do zero
            </TabsTrigger>
            <TabsTrigger value="compile" disabled={isProcessing}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Compilar da nuvem
            </TabsTrigger>
          </TabsList>

          <TabsContent value="process" className="space-y-3 mt-3">

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
            Enviar diários para OneDrive (consolidado de domingo sempre baixa local)
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
        {generateFinalEpisode && finalEpisodeStatus.state !== 'idle' && (
          <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs font-mono flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Cloud className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                Consolidado:{' '}
                {finalEpisodeStatus.state === 'uploading' && 'processando...'}
                {finalEpisodeStatus.state === 'done' && `baixado local — ${finalEpisodeStatus.uploadedFilename || 'episodio_final'}.mp3`}
                {finalEpisodeStatus.state === 'error' && `erro — ${finalEpisodeStatus.error}`}
              </span>
            </div>
            {finalEpisodeStatus.state === 'done' && finalEpisodeStatus.webUrl && (
              <a
                href={finalEpisodeStatus.webUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline shrink-0"
              >
                abrir
              </a>
            )}
          </div>
        )}
        {logs.length > 0 && <ProcessLog logs={logs} />}
          </TabsContent>

          <TabsContent value="compile" className="space-y-3 mt-3">
            {!selectedWeekId ? (
              <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-center text-xs font-mono text-muted-foreground">
                Selecione uma semana para listar os episódios disponíveis na nuvem.
              </div>
            ) : compileDays.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-center text-xs font-mono text-muted-foreground">
                Nenhum episódio (Seg–Sáb) cadastrado nessa semana.
              </div>
            ) : (
              <>
                <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-[11px] font-mono text-muted-foreground">
                  Compila <strong>Intro + Seg + Ter + Qua + Qui + Sex + Sáb + Outro</strong> com os MP3s já no OneDrive e baixa local. <span className="text-foreground">Não sobe nada nem altera o banco.</span>
                </div>

                <div className="space-y-2">
                  {compileDays.map(({ ep, hasCloud, override }) => {
                    const ready = hasCloud || !!override;
                    return (
                      <div
                        key={ep.id}
                        className={`rounded-md border p-2.5 ${
                          ready ? 'border-primary/30 bg-primary/5' : 'border-destructive/30 bg-destructive/5'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-mono">
                              {DAY_NAMES[ep.dayOfWeek]}
                            </span>
                            <span className="text-xs font-mono truncate">{ep.title}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono shrink-0">
                            {hasCloud && !override && (
                              <span className="flex items-center gap-1 text-primary">
                                <Cloud className="w-3 h-3" /> nuvem
                              </span>
                            )}
                            {override && (
                              <span className="flex items-center gap-1 text-primary">
                                <FileAudio className="w-3 h-3" /> local
                              </span>
                            )}
                            {!hasCloud && !override && (
                              <span className="flex items-center gap-1 text-destructive">
                                <CloudOff className="w-3 h-3" /> faltando
                              </span>
                            )}
                          </div>
                        </div>
                        {!hasCloud && (
                          <label className="block mt-2 cursor-pointer">
                            <div className={`text-[10px] border border-dashed rounded px-2 py-1.5 truncate transition-colors ${
                              override ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                            }`}>
                              {override ? `📎 ${override.name}` : 'Arraste um MP3 ou clique para enviar'}
                            </div>
                            <input
                              type="file"
                              accept=".mp3,audio/mpeg"
                              className="hidden"
                              disabled={isCompiling}
                              onChange={(e) => {
                                const f = e.target.files?.[0] || null;
                                setCompileOverrides(prev => ({ ...prev, [ep.dayOfWeek]: f }));
                                e.target.value = '';
                              }}
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-mono text-muted-foreground">Nome do arquivo final</Label>
                  <Input
                    value={compileFinalFilename}
                    onChange={(e) => setCompileFinalFilename(e.target.value)}
                    placeholder="Heavynauta_S##.mp3"
                    className="h-9 text-sm font-mono"
                    disabled={isCompiling}
                  />
                </div>

                <div className="text-[11px] font-mono text-muted-foreground">
                  Pronto: <span className={compileReadyCount === 6 ? 'text-primary' : 'text-destructive'}>{compileReadyCount}/6</span> dias
                </div>

                <Button onClick={handleCompile} disabled={!canCompile} className="w-full h-10">
                  {isCompiling ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Compilando...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Download className="w-4 h-4" /> Baixar consolidado
                    </span>
                  )}
                </Button>

                {(isCompiling || compileProgress > 0) && (
                  <div className="space-y-2">
                    <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${compileProgress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                      <span>{compileProgressLabel || '—'}</span>
                      <span>{compileProgress}%</span>
                    </div>
                  </div>
                )}

                {compileLogs.length > 0 && <ProcessLog logs={compileLogs} />}
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
