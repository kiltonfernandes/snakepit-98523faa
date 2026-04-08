import { useState, useCallback, useEffect, useMemo } from 'react';
import { Plus, Trash2, Layers, Play, FileAudio, X, Sparkles } from 'lucide-react';
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
import { runBulkPipeline, BulkItem } from '@/lib/audio/pipeline';
import { AudioParams, DEFAULT_PARAMS, LogEntry, ProcessingProfile } from '@/lib/audio/types';
import { ElapsedTimer } from '@/components/rivaldo/ElapsedTimer';
import { loadPresetAsFile } from '@/lib/assets/presets';
import { getDesktopApi } from '@/lib/desktop/runtime';
import { DesktopJob, DesktopState } from '@/lib/desktop/types';
import { prepareDesktopBulkPayload } from '@/lib/desktop/queue';

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

interface QueueRow {
  id: string;
  masterMode: 'single' | 'multi';
  masterFile: File | null;
  masterTracks: File[];
  bgmFile: File | null;
  bgmPreset: string | null;
  filename: string;
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

function createEmptyRow(): QueueRow {
  return {
    id: crypto.randomUUID(),
    masterMode: 'single',
    masterFile: null,
    masterTracks: [],
    bgmFile: null,
    bgmPreset: null,
    filename: '',
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
  const [rows, setRows] = useState<QueueRow[]>([createEmptyRow()]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [generateFinalEpisode, setGenerateFinalEpisode] = useState(true);
  const [desktopFeedback, setDesktopFeedback] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);
  const [isQueueSubmitting, setIsQueueSubmitting] = useState(false);
  const DAY_NAMES: Record<number, string> = { 0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado' };
  const [episodeTitles, setEpisodeTitles] = useState<{ id: string; title: string; label: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from('episode_materials')
        .select('id, title_options_json, selected_title_index, spotify_link, episode_date')
        .order('episode_date', { ascending: true });
      if (!data) return;
      const titles: { id: string; title: string; label: string }[] = [];
      for (const row of data) {
        const opts = Array.isArray(row.title_options_json) ? row.title_options_json : [];
        const idx = row.selected_title_index ?? 0;
        const selected = opts[idx] as { text?: string } | undefined;
        const title = selected?.text || (opts[0] as { text?: string })?.text;
        if (title) {
          const d = new Date(`${row.episode_date}T12:00:00`);
          const dayName = DAY_NAMES[d.getDay()] || '';
          titles.push({ id: row.id, title, label: `[${dayName}] - ${title}` });
        }
      }
      setEpisodeTitles(titles);
    })();
  }, [open]);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs((prev) => [...prev, { timestamp: Date.now(), message, type }]);
  }, []);

  const updateRow = (id: string, updates: Partial<QueueRow>) => {
    setRows((prev) => prev.map((row) => row.id === id ? { ...row, ...updates } : row));
  };

  const canStart = rows.every((row) => {
    const masterReady = row.masterMode === 'single' ? !!row.masterFile : row.masterTracks.length > 0;
    return masterReady && (row.bgmFile || row.bgmPreset) && row.filename.trim();
  }) && introFile && outroFile && !isProcessing && (!desktopMode || (desktopQueueAvailable && !isQueueSubmitting));

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
        introFile,
        outroFile,
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

      await runBulkPipeline(
        { items, intro: introFile!, outro: outroFile!, generateFinalEpisode },
        audioParams,
        (value, label) => {
          setProgress(value);
          setProgressLabel(label);
        },
        addLog,
        {
          exportMode: generateFinalEpisode ? 'blob' : 'download',
          onItemEncoded: generateFinalEpisode
            ? undefined
            : async (_item, _index, _result) => {
                addLog(`Download concluído: ${_item.filename}`, 'success');
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
            {desktopMode
              ? 'Cada item entra na fila desktop e pode renderizar com o app minimizado na bandeja.'
              : 'Cada item usa o mesmo perfil RNNoise + WPE configurado na tela principal.'}
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

        <div className="space-y-3 mt-2">
          {rows.map((row, idx) => (
            <motion.div
              key={row.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="border border-border rounded-lg p-3 space-y-2 bg-muted/30"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground">Episódio {idx + 1}</span>
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
                      {episodeTitles.map((ep) => (
                        <SelectItem key={ep.id} value={ep.title} className="text-xs font-mono">
                          {ep.label}
                        </SelectItem>
                      ))}
                      {episodeTitles.length === 0 && (
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
