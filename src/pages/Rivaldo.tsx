import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Cloud, CloudUpload, ExternalLink, Layers, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useApp } from '@/contexts/AppContext';
import { useRivaldo } from '@/contexts/RivaldoContext';
import { useRivaldoBulk } from '@/contexts/RivaldoBulkContext';
import { GranularProgress } from '@/components/rivaldo/GranularProgress';
import { UploadSlot } from '@/components/rivaldo/UploadSlot';
import { BgmLibraryModal } from '@/components/rivaldo/BgmLibraryModal';
import { ProcessLog } from '@/components/rivaldo/ProcessLog';
import { ParametersSidebar } from '@/components/rivaldo/ParametersSidebar';
import { MultiTrackMaster } from '@/components/rivaldo/MultiTrackMaster';
import { BulkModal } from '@/components/rivaldo/BulkModal';
import { ElapsedTimer } from '@/components/rivaldo/ElapsedTimer';
import { ProcessingReportPanel } from '@/components/rivaldo/ProcessingReportPanel';
import { DesktopJobsPanel } from '@/components/rivaldo/DesktopJobsPanel';
import { HeavynautaBrand } from '@/components/rivaldo/HeavynautaBrand';
import { EpisodePickerModal } from '@/components/rivaldo/EpisodePickerModal';
import { AgenticToggle } from '@/components/rivaldo/AgenticToggle';
import { ChevronDown } from 'lucide-react';
import { mergeQueuedJobIntoState, prepareDesktopPipelinePayload } from '@/lib/desktop/queue';
import {
  AudioParams,
  DEFAULT_PARAMS,
  DEFAULT_PROCESSING_PROFILE,
  LogEntry,
  ProcessingProfile,
} from '@/lib/audio/types';
import { getDesktopApi, isDesktopRuntime } from '@/lib/desktop/runtime';
import { DesktopState } from '@/lib/desktop/types';
import { isRivaldoStandaloneMaterial } from '@/lib/rivaldo-episodes';

const PUBLIC_BASE_URL = import.meta.env.BASE_URL;
const INTRO_PRESETS = [{ label: 'Heavynauta', url: `${PUBLIC_BASE_URL}presets/Heavynauta_Intro.mp3` }];
const OUTRO_PRESETS = [{ label: 'Heavynauta', url: `${PUBLIC_BASE_URL}presets/heavynaura_outro.mp3` }];

const NON_MASTER_SLOTS = [
  { key: 'intro' as const, label: 'Intro', sublabel: 'A Abertura', presets: INTRO_PRESETS },
  { key: 'outro' as const, label: 'Outro', sublabel: 'O Encerramento', presets: OUTRO_PRESETS },
];

type SlotKey = 'bgm' | 'intro' | 'outro';
type QueueFeedback = { type: 'info' | 'success' | 'error'; message: string } | null;

