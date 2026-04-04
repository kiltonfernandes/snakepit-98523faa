import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Layers, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApp } from '@/contexts/AppContext';
import { useRivaldo } from '@/contexts/RivaldoContext';
import { GranularProgress } from '@/components/rivaldo/GranularProgress';
import { UploadSlot } from '@/components/rivaldo/UploadSlot';
import { ProcessLog } from '@/components/rivaldo/ProcessLog';
import { ParametersSidebar } from '@/components/rivaldo/ParametersSidebar';
import { MultiTrackMaster } from '@/components/rivaldo/MultiTrackMaster';
import { BulkModal } from '@/components/rivaldo/BulkModal';
import { ElapsedTimer } from '@/components/rivaldo/ElapsedTimer';
import { ProcessingReportPanel } from '@/components/rivaldo/ProcessingReportPanel';
import { DesktopJobsPanel } from '@/components/rivaldo/DesktopJobsPanel';
import { HeavynautaBrand } from '@/components/rivaldo/HeavynautaBrand';
import { mergeQueuedJobIntoState, prepareDesktopPipelinePayload } from '@/lib/desktop/queue';
import { runPipeline } from '@/lib/audio/pipeline';
import {
  AudioParams,
  DEFAULT_PARAMS,
  DEFAULT_PROCESSING_PROFILE,
  LogEntry,
  MasterReport,
  ProcessingProfile,
  TrackReport,
} from '@/lib/audio/types';
import { getDesktopApi, isDesktopRuntime } from '@/lib/desktop/runtime';
import { DesktopState } from '@/lib/desktop/types';

const INTRO_PRESETS = [{ label: 'Heavynauta', url: '/presets/Heavynauta_Intro.mp3' }];
const OUTRO_PRESETS = [{ label: 'Heavynauta', url: '/presets/heavynaura_outro.mp3' }];
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

const NON_MASTER_SLOTS = [
  { key: 'bgm' as const, label: 'BGM', sublabel: 'A Trilha', presets: BGM_PRESETS },
  { key: 'intro' as const, label: 'Intro', sublabel: 'A Abertura', presets: INTRO_PRESETS },
  { key: 'outro' as const, label: 'Outro', sublabel: 'O Encerramento', presets: OUTRO_PRESETS },
];

type SlotKey = 'bgm' | 'intro' | 'outro';
type QueueFeedback = { type: 'info' | 'success' | 'error'; message: string } | null;

