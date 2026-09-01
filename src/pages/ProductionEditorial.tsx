import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, addMonths, format, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, ChevronLeft, ChevronRight, FileAudio, FolderOpen, Loader2, Mic, Music2, Plus, Radio, RefreshCw, Sparkles, Upload, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { normalizePreprodPauta, type PreprodPauta } from '@/lib/preprod-calendar';
import { syncPreprodToEpisodeMaterial } from '@/lib/preprod-rivaldo-sync';
import type { EpisodeMaterial } from '@/lib/types';
import { listBgm, type BgmTrack } from '@/lib/bgm-library';
import { buildEditorialRawFolderPath, uploadEpisodeToOneDrive } from '@/lib/storage/onedrive';
import {
  buildEditorialQueueData,
  distributePublicationDates,
  editorialData,
  editorialLabel,
  editorialStage,
  editorialStageMeta,
  editorialTitles,
  hasRawAsset,
  isEditorialQueueItem,
  isSpotifyUrl,
  isTitleLocked,
  selectedEditorialTitle,
  shuffleEditorialQueue,
  type EditorialPautaLike,
  type EditorialTitle,
} from '@/lib/editorial-queue';
import { MarkdownView } from '@/components/shared/MarkdownView';

type ViewMode = 'flow' | 'calendar';
type QueueRow = PreprodPauta & EditorialPautaLike;

const WEEKDAYS = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
];

function dateLabel(date: string) {
  return format(new Date(`${date.slice(0, 10)}T12:00:00`), "EEE, dd 'de' MMM", { locale: ptBR });
}