const Rivaldo = () => {
  const { materials, weeks, refreshMaterials } = useApp();
  const [files, setFiles] = useState<Record<SlotKey, File | null>>({ bgm: null, intro: null, outro: null });
  const [masterMode, setMasterMode] = useState<'single' | 'multi'>('single');
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [masterTracks, setMasterTracks] = useState<File[]>([]);
  const [filename, setFilename] = useState('');

  const DAY_NAMES: Record<number, string> = { 0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado' };

  // Pré-produção grava os espelhos depois do carregamento global inicial.
  // Atualizar ao entrar no Rivaldo evita que a lista use um snapshot antigo.
  useEffect(() => {
    void refreshMaterials();
  }, [refreshMaterials]);

  // Episode titles from all materials that have generated titles
  const episodeGroups = useMemo(() => {
    const eligibleMaterials = materials
      .filter(m => {
        const opts = Array.isArray(m.title_options_json) ? m.title_options_json as { text: string }[] : [];
        // Skip episodes already uploaded to OneDrive
        if (m.repository_url) return false;
        return opts.length > 0 && opts.some(o => o.text);
      })
      .map(m => {
        const opts = Array.isArray(m.title_options_json) ? m.title_options_json as { text: string }[] : [];
        const title = (m.selected_title_index != null && opts[m.selected_title_index]?.text)
          ? opts[m.selected_title_index].text
          : opts[0]?.text || `Episódio ${m.slot_key}`;
        const d = new Date(`${m.episode_date}T12:00:00`);
        const dayName = DAY_NAMES[d.getDay()] || '';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const isStandalone = isRivaldoStandaloneMaterial(m);
        const label = isStandalone
          ? `[Avulso ${dd}/${mm}] - ${title}`
          : `[${dayName}] - ${title}`;
        return { value: title, label, date: m.episode_date, week_id: m.week_id, materialId: m.id, repositoryUrl: m.repository_url, isStandalone };
      })
      .filter(o => o.value);

    // Group by week; standalones are bucketed into a single "Avulsos" group regardless of synthetic week_id
    const groups: { weekLabel: string; weekId: string; items: typeof eligibleMaterials }[] = [];
    const byWeek = new Map<string, typeof eligibleMaterials>();
    const standalones: typeof eligibleMaterials = [];
    for (const item of eligibleMaterials) {
      if (item.isStandalone) { standalones.push(item); continue; }
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
      // Oldest → newest
      return (wa?.start_date || '').localeCompare(wb?.start_date || '');
    });

    if (standalones.length > 0) {
      standalones.sort((a, b) => a.date.localeCompare(b.date));
      groups.push({ weekLabel: 'Episódios Avulsos', weekId: '__standalone__', items: standalones });
    }

    return groups;
  }, [materials, weeks]);
  const rivaldo = useRivaldo();
  const bulk = useRivaldoBulk();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [bgmLibraryOpen, setBgmLibraryOpen] = useState(false);
  const [uploadToCloud, setUploadToCloud] = useState(true); // default ON per user preference
  const [audioParams, setAudioParams] = useState<AudioParams>({ ...DEFAULT_PARAMS });
  const [processingProfile, setProcessingProfile] = useState<ProcessingProfile>({ ...DEFAULT_PROCESSING_PROFILE });
  const [desktopState, setDesktopState] = useState<DesktopState | null>(null);
  const [desktopStateError, setDesktopStateError] = useState<string | null>(null);
  const [uiLogs, setUiLogs] = useState<LogEntry[]>([]);
  const [queueFeedback, setQueueFeedback] = useState<QueueFeedback>(null);
  const [isQueueSubmitting, setIsQueueSubmitting] = useState(false);
  const desktopMode = isDesktopRuntime();
  const desktopApi = getDesktopApi();

  // Find the matching material/episode for the selected filename
  const selectedEpisode = useMemo(() => {
    for (const group of episodeGroups) {
      const found = group.items.find(it => it.value === filename);
      if (found) return found;
    }
    return null;
  }, [episodeGroups, filename]);

  // Use context state for browser mode, local state for desktop mode
  const progress = desktopMode ? (desktopState?.jobs[0]?.progress ?? 0) : rivaldo.progress;
  const progressLabel = desktopMode ? (desktopState?.jobs[0]?.progressLabel ?? '') : rivaldo.progressLabel;
  const logs = desktopMode ? (desktopState?.jobs[0]?.logs ?? []) : rivaldo.logs;
  const isProcessing = desktopMode ? Boolean(desktopState?.jobs.some(j => j.status === 'running' || j.status === 'pending')) : rivaldo.isProcessing;
  const trackReports = desktopMode ? (desktopState?.jobs[0]?.trackReports ?? []) : rivaldo.trackReports;
  const masterReport = desktopMode ? (desktopState?.jobs[0]?.masterReport ?? null) : rivaldo.masterReport;

  const handleFileChange = useCallback((key: SlotKey, file: File | null) => {
    setFiles((prev) => ({ ...prev, [key]: file }));
  }, []);

  const addUiLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setUiLogs((prev) => [...prev, { timestamp: Date.now(), message, type }].slice(-60));
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

  // Desktop sync is handled by the derived state above — no need for setState

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

    // Browser mode: use RivaldoContext for background processing
    await rivaldo.startPipeline(
      { masterMode, master: masterMode === 'single' ? masterFile : null, masterTracks: masterMode === 'multi' ? masterTracks : undefined, processingProfile, bgm: files.bgm!, intro: files.intro!, outro: files.outro!, filename: filename.trim() },
      audioParams,
      { enabled: uploadToCloud, episodeMaterialId: selectedEpisode?.materialId, episodeDate: selectedEpisode?.date, isStandalone: selectedEpisode?.isStandalone }
    );

    // Memory purge: clear file references after export
    if (masterMode === 'single') {
      setMasterFile(null);
    } else {
      setMasterTracks([]);
    }
  }, [addUiLog, allFilesReady, audioParams, desktopApi, desktopMode, desktopState, files, filename, masterFile, masterMode, masterTracks, processingProfile, rivaldo, uploadToCloud, selectedEpisode]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 flex items-center gap-4 border-b border-border">
        <HeavynautaBrand compact />
        <div className="flex-1 max-w-md ml-8">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full flex items-center justify-between gap-2 border-0 border-b border-border bg-transparent py-2 text-left text-sm font-mono hover:border-primary/60 focus:outline-none"
            title="Selecionar episódio"
          >
            <span className={filename ? 'truncate' : 'truncate text-muted-foreground'}>
              {filename || 'Selecione o episódio...'}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <AgenticToggle />
          {bulk.isProcessing && (
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-mono text-primary hover:bg-primary/20 transition-colors"
              title="Reabrir modal do bulk em andamento"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full"
              />
              <span className="truncate max-w-[160px]">{bulk.currentBatchName ?? 'Bulk em andamento'}</span>
              <span className="font-semibold">{Math.round(bulk.progress)}%</span>
            </button>
          )}
          <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)} className="flex items-center gap-1.5">
            <Layers className="w-4 h-4" /> Bulk 3.2
          </Button>
        </div>
      </div>

      <div className="flex-1 px-6 pb-6 pt-4 flex gap-6 overflow-y-auto">
        <div className="flex-1 flex flex-col gap-6">
          <MultiTrackMaster mode={masterMode} onModeChange={setMasterMode} singleFile={masterFile} onSingleFileChange={setMasterFile} multiFiles={masterTracks} onMultiFilesChange={setMasterTracks} processingProfile={processingProfile} disabled={isProcessing} />

          <div className="grid grid-cols-3 gap-4">
            {/* BGM slot — backed by the library */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className={`relative group rounded-lg p-6 transition-all duration-200 bg-card hover:bg-accent/10 ${files.bgm ? 'ring-1 ring-primary/30' : ''}`}
              style={{ boxShadow: '0 4px 20px -4px hsl(220 15% 0% / 0.5)' }}
            >
              <div className="absolute top-2 left-3">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">BGM</span>
              </div>
              <div className="flex flex-col items-center gap-3 justify-center min-h-[80px]">
                {files.bgm ? (
                  <>
                    <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center"><Sparkles className="w-4 h-4 text-primary" /></div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground truncate max-w-[180px]">{files.bgm.name}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-1">{(files.bgm.size / (1024 * 1024)).toFixed(1)} MB</p>
                    </div>
                  </>
                ) : (
                  <>
                    <Layers className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">BGM</p>
                      <p className="text-xs text-muted-foreground">A Trilha</p>
                    </div>
                  </>
                )}
                <Button size="sm" variant={files.bgm ? 'outline' : 'default'} onClick={() => setBgmLibraryOpen(true)}>
                  {files.bgm ? 'Trocar BGM' : 'Selecionar BGM'}
                </Button>
              </div>
              {files.bgm && (
                <button
                  onClick={() => handleFileChange('bgm', null)}
                  className="absolute top-2 right-2 p-1 rounded-full bg-secondary hover:bg-destructive/20 transition-colors"
                  aria-label="Remover BGM"
                >
                  <span className="text-xs">×</span>
                </button>
              )}
            </motion.div>

            {NON_MASTER_SLOTS.map((slot, index) => (
              <UploadSlot key={slot.key} label={slot.label} sublabel={slot.sublabel} file={files[slot.key]} onFileChange={(file) => handleFileChange(slot.key, file)} index={index + 2} presets={slot.presets} />
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
            {!desktopMode && (
              <div className="flex items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-2">
                  <Checkbox id="upload-cloud" checked={uploadToCloud} onCheckedChange={(v) => setUploadToCloud(v === true)} disabled={isProcessing} />
                  <Label htmlFor="upload-cloud" className="text-xs font-mono cursor-pointer flex items-center gap-1.5">
                    <Cloud className="w-3.5 h-3.5" /> Enviar para OneDrive
                    <span className="text-muted-foreground">(Snakepit/{new Date().getFullYear()}-W##)</span>
                  </Label>
                </div>
                {selectedEpisode?.repositoryUrl && (
                  <a href={selectedEpisode.repositoryUrl} target="_blank" rel="noreferrer" className="text-xs font-mono text-primary hover:underline flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" /> Já no Drive
                  </a>
                )}
              </div>
            )}
            {rivaldo.lastUpload && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-mono">
                <div className="flex items-center gap-2 text-primary truncate">
                  <CloudUpload className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{rivaldo.lastUpload.filename}</span>
                </div>
                <a href={rivaldo.lastUpload.webUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1 shrink-0">
                  <ExternalLink className="w-3 h-3" /> Abrir
                </a>
              </div>
            )}
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
      <EpisodePickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={setFilename} selected={filename} groups={episodeGroups} />
      <BgmLibraryModal open={bgmLibraryOpen} onOpenChange={setBgmLibraryOpen} onPick={(file) => handleFileChange('bgm', file)} />
    </div>
  );
};

export default Rivaldo;