const Rivaldo = () => {
  const { materials, pautas, weeks } = useApp();
  const [files, setFiles] = useState<Record<SlotKey, File | null>>({ bgm: null, intro: null, outro: null });
  const [masterMode, setMasterMode] = useState<'single' | 'multi'>('single');
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [masterTracks, setMasterTracks] = useState<File[]>([]);
  const [filename, setFilename] = useState('');

  const DAY_NAMES: Record<number, string> = { 0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado' };

  // Episode titles from finalized pautas, grouped by week
  const episodeGroups = useMemo(() => {
    const finalizedPautaIds = new Set(
      pautas.filter(p => p.status === 'finalized').map(p => p.id)
    );
    const eligibleMaterials = materials
      .filter(m => m.source_pauta_id && finalizedPautaIds.has(m.source_pauta_id))
      .map(m => {
        const opts = Array.isArray(m.title_options_json) ? m.title_options_json as { text: string }[] : [];
        const title = (m.selected_title_index != null && opts[m.selected_title_index]?.text)
          ? opts[m.selected_title_index].text
          : opts[0]?.text || `Episódio ${m.slot_key}`;
        const d = new Date(`${m.episode_date}T12:00:00`);
        const dayName = DAY_NAMES[d.getDay()] || '';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const label = `[${dd}.${mm} - ${dayName}] - ${title}`;
        return { value: title, label, date: m.episode_date, week_id: m.week_id };
      })
      .filter(o => o.value);

    // Group by week
    const groups: { weekLabel: string; weekId: string; items: typeof eligibleMaterials }[] = [];
    const byWeek = new Map<string, typeof eligibleMaterials>();
    for (const item of eligibleMaterials) {
      if (!byWeek.has(item.week_id)) byWeek.set(item.week_id, []);
      byWeek.get(item.week_id)!.push(item);
    }

    for (const [weekId, items] of byWeek) {
      items.sort((a, b) => a.date.localeCompare(b.date));
      const week = weeks.find(w => w.id === weekId);
      const weekLabel = week ? `Semana de ${new Date(`${week.start_date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : weekId;
      groups.push({ weekLabel, weekId, items });
    }

    groups.sort((a, b) => {
      const wa = weeks.find(w => w.id === a.weekId);
      const wb = weeks.find(w => w.id === b.weekId);
      return (wb?.start_date || '').localeCompare(wa?.start_date || '');
    });

    return groups;
  }, [materials, pautas, weeks]);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [audioParams, setAudioParams] = useState<AudioParams>({ ...DEFAULT_PARAMS });
  const [processingProfile, setProcessingProfile] = useState<ProcessingProfile>({ ...DEFAULT_PROCESSING_PROFILE });
  const [trackReports, setTrackReports] = useState<TrackReport[]>([]);
  const [masterReport, setMasterReport] = useState<MasterReport | null>(null);
  const [desktopState, setDesktopState] = useState<DesktopState | null>(null);
  const [desktopStateError, setDesktopStateError] = useState<string | null>(null);
  const [uiLogs, setUiLogs] = useState<LogEntry[]>([]);
  const [queueFeedback, setQueueFeedback] = useState<QueueFeedback>(null);
  const [isQueueSubmitting, setIsQueueSubmitting] = useState(false);
  const desktopMode = isDesktopRuntime();
  const desktopApi = getDesktopApi();

  const handleFileChange = useCallback((key: SlotKey, file: File | null) => {
    setFiles((prev) => ({ ...prev, [key]: file }));
  }, []);

  const addUiLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setUiLogs((prev) => [...prev, { timestamp: Date.now(), message, type }].slice(-60));
  }, []);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs((prev) => [...prev, { timestamp: Date.now(), message, type }]);
  }, []);

  const masterReady = masterMode === 'single' ? !!masterFile : masterTracks.length > 0;
  const allFilesReady = masterReady && files.bgm && files.intro && files.outro && filename.trim();
  const desktopBridgeReady = desktopMode ? Boolean(desktopApi) : true;
  const desktopStateLoaded = desktopMode ? desktopState !== null && !desktopStateError : true;
  const queueAvailable = desktopMode ? desktopBridgeReady && desktopStateLoaded : true;
  const queueStatusMessage = desktopMode
    ? !desktopBridgeReady ? 'Bridge desktop indisponivel no renderer.'
    : desktopStateError ? desktopStateError
    : !desktopStateLoaded ? 'Fila desktop inicializando...'
    : null : null;
  const processDisabled = desktopMode
    ? !allFilesReady || !queueAvailable || isQueueSubmitting
    : (!allFilesReady || isProcessing);
  const activeDesktopJob = desktopState?.jobs.find((job) => job.id === desktopState.activeJobId) ?? null;
  const latestDesktopJob = activeDesktopJob ?? desktopState?.jobs[0] ?? null;
  const combinedLogs = [...uiLogs, ...logs].sort((a, b) => a.timestamp - b.timestamp);

  useEffect(() => {
    if (!desktopMode || !desktopApi) return;
    desktopApi.getState().then((state) => { setDesktopState(state); setDesktopStateError(null); }).catch(() => { setDesktopStateError('Falha ao carregar estado desktop.'); });
    const unsub = desktopApi.subscribeState((state) => { setDesktopState(state); setDesktopStateError(null); desktopApi.refreshTray(); });
    return () => unsub();
  }, [desktopApi, desktopMode]);

  useEffect(() => {
    if (!desktopMode || !latestDesktopJob) return;
    setProgress(latestDesktopJob.progress);
    setProgressLabel(latestDesktopJob.progressLabel);
    setLogs(latestDesktopJob.logs);
    setTrackReports(latestDesktopJob.trackReports);
    setMasterReport(latestDesktopJob.masterReport);
    setIsProcessing(latestDesktopJob.status === 'running' || latestDesktopJob.status === 'pending');
  }, [desktopMode, latestDesktopJob]);

  const handleProcess = useCallback(async () => {
    if (!allFilesReady) return;
    if (desktopMode) {
      setQueueFeedback(null);
      if (!desktopApi) { addUiLog('Bridge desktop indisponivel.', 'error'); return; }
      const payloadResult = await prepareDesktopPipelinePayload({ desktopState, masterMode, masterFile, masterTracks, bgmFile: files.bgm, introFile: files.intro, outroFile: files.outro, processingProfile, audioParams, filename });
      if (!payloadResult.ok) { const e = (payloadResult as { ok: false; error: { message: string } }).error; setQueueFeedback({ type: 'error', message: e.message }); return; }
      setIsQueueSubmitting(true);
      try {
        const job = await desktopApi.enqueuePipelineJob(payloadResult.value);
        setDesktopState((prev) => mergeQueuedJobIntoState(prev, job));
        setQueueFeedback({ type: 'success', message: `Job ${job.name} enfileirado.` });
      } catch (error) { setQueueFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Falha ao criar job.' }); }
      finally { setIsQueueSubmitting(false); }
      return;
    }

    setIsProcessing(true); setProgress(0); setLogs([]); setTrackReports([]); setMasterReport(null);
    try {
      const result = await runPipeline(
        { masterMode, master: masterMode === 'single' ? masterFile : null, masterTracks: masterMode === 'multi' ? masterTracks : undefined, processingProfile, bgm: files.bgm!, intro: files.intro!, outro: files.outro!, filename: filename.trim() },
        audioParams, (value, label) => { setProgress(value); setProgressLabel(label); }, addLog
      );
      setTrackReports(result.trackReports); setMasterReport(result.masterReport);
      
      // Memory purge: nullify heavy references after successful export
      addLog('Memória liberada após export', 'info');
      // The finalBuffer is already downloaded by the pipeline (download mode).
      // Clear local file references to release memory
      if (masterMode === 'single') {
        setMasterFile(null);
      } else {
        setMasterTracks([]);
      }
    } catch (error) { addLog(error instanceof Error ? error.message : 'Erro no pipeline 3.2', 'error'); }
    finally { setIsProcessing(false); }
  }, [addLog, addUiLog, allFilesReady, audioParams, desktopApi, desktopMode, desktopState, files, filename, masterFile, masterMode, masterTracks, processingProfile]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 flex items-center gap-4 border-b border-border">
        <HeavynautaBrand compact />
        <div className="flex-1 max-w-md ml-8">
          <Select value={filename} onValueChange={setFilename}>
            <SelectTrigger className="w-full bg-transparent border-0 border-b border-border rounded-none focus:ring-0 text-sm font-mono h-auto py-2">
              <SelectValue placeholder="Selecione o episódio..." />
            </SelectTrigger>
            <SelectContent>
              {episodeGroups.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">Nenhuma pauta finalizada</div>
              )}
              {episodeGroups.map((group) => (
                <SelectGroup key={group.weekId}>
                  <SelectLabel className="text-xs font-semibold text-muted-foreground">{group.weekLabel}</SelectLabel>
                  {group.items.map((opt, i) => (
                    <SelectItem key={`${opt.value}-${i}`} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)} className="ml-auto flex items-center gap-1.5">
          <Layers className="w-4 h-4" /> Bulk 3.2
        </Button>
      </div>

      <div className="flex-1 px-6 pb-6 pt-4 flex gap-6 overflow-y-auto">
        <div className="flex-1 flex flex-col gap-6">
          <MultiTrackMaster mode={masterMode} onModeChange={setMasterMode} singleFile={masterFile} onSingleFileChange={setMasterFile} multiFiles={masterTracks} onMultiFilesChange={setMasterTracks} processingProfile={processingProfile} disabled={isProcessing} />

          <div className="grid grid-cols-3 gap-4">
            {NON_MASTER_SLOTS.map((slot, index) => (
              <UploadSlot key={slot.key} label={slot.label} sublabel={slot.sublabel} file={files[slot.key]} onFileChange={(file) => handleFileChange(slot.key, file)} index={index + 1} presets={slot.presets} />
            ))}
          </div>

          <div className="space-y-3">
            {(queueFeedback || queueStatusMessage) && (
              <div role={queueFeedback?.type === 'error' || desktopStateError ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-xs font-mono ${queueFeedback?.type === 'error' || desktopStateError ? 'border-destructive/40 bg-destructive/10 text-destructive' : queueFeedback?.type === 'success' ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-muted/40 text-muted-foreground'}`}>
                <div className="flex items-center gap-2">
                  {queueFeedback?.type === 'error' || desktopStateError ? <AlertCircle className="h-3.5 w-3.5 shrink-0" /> : queueFeedback?.type === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <Sparkles className="h-3.5 w-3.5 shrink-0" />}
                  <span>{queueFeedback?.message ?? queueStatusMessage}</span>
                </div>
              </div>
            )}
            <Button onClick={handleProcess} disabled={processDisabled} className="w-full h-12 text-sm font-semibold tracking-wide">
              {desktopMode ? (
                <span className="flex items-center gap-2"><Sparkles className="w-4 h-4" />{isQueueSubmitting ? 'Enfileirando...' : 'Enfileirar Render 3.2'}</span>
              ) : isProcessing ? (
                <span className="flex items-center gap-2">
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full" />
                  Processando Rivaldo 3.2...
                </span>
              ) : (
                <span className="flex items-center gap-2"><Sparkles className="w-4 h-4" />Process & Export 3.2</span>
              )}
            </Button>
            <ElapsedTimer isRunning={isProcessing} />
            <GranularProgress progress={progress} label={progressLabel} isRunning={isProcessing} />
          </div>

          <ProcessingReportPanel trackReports={trackReports} masterReport={masterReport} />
          {desktopMode && desktopState && <DesktopJobsPanel jobs={desktopState.jobs} activeJobId={desktopState.activeJobId} />}
          <ProcessLog logs={combinedLogs} />
        </div>

        <div className="w-72 shrink-0 hidden lg:block">
          <ParametersSidebar params={audioParams} onParamsChange={setAudioParams} profile={processingProfile} onProfileChange={setProcessingProfile} />
        </div>
      </div>

      <BulkModal open={bulkOpen} onOpenChange={setBulkOpen} introFile={files.intro} outroFile={files.outro} audioParams={audioParams} processingProfile={processingProfile} desktopMode={desktopMode} desktopState={desktopState} desktopQueueAvailable={queueAvailable} desktopQueueStatusMessage={queueStatusMessage} onDesktopJobQueued={(job) => { setDesktopState((prev) => mergeQueuedJobIntoState(prev, job)); setQueueFeedback({ type: 'success', message: `Job ${job.name} enfileirado.` }); addUiLog(`Job ${job.name} enfileirado.`, 'success'); }} />
    </div>
  );
};

export default Rivaldo;