function normalizeGenre(value: string) {
  return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function matchingBgm(genre: string, tracks: BgmTrack[]) {
  const wanted = normalizeGenre(genre);
  if (!wanted) return [];
  return tracks.filter((track) => track.genres.some((candidate) => {
    const value = normalizeGenre(candidate);
    return value === wanted || value.includes(wanted) || wanted.includes(value);
  })).slice(0, 3);
}

export default function ProductionEditorial() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewMode>('flow');
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [pautas, setPautas] = useState<QueueRow[]>([]);
  const [materials, setMaterials] = useState<EpisodeMaterial[]>([]);
  const [tracks, setTracks] = useState<BgmTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueOpen, setQueueOpen] = useState(false);
  const [selected, setSelected] = useState<QueueRow | null>(null);
  const syncingMaterialIds = useRef(new Set<string>());

  const load = useCallback(async () => {
    setLoading(true);
    const [pautasResult, materialsResult, bgmResult] = await Promise.all([
      supabase.from('preprod_pautas' as any).select('*').order('publication_date', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('episode_materials' as any).select('*').order('episode_date', { ascending: true }),
      listBgm().catch(() => [] as BgmTrack[]),
    ]);
    setLoading(false);
    if (pautasResult.error) {
      toast.error(`Falha ao carregar Produção Editorial: ${pautasResult.error.message}`);
      return;
    }
    setPautas(((pautasResult.data || []) as any[]).map(normalizePreprodPauta) as QueueRow[]);
    if (!materialsResult.error) setMaterials((materialsResult.data || []) as EpisodeMaterial[]);
    setTracks(bgmResult);
  }, []);

  const requestProcessing = useCallback(async () => {
    const { error } = await supabase.functions.invoke('process-editorial-queue', { body: { action: 'reconcile' } });
    if (error) console.warn('[editorial] processamento não iniciado', error.message);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void requestProcessing(); }, [requestProcessing]);

  useEffect(() => {
    const channel = supabase
      .channel('production-editorial-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'preprod_pautas' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as any)?.id;
          if (id) setPautas((prev) => prev.filter((row) => row.id !== id));
          return;
        }
        if (payload.new) {
          const next = normalizePreprodPauta(payload.new) as QueueRow;
          setPautas((prev) => {
            const index = prev.findIndex((row) => row.id === next.id);
            if (index < 0) return [...prev, next].sort((a, b) => `${a.publication_date}${a.created_at}`.localeCompare(`${b.publication_date}${b.created_at}`));
            const copy = [...prev];
            copy[index] = next;
            return copy;
          });
          setSelected((current) => current?.id === next.id ? next : current);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'episode_materials' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const automaticPautas = useMemo(() => pautas.filter(isEditorialQueueItem), [pautas]);
  const materialByPauta = useMemo(() => new Map(materials.filter((material) => material.preprod_pauta_id).map((material) => [material.preprod_pauta_id as string, material])), [materials]);

  useEffect(() => {
    const missingMirrors = automaticPautas.filter((row) => editorialStage(row) === 'ready' && !materialByPauta.has(row.id) && !syncingMaterialIds.current.has(row.id));
    if (missingMirrors.length === 0) return;
    for (const row of missingMirrors) {
      syncingMaterialIds.current.add(row.id);
      void syncPreprodToEpisodeMaterial(row.id, row.publication_date, editorialData(row))
        .catch((error) => console.warn('[editorial] falha ao criar espelho do episódio', error))
        .finally(() => {
          syncingMaterialIds.current.delete(row.id);
          void load();
        });
    }
  }, [automaticPautas, load, materialByPauta]);

  const updatePauta = useCallback(async (row: QueueRow, patch: Record<string, unknown>, status = row.status) => {
    const data = { ...editorialData(row), ...patch };
    const { data: saved, error } = await supabase
      .from('preprod_pautas' as any)
      .update({ data, status })
      .eq('id', row.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const normalized = normalizePreprodPauta(saved) as QueueRow;
    setPautas((prev) => prev.map((item) => item.id === normalized.id ? normalized : item));
    setSelected((current) => current?.id === normalized.id ? normalized : current);
    return normalized;
  }, []);

  const saveSpotify = useCallback(async (row: QueueRow, spotifyLink: string) => {
    const materialId = materialByPauta.get(row.id)?.id || await syncPreprodToEpisodeMaterial(row.id, row.publication_date, editorialData(row));
    const { error } = await supabase
      .from('episode_materials' as any)
      .update({ spotify_link: spotifyLink.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', materialId);
    if (error) throw new Error(error.message);
    if (spotifyLink.trim()) await updatePauta(row, { editorial_stage: 'scheduled' }, 'scheduled');
    await load();
  }, [load, materialByPauta, updatePauta]);

  const uploadRaw = useCallback(async (row: QueueRow, file: File, onProgress: (percent: number) => void) => {
    const uploaded = await uploadEpisodeToOneDrive({
      folderPath: buildEditorialRawFolderPath(row.id),
      filename: `raw-${row.publication_date}-${file.name}`,
      blob: file,
      onProgress: ({ fraction }) => onProgress(Math.round(fraction * 100)),
    });
    await updatePauta(row, {
      raw_asset: {
        file_id: uploaded.fileId,
        web_url: uploaded.webUrl,
        download_url: uploaded.downloadUrl || null,
        filename: uploaded.filename,
        uploaded_at: new Date().toISOString(),
      },
      editorial_stage: 'raw_available',
      buffer_role: 'completed',
    }, 'raw_available');
    await requestProcessing();
  }, [requestProcessing, updatePauta]);

  const regenerateTitles = useCallback(async (row: QueueRow, titleIndex?: number) => {
    const { data, error } = await supabase.functions.invoke('process-editorial-queue', {
      body: { action: 'regenerate_titles', pautaId: row.id, titleIndex },
    });
    if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error || 'Falha ao regenerar títulos');
    toast.success(titleIndex === undefined ? 'Três títulos regenerados' : 'Título regenerado');
    await load();
  }, [load]);

  const counters = useMemo(() => ({
    active: automaticPautas.filter((row) => editorialStage(row) === 'ready' && editorialData(row).buffer_role === 'active').length,
    reserve: automaticPautas.filter((row) => editorialStage(row) === 'ready' && editorialData(row).buffer_role === 'reserve').length,
    processing: automaticPautas.filter((row) => ['planned', 'researching', 'writing'].includes(editorialStage(row))).length,
    recorded: automaticPautas.filter(hasRawAsset).length,
  }), [automaticPautas]);

  const stages = useMemo(() => ({
    processing: automaticPautas.filter((row) => ['planned', 'researching', 'writing', 'blocked'].includes(editorialStage(row))),
    active: automaticPautas.filter((row) => editorialStage(row) === 'ready' && editorialData(row).buffer_role === 'active'),
    reserve: automaticPautas.filter((row) => editorialStage(row) === 'ready' && editorialData(row).buffer_role === 'reserve'),
    production: automaticPautas.filter((row) => ['raw_available', 'final_available', 'scheduled'].includes(editorialStage(row)) || hasRawAsset(row)),
  }), [automaticPautas]);

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Radio className="h-6 w-6 text-primary" /> Produção Editorial</h1>
          <p className="mt-1 text-sm text-muted-foreground">Fila automática, pauta, áudio, Rivaldo e agendamento no mesmo lugar.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { void requestProcessing(); toast.message('Verificando a fila em segundo plano'); }}><RefreshCw className="h-3.5 w-3.5" /> Atualizar fila</Button>
          <Button size="sm" className="gap-2" onClick={() => setQueueOpen(true)}><Plus className="h-4 w-4" /> Adicionar álbuns</Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Prontas para gravar" value={`${counters.active}/2`} icon={<Mic className="h-4 w-4" />} tone="text-emerald-500" />
        <Metric label="Reserva pronta" value={`${counters.reserve}/1`} icon={<CheckCircle2 className="h-4 w-4" />} tone="text-violet-500" />
        <Metric label="Em segundo plano" value={counters.processing} icon={<Sparkles className="h-4 w-4" />} tone="text-sky-500" />
        <Metric label="Raw enviado" value={counters.recorded} icon={<FileAudio className="h-4 w-4" />} tone="text-amber-500" />
      </section>

      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <Tabs value={view} onValueChange={(value) => setView(value as ViewMode)}>
          <TabsList><TabsTrigger value="flow">Fluxo</TabsTrigger><TabsTrigger value="calendar">Calendário</TabsTrigger></TabsList>
        </Tabs>
        {view === 'calendar' && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setMonth((current) => addMonths(current, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-40 text-center text-sm font-semibold capitalize">{format(month, 'MMMM yyyy', { locale: ptBR })}</span>
            <Button variant="ghost" size="icon" onClick={() => setMonth((current) => addMonths(current, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando produção editorial...</div>
      ) : automaticPautas.length === 0 ? (
        <EmptyState onAdd={() => setQueueOpen(true)} />
      ) : view === 'flow' ? (
        <div className="grid gap-4 xl:grid-cols-4">
          <StageColumn title="Em segundo plano" subtitle="Pesquisa e pauta" items={stages.processing} materials={materialByPauta} onOpen={setSelected} />
          <StageColumn title="Prontas para gravar" subtitle="Duas pautas ativas" items={stages.active} materials={materialByPauta} onOpen={setSelected} />
          <StageColumn title="Reserva" subtitle="Pronta para assumir" items={stages.reserve} materials={materialByPauta} onOpen={setSelected} />
          <StageColumn title="Áudio e Spotify" subtitle="Raw, final e agenda" items={stages.production} materials={materialByPauta} onOpen={setSelected} />
        </div>
      ) : (
        <EditorialCalendar month={month} items={automaticPautas} materials={materialByPauta} onOpen={setSelected} />
      )}

      <QueueDialog
        open={queueOpen}
        onOpenChange={(next) => { setQueueOpen(next); if (next) void load(); }}
        bgmTracks={tracks}
        onSaved={async () => { await load(); await requestProcessing(); }}
      />
      <EpisodeDialog
        item={selected}
        material={selected ? materialByPauta.get(selected.id) || null : null}
        genres={Array.from(new Set(tracks.flatMap((track) => track.genres))).sort()}
        suggestedBgms={selected ? matchingBgm(String(editorialData(selected).genre || ''), tracks) : []}
        onClose={() => setSelected(null)}
        onUpdate={updatePauta}
        onUploadRaw={uploadRaw}
        onSaveSpotify={saveSpotify}
        onRegenerateTitles={regenerateTitles}
        onOpenRivaldo={(item) => navigate(`/rivaldo?preprod=${item.id}`)}
      />
    </motion.div>
  );
}

function Metric({ label, value, icon, tone }: { label: string; value: string | number; icon: ReactNode; tone: string }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><span className={cn('rounded-md bg-muted p-2', tone)}>{icon}</span><div><p className="text-xl font-bold leading-none">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div></CardContent></Card>;
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 py-20 text-center"><Music2 className="mx-auto h-10 w-10 text-primary" /><h2 className="mt-4 text-lg font-semibold">Sua fila editorial está vazia</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Informe a data inicial, os dias de publicação e a lista de álbuns. O Heavynauta distribui a agenda e prepara as três primeiras pautas.</p><Button className="mt-5 gap-2" onClick={onAdd}><Plus className="h-4 w-4" /> Criar fila de álbuns</Button></div>;
}

function StageColumn({ title, subtitle, items, materials, onOpen }: { title: string; subtitle: string; items: QueueRow[]; materials: Map<string, EpisodeMaterial>; onOpen: (item: QueueRow) => void }) {
  return <section className="min-h-52 rounded-xl border border-border bg-muted/15 p-3"><div className="mb-3 flex items-start justify-between"><div><h2 className="text-sm font-semibold">{title}</h2><p className="text-[11px] text-muted-foreground">{subtitle}</p></div><Badge variant="secondary" className="font-mono text-[10px]">{items.length}</Badge></div><div className="space-y-2">{items.length === 0 ? <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">Nenhum episódio aqui.</p> : items.map((item) => <EditorialCard key={item.id} item={item} material={materials.get(item.id) || null} onOpen={onOpen} />)}</div></section>;
}

function EditorialCard({ item, material, onOpen, compact = false }: { item: QueueRow; material: EpisodeMaterial | null; onOpen: (item: QueueRow) => void; compact?: boolean }) {
  const data = editorialData(item);
  const meta = editorialStageMeta(item);
  const title = selectedEditorialTitle(item);
  return <button type="button" onClick={() => onOpen(item)} className={cn('w-full rounded-lg border border-border bg-card p-3 text-left transition hover:border-primary/45 hover:bg-accent/20', compact && 'p-2')}>
    <div className="flex items-start justify-between gap-2"><span className="min-w-0 text-sm font-semibold leading-snug">{editorialLabel(item)}</span><span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium', meta.className)}>{meta.label}</span></div>
    <p className="mt-1 text-[11px] capitalize text-muted-foreground">{dateLabel(item.publication_date)}{data.genre ? ` · ${String(data.genre)}` : ''}</p>
    {title && <p className="mt-2 line-clamp-2 text-xs text-foreground/80">{title}</p>}
    <div className="mt-2 flex flex-wrap gap-1 text-[9px] text-muted-foreground">
      {data.buffer_role === 'active' && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">ativa</span>}
      {data.buffer_role === 'reserve' && <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-violet-700 dark:text-violet-300">reserva</span>}
      {hasRawAsset(item) && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">raw</span>}
      {material?.repository_url && <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-indigo-700 dark:text-indigo-300">final</span>}
      {material?.spotify_link && <span className="rounded bg-fuchsia-500/10 px-1.5 py-0.5 text-fuchsia-700 dark:text-fuchsia-300">Spotify</span>}
      {data.last_error && <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-700 dark:text-rose-300">atenção</span>}
    </div>
  </button>;
}

function EditorialCalendar({ month, items, materials, onOpen }: { month: Date; items: QueueRow[]; materials: Map<string, EpisodeMaterial>; onOpen: (item: QueueRow) => void }) {
  const byDate = useMemo(() => items.reduce<Record<string, QueueRow[]>>((map, item) => { (map[item.publication_date] ||= []).push(item); return map; }, {}), [items]);
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  return <div className="rounded-xl border border-border bg-card p-3"><div className="mb-2 grid grid-cols-7 gap-1">{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => <div key={day} className="py-1 text-center text-xs font-semibold text-muted-foreground">{day}</div>)}</div><div className="grid grid-cols-7 gap-1">{days.map((day) => { const key = format(day, 'yyyy-MM-dd'); const dateItems = byDate[key] || []; return <div key={key} className={cn('min-h-32 rounded-lg border border-border p-1.5', !isSameMonth(day, month) && 'opacity-35', isToday(day) && 'border-primary')}><div className={cn('mb-1 text-xs font-semibold', isToday(day) && 'text-primary')}>{format(day, 'd')}</div><div className="space-y-1">{dateItems.slice(0, 2).map((item) => <EditorialCard key={item.id} item={item} material={materials.get(item.id) || null} onOpen={onOpen} compact />)}{dateItems.length > 2 && <p className="px-1 text-[10px] text-muted-foreground">+{dateItems.length - 2} itens</p>}</div></div>; })}</div></div>;
}

function QueueDialog({ open, onOpenChange, bgmTracks, onSaved }: { open: boolean; onOpenChange: (value: boolean) => void; bgmTracks: BgmTrack[]; onSaved: () => Promise<void> }) {
  const [startDate, setStartDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [rows, setRows] = useState([{ artist: '', album: '', genre: '' }]);
  const [saving, setSaving] = useState(false);
  const genres = useMemo(() => Array.from(new Set([...bgmTracks.flatMap((track) => track.genres), ...rows.map((row) => row.genre).filter(Boolean)])).sort((a, b) => a.localeCompare(b)), [bgmTracks, rows]);

  const toggleWeekday = (day: number) => setWeekdays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day]);
  const changeRow = (index: number, field: 'artist' | 'album' | 'genre', value: string) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  const applyGenreToBlank = (genre: string) => setRows((current) => current.map((row) => row.genre ? row : { ...row, genre }));

  const save = async () => {
    const albums = rows.map((row) => ({ artist: row.artist.trim(), album: row.album.trim(), genre: row.genre.trim() })).filter((row) => row.artist && row.album);
    if (!startDate || weekdays.length === 0 || albums.length === 0) { toast.error('Informe data inicial, dias de publicação e pelo menos uma banda com álbum.'); return; }
    const pendingBgm = albums.filter((album) => matchingBgm(album.genre, bgmTracks).length === 0);
    const eligibleAlbums = albums.filter((album) => matchingBgm(album.genre, bgmTracks).length > 0);
    if (eligibleAlbums.length === 0) { toast.error('Cadastre um BGM para o gênero informado antes de criar a pauta.'); return; }
    setSaving(true);
    try {
      const dates = distributePublicationDates(startDate, weekdays, eligibleAlbums.length);
      const shuffledAlbums = shuffleEditorialQueue(eligibleAlbums);
      const inserts = shuffledAlbums.map((album, index) => ({ publication_date: dates[index], kind: 'review', status: 'planned', data: buildEditorialQueueData(album, index + 1) }));
      const { error } = await supabase.from('preprod_pautas' as any).insert(inserts as any);
      if (error) throw error;
      const { error: processError } = await supabase.functions.invoke('process-editorial-queue', { body: { action: 'reconcile' } });
      if (processError) console.warn('[editorial] fila salva sem disparo imediato', processError.message);
      if (pendingBgm.length > 0) {
        setRows(pendingBgm);
        toast.warning(`${eligibleAlbums.length} álbum(ns) adicionados. ${pendingBgm.length} aguardam BGM no Rivaldo.`);
      } else {
        toast.success(`${eligibleAlbums.length} álbuns adicionados. As três primeiras pautas começaram a ser preparadas.`);
        setRows([{ artist: '', album: '', genre: '' }]);
        onOpenChange(false);
      }
      await onSaved();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Falha ao salvar a fila.'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Adicionar álbuns à fila</DialogTitle>
          <DialogDescription>Informe somente banda, álbum e gênero. Ao salvar, os álbuns serão sorteados antes de receberem as datas de publicação.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-3">
            <div className="space-y-1.5"><Label>Data inicial</Label><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
            <div className="space-y-2"><Label>Dias de publicação</Label><div className="flex flex-wrap gap-1.5">{WEEKDAYS.map((day) => <Button key={day.value} type="button" size="sm" variant={weekdays.includes(day.value) ? 'default' : 'outline'} className="h-8 px-2 text-xs" onClick={() => toggleWeekday(day.value)}>{day.label}</Button>)}</div></div>
            <p className="text-xs text-muted-foreground">Um álbum por dia selecionado. A primeira data não permitida avança para o próximo dia disponível.</p>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_1fr_34px] gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"><span>Banda</span><span>Álbum</span><span>Gênero</span><span /></div>
            <ScrollArea className="h-72 rounded-lg border border-border">
              <div className="space-y-2 p-2">
                {rows.map((row, index) => {
                  const hasAlbum = Boolean(row.artist.trim() && row.album.trim());
                  const supported = matchingBgm(row.genre, bgmTracks).length > 0;
                  const needsBgm = hasAlbum && !supported;
                  return <div key={index} className={cn('rounded-md p-1', needsBgm && 'bg-amber-500/10')}>
                    <div className="grid grid-cols-[1fr_1fr_1fr_34px] gap-2"><Input value={row.artist} onChange={(event) => changeRow(index, 'artist', event.target.value)} placeholder="Banda" /><Input value={row.album} onChange={(event) => changeRow(index, 'album', event.target.value)} placeholder="Álbum" /><Input value={row.genre} onChange={(event) => changeRow(index, 'genre', event.target.value)} placeholder="Gênero" list="editorial-genre-options" /><Button type="button" variant="ghost" size="icon" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>×</Button></div>
                    {needsBgm && <p className="px-1 pt-1 text-[10px] text-amber-700 dark:text-amber-300">{row.genre.trim() ? `BGM para “${row.genre.trim()}” ainda não está na biblioteca do Rivaldo. Esta pauta não será criada.` : 'Escolha um gênero e cadastre um BGM correspondente no Rivaldo antes de criar a pauta.'}</p>}
                  </div>;
                })}
              </div>
            </ScrollArea>
            <datalist id="editorial-genre-options">{genres.map((genre) => <option key={genre} value={genre} />)}</datalist>
            <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setRows((current) => [...current, { artist: '', album: '', genre: '' }])}><Plus className="mr-1 h-3.5 w-3.5" /> Linha</Button>{genres.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => applyGenreToBlank(genres[0])}>Aplicar “{genres[0]}” nas linhas vazias</Button>}</div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={saving} onClick={save}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar fila</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EpisodeDialog({ item, material, genres, suggestedBgms, onClose, onUpdate, onUploadRaw, onSaveSpotify, onRegenerateTitles, onOpenRivaldo }: { item: QueueRow | null; material: EpisodeMaterial | null; genres: string[]; suggestedBgms: BgmTrack[]; onClose: () => void; onUpdate: (row: QueueRow, patch: Record<string, unknown>, status?: string) => Promise<QueueRow>; onUploadRaw: (row: QueueRow, file: File, onProgress: (percent: number) => void) => Promise<void>; onSaveSpotify: (row: QueueRow, spotifyLink: string) => Promise<void>; onRegenerateTitles: (row: QueueRow, titleIndex?: number) => Promise<void>; onOpenRivaldo: (row: QueueRow) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [titles, setTitles] = useState<EditorialTitle[]>([]);
  const [spotifyLink, setSpotifyLink] = useState('');
  const [genre, setGenre] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!item) return; setTitles(editorialTitles(item)); setSpotifyLink(material?.spotify_link || ''); setGenre(String(editorialData(item).genre || '')); setUploading(false); setProgress(0); }, [item, material?.spotify_link]);
  if (!item) return null;
  const data = editorialData(item);
  const locked = isTitleLocked(item) || Boolean(material?.repository_url);
  const raw = data.raw_asset as any;
  const finalUrl = material?.repository_url || null;
  const selectedTitle = selectedEditorialTitle(item);
  const stage = editorialStageMeta(item);

  const saveGenre = async () => { if (genre.trim() !== String(data.genre || '').trim()) { setSaving(true); try { await onUpdate(item, { genre: genre.trim() }); toast.success('Gênero atualizado'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Falha ao salvar gênero'); } finally { setSaving(false); } } };
  const persistTitles = async (next: EditorialTitle[]) => { setTitles(next); const selected = next.some((title) => title.text === selectedTitle) ? selectedTitle : next[0]?.text || ''; await onUpdate(item, { titles: next, selected_title: selected }); };
  const changeTitle = (index: number, text: string) => setTitles((current) => current.map((title, titleIndex) => titleIndex === index ? { ...title, text } : title));
  const upload = async (file: File) => { setUploading(true); setProgress(0); try { await onUploadRaw(item, file, setProgress); toast.success('Raw salvo no OneDrive. A reserva foi promovida e a fila está sendo reposta.'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Falha ao enviar raw'); } finally { setUploading(false); } };
  const saveSpotify = async () => { if (spotifyLink.trim() && !isSpotifyUrl(spotifyLink)) { toast.error('Informe um link válido do Spotify.'); return; } if (spotifyLink.trim() && !finalUrl) { toast.error('Envie o MP3 final pelo Rivaldo antes de confirmar o agendamento.'); return; } setSaving(true); try { await onSaveSpotify(item, spotifyLink); toast.success(spotifyLink.trim() ? 'Episódio marcado como agendado.' : 'Link do Spotify removido.'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Falha ao salvar Spotify'); } finally { setSaving(false); } };

  return <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}><DialogContent className="max-w-5xl p-0"><DialogHeader className="border-b border-border px-6 py-4"><DialogTitle className="flex flex-wrap items-center gap-2 text-lg">{editorialLabel(item)}<span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', stage.className)}>{stage.label}</span></DialogTitle><DialogDescription className="capitalize">{dateLabel(item.publication_date)} · {genre || 'Gênero pendente'}</DialogDescription></DialogHeader><ScrollArea className="max-h-[75vh]"><div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_310px]"><div className="space-y-5"><section className="rounded-lg border border-border p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Pauta</h3>{data.model_used && <span className="text-[10px] text-muted-foreground">{String(data.model_used)}</span>}</div>{data.result_markdown ? <MarkdownView markdown={String(data.result_markdown)} /> : <div className="flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="h-4 w-4" /> {data.last_error ? `Atenção: ${String(data.last_error)}` : 'A pauta está sendo preparada em segundo plano.'}</div>}</section><section className="rounded-lg border border-border p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold">Três títulos</h3><p className="text-xs text-muted-foreground">Editáveis até o MP3 final do Rivaldo.</p></div>{locked && <Badge variant="secondary">Travados pelo MP3 final</Badge>}</div><div className="space-y-2">{titles.length === 0 ? <p className="text-sm text-muted-foreground">Os títulos aparecem junto com a pauta final.</p> : titles.map((title, index) => <div key={`${title.kind}-${index}`} className="flex gap-2"><Button type="button" variant={selectedTitle === title.text ? 'default' : 'outline'} size="sm" disabled={locked} onClick={() => void onUpdate(item, { selected_title: title.text })}>{index + 1}</Button><Input value={title.text} disabled={locked} onChange={(event) => changeTitle(index, event.target.value)} onBlur={() => { if (!locked) void persistTitles(titles); }} /><Button type="button" variant="ghost" size="sm" disabled={locked} onClick={() => void onRegenerateTitles(item, index)}><RefreshCw className="h-3.5 w-3.5" /></Button></div>)}</div>{titles.length > 0 && !locked && <Button className="mt-3" size="sm" variant="outline" onClick={() => void onRegenerateTitles(item)}><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Regenerar os três</Button>}</section><section className="rounded-lg border border-border p-4"><h3 className="font-semibold">Descrição do episódio</h3><Textarea className="mt-3 min-h-44 font-mono text-xs" value={String(data.description_html || '')} onChange={(event) => void onUpdate(item, { description_html: event.target.value })} placeholder="A descrição será produzida junto com a pauta." /></section></div><aside className="space-y-4"><section className="rounded-lg border border-border p-4"><h3 className="font-semibold">Gênero e BGM</h3><div className="mt-3 space-y-2"><Label className="text-xs">Gênero do episódio</Label><Input value={genre} onChange={(event) => setGenre(event.target.value)} onBlur={() => void saveGenre()} list="editorial-detail-genres" placeholder="Ex.: Death Metal" /><datalist id="editorial-detail-genres">{genres.map((itemGenre) => <option key={itemGenre} value={itemGenre} />)}</datalist></div><div className="mt-4"><p className="text-xs font-medium">BGMs compatíveis</p>{suggestedBgms.length > 0 ? <ul className="mt-2 space-y-1">{suggestedBgms.map((track) => <li key={track.id} className="rounded border border-border px-2 py-1.5 text-xs"><span className="font-medium">{track.name}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{track.genres.join(', ')}</span></li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">Cadastre um BGM com este gênero no Rivaldo para habilitar a escolha automática.</p>}<Button className="mt-3 w-full" size="sm" variant="outline" onClick={() => onOpenRivaldo(item)}><Music2 className="mr-1.5 h-3.5 w-3.5" /> Abrir biblioteca no Rivaldo</Button></div></section><section className="rounded-lg border border-border p-4"><h3 className="font-semibold">Áudio</h3><input ref={fileRef} type="file" accept="audio/mpeg,audio/*,.mp3" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ''; }} />{raw?.web_url ? <div className="mt-3 space-y-2"><a href={String(raw.web_url)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-primary hover:underline"><FolderOpen className="h-3.5 w-3.5" /> Raw no OneDrive</a><p className="text-[10px] text-muted-foreground">{String(raw.filename || 'MP3 raw')}</p><Button className="w-full" size="sm" onClick={() => onOpenRivaldo(item)}><Mic className="mr-1.5 h-3.5 w-3.5" /> Tratar no Rivaldo</Button></div> : <div className="mt-3"><Button className="w-full" size="sm" disabled={uploading || !data.result_markdown} onClick={() => fileRef.current?.click()}>{uploading ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Enviando {progress}%</> : <><Upload className="mr-1.5 h-3.5 w-3.5" /> Enviar MP3 raw</>}</Button>{!data.result_markdown && <p className="mt-2 text-[10px] text-muted-foreground">O raw fica disponível depois que a pauta estiver pronta.</p>}</div>}{finalUrl && <a href={finalUrl} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-2 text-xs text-indigo-600 hover:underline dark:text-indigo-300"><FileAudio className="h-3.5 w-3.5" /> MP3 final no OneDrive</a>}</section><section className="rounded-lg border border-border p-4"><h3 className="font-semibold">Publicação no Spotify</h3><p className="mt-1 text-xs text-muted-foreground">O upload e o agendamento continuam manuais. Cole o link final aqui.</p><Input className="mt-3" value={spotifyLink} onChange={(event) => setSpotifyLink(event.target.value)} placeholder="https://open.spotify.com/..." /><Button className="mt-2 w-full" size="sm" disabled={saving} onClick={() => void saveSpotify()}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Confirmar agendamento</Button>{material?.spotify_link && <a href={material.spotify_link} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="h-3 w-3" /> Abrir Spotify</a>}</section></aside></div></ScrollArea><DialogFooter className="border-t border-border px-6 py-3"><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter></DialogContent></Dialog>;
}
