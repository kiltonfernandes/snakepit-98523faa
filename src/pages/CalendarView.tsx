import { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Copy,
  Disc,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Image,
  Link as LinkIcon,
  Loader2,
  Mic,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useApp } from '@/contexts/AppContext';
import { EpisodeMaterial, Release, Pauta } from '@/lib/types';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getSectionsForDay } from '@/lib/constants';
import { resolveAllLinks } from '@/lib/dynamic-links';
import { generateCoverImage, buildCoverSearchQuery } from '@/lib/cover-generator';
import { GenerationProgressModal, GenerationItem } from '@/components/GenerationProgressModal';
import { supabase } from '@/integrations/supabase/client';
import { injectMentionedSection } from '@/lib/episode/inject-mentioned';

// Week starts on Monday
const DAYS_OF_WEEK = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function getDaysInMonth(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  // Adjust for Monday start: Mon=0, Tue=1, ..., Sun=6
  const adjustedFirst = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < adjustedFirst; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  return days;
}

function getWeekDays(date: Date): Date[] {
  const d = new Date(date);
  const dow = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(mon);
    x.setDate(mon.getDate() + i);
    return x;
  });
}

// Map getDay() (0=Sun) to DAYS_OF_WEEK index (0=Mon)
function dayOfWeekLabel(d: Date): string {
  const dow = d.getDay();
  const idx = dow === 0 ? 6 : dow - 1;
  return DAYS_OF_WEEK[idx];
}

export default function CalendarView() {
  const { materials, pautas, releases, updateMaterial, updateRelease, loadMaterialCover, dataReady, weeks } = useApp();
  const navigate = useNavigate();
  const [date, setDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [selectedMaterial, setSelectedMaterial] = useState<EpisodeMaterial | null>(null);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);
  const [spotifyInput, setSpotifyInput] = useState('');
  const [showReleases, setShowReleases] = useState(false);
  const [showPautas, setShowPautas] = useState(true);
  const [editForm, setEditForm] = useState({ artist: '', album: '', release_date: '', comments: '' });
  const [previewPauta, setPreviewPauta] = useState<Pauta | null>(null);
  const [coverThumbnails, setCoverThumbnails] = useState<Record<string, string>>({});

  // Cover generation inline state
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [coverProgressItems, setCoverProgressItems] = useState<GenerationItem[]>([]);
  const [coverProgressOpen, setCoverProgressOpen] = useState(false);

  // Mencionado / OneDrive state
  const [mentionedInput, setMentionedInput] = useState('');
  const [enrichingDescription, setEnrichingDescription] = useState(false);
  const [confirmDeleteDriveOpen, setConfirmDeleteDriveOpen] = useState(false);
  const [deletingFromDrive, setDeletingFromDrive] = useState(false);

  const year = date.getFullYear();
  const month = date.getMonth();
  const today = new Date();

  // Load cover thumbnails lazily
  useEffect(() => {
    if (!dataReady) return;
    const matsWithCover = materials.filter(m => m.cover_url && !coverThumbnails[m.id]);
    matsWithCover.forEach(m => {
      if (m.cover_url?.startsWith('data:')) {
        setCoverThumbnails(prev => ({ ...prev, [m.id]: m.cover_url! }));
      } else {
        loadMaterialCover(m.id).then(url => {
          if (url) setCoverThumbnails(prev => ({ ...prev, [m.id]: url }));
        });
      }
    });
  }, [materials, dataReady]);

  const prev = () => {
    if (viewMode === 'month') setDate(new Date(year, month - 1, 1));
    else if (viewMode === 'week') {
      const d = new Date(date);
      d.setDate(d.getDate() - 7);
      setDate(d);
    } else {
      const d = new Date(date);
      d.setDate(d.getDate() - 1);
      setDate(d);
    }
  };

  const next = () => {
    if (viewMode === 'month') setDate(new Date(year, month + 1, 1));
    else if (viewMode === 'week') {
      const d = new Date(date);
      d.setDate(d.getDate() + 7);
      setDate(d);
    } else {
      const d = new Date(date);
      d.setDate(d.getDate() + 1);
      setDate(d);
    }
  };

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const getPautasForDate = (dateStr: string) => pautas.filter((p) => p.publication_date === dateStr);

  const getItemsForDate = (dateStr: string) => {
    const items: { type: 'pauta' | 'material' | 'release'; data: any }[] = [];

    if (showPautas) {
      const dayPautas = getPautasForDate(dateStr);
      dayPautas.forEach((p) => items.push({ type: 'pauta', data: p }));
      materials
        .filter((m) => m.episode_date === dateStr && !dayPautas.some((p) => p.publication_date === m.episode_date))
        .forEach((m) => items.push({ type: 'material', data: m }));
    }

    if (showReleases) {
      releases.filter((r) => r.release_date === dateStr).forEach((r) => items.push({ type: 'release', data: r }));
    }

    return items;
  };

  const openMaterialModal = (mat: EpisodeMaterial) => {
    setSelectedMaterial(mat);
    setSpotifyInput(mat.spotify_link || '');
    setMentionedInput(mat.mentioned_in_episode || '');
    setModalOpen(true);
  };

  const openReleaseModal = (rel: Release) => {
    setSelectedRelease(rel);
    setEditForm({ artist: rel.artist, album: rel.album, release_date: rel.release_date, comments: rel.comments || '' });
    setReleaseModalOpen(true);
  };

  const getSelectedTitle = (mat: EpisodeMaterial) => {
    const options = Array.isArray(mat.title_options_json) ? mat.title_options_json : [];
    if (mat.selected_title_index != null && options[mat.selected_title_index]) {
      return options[mat.selected_title_index]?.text || mat.slot_key;
    }
    return options[0]?.text || mat.slot_key;
  };

  const copyText = async (value: string, label: string) => {
    if (!value?.trim()) {
      toast.error(`Nada para copiar em ${label.toLowerCase()}`);
      return;
    }
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado`);
  };

  const handleSaveSpotify = () => {
    if (!selectedMaterial) return;
    updateMaterial(selectedMaterial.id, { spotify_link: spotifyInput || null });
    setSelectedMaterial((prev) => (prev ? { ...prev, spotify_link: spotifyInput || null } : null));
    toast.success('Link do Spotify salvo');
  };

  const handleSaveMentioned = () => {
    if (!selectedMaterial) return;
    const value = mentionedInput.trim() || null;
    updateMaterial(selectedMaterial.id, { mentioned_in_episode: value });
    setSelectedMaterial((prev) => (prev ? { ...prev, mentioned_in_episode: value } : null));
    toast.success('Mencionados salvos');
  };

  const handleEnrichDescription = async () => {
    if (!selectedMaterial) return;
    const mentioned = mentionedInput.trim();
    if (!mentioned) {
      toast.error('Adicione conteúdo no campo Mencionado primeiro');
      return;
    }
    setEnrichingDescription(true);
    try {
      const { data, error } = await supabase.functions.invoke('enrich-episode-description', {
        body: { mentioned, currentDescriptionHtml: selectedMaterial.description_html || '' },
      });
      if (error) throw new Error(error.message || 'Falha na IA');
      const errMsg = (data as any)?.error;
      if (errMsg) throw new Error(errMsg);
      const sectionHtml = (data as any)?.html;
      if (!sectionHtml) throw new Error('IA não retornou HTML');
      const newHtml = injectMentionedSection(selectedMaterial.description_html || '', sectionHtml);
      updateMaterial(selectedMaterial.id, {
        description_html: newHtml,
        mentioned_in_episode: mentioned,
      });
      setSelectedMaterial((prev) => (prev ? { ...prev, description_html: newHtml, mentioned_in_episode: mentioned } : prev));
      toast.success('Seção "Mencionado" inserida na descrição');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar';
      toast.error(msg);
    } finally {
      setEnrichingDescription(false);
    }
  };

  const handleDownloadFromDrive = () => {
    if (!selectedMaterial?.repository_url) return;
    window.open(selectedMaterial.repository_url, '_blank', 'noopener');
  };

  const handleConfirmDeleteFromDrive = async () => {
    if (!selectedMaterial?.repository_file_id) {
      setConfirmDeleteDriveOpen(false);
      return;
    }
    setDeletingFromDrive(true);
    try {
      const { data, error } = await supabase.functions.invoke('upload-episode-to-onedrive', {
        body: { action: 'delete', fileId: selectedMaterial.repository_file_id },
      });
      if (error) throw new Error(error.message || 'Falha ao excluir');
      const errMsg = (data as any)?.error;
      if (errMsg) throw new Error(errMsg);
      updateMaterial(selectedMaterial.id, {
        repository_url: null,
        repository_file_id: null,
        repository_provider: null,
        repository_uploaded_at: null,
      });
      setSelectedMaterial((prev) =>
        prev
          ? {
              ...prev,
              repository_url: null,
              repository_file_id: null,
              repository_provider: null,
              repository_uploaded_at: null,
            }
          : prev,
      );
      toast.success('Arquivo removido do OneDrive');
      setConfirmDeleteDriveOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir';
      toast.error(msg);
    } finally {
      setDeletingFromDrive(false);
    }
  };

  const handleSaveRelease = () => {
    if (!selectedRelease) return;
    updateRelease(selectedRelease.id, editForm);
    setReleaseModalOpen(false);
    toast.success('Release atualizado');
  };

  const handleDownloadPackage = () => {
    if (!selectedMaterial) return;
    const title = getSelectedTitle(selectedMaterial);
    const content = `Episódio: ${title}\nData: ${selectedMaterial.episode_date}\nDescrição: ${selectedMaterial.description_html || 'Sem descrição'}\nSpotify: ${selectedMaterial.spotify_link || 'Não agendado'}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `episodio_${selectedMaterial.slot_key}_${selectedMaterial.episode_date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCover = () => {
    if (!selectedMaterial?.cover_url) return;
    const a = document.createElement('a');
    a.href = selectedMaterial.cover_url;
    a.download = `capa_${selectedMaterial.slot_key}_${selectedMaterial.episode_date}.png`;
    a.click();
  };

  const handleCopyShareLink = () => {
    if (!selectedMaterial) return;
    const week = weeks.find(w => w.id === selectedMaterial.week_id);
    if (week) {
      const link = `${window.location.origin}/week/${week.id}`;
      navigator.clipboard.writeText(link);
      toast.success('Link compartilhável copiado');
    }
  };

  const pautaStatusColor = (status: string) => {
    if (status === 'finalized') return 'bg-primary';
    if (status === 'generated' || status === 'needs_review') return 'bg-accent';
    if (status === 'in_progress') return 'bg-secondary';
    return 'bg-muted-foreground/40';
  };

  const pautaStatusLabel = (status: string) => {
    if (status === 'finalized') return 'Finalizada';
    if (status === 'generated') return 'Gerada';
    if (status === 'needs_review') return 'Revisão';
    if (status === 'in_progress') return 'Em Progresso';
    return 'Rascunho';
  };

  const goToWorkspace = () => navigate('/pautas');

  const headerLabel = () => {
    if (viewMode === 'month') return `${MONTHS[month]} ${year}`;
    if (viewMode === 'week') {
      const wd = getWeekDays(date);
      return `${wd[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${wd[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`;
    }
    return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  };

  const DayCell = ({ dateObj, isToday, className = '' }: { dateObj: Date; isToday: boolean; className?: string }) => {
    const dateStr = fmt(dateObj);
    const items = getItemsForDate(dateStr);

    return (
      <div
        className={`min-h-[88px] rounded-xl border p-2.5 text-xs transition-all ${
          isToday
            ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
            : items.length > 0
              ? 'border-border bg-card shadow-sm'
              : 'border-border/60 bg-card/60 hover:border-primary/30'
        } ${className}`}
      >
        <span className={`text-[11px] font-semibold ${isToday ? 'text-primary' : 'text-foreground'}`}>{dateObj.getDate()}</span>
        <div className="mt-2 space-y-1.5">
          {items.map((item, i) => (
            <button
              key={`${item.type}-${i}`}
              className={`w-full rounded-lg border px-2 py-1.5 text-left transition-colors ${
                item.type === 'pauta'
                  ? 'border-border bg-muted/60 hover:border-primary/40 hover:bg-muted'
                  : item.type === 'release'
                    ? 'border-border bg-secondary/40 hover:border-primary/30 hover:bg-secondary/60'
                    : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
              }`}
              onClick={() => {
                if (item.type === 'pauta') {
                  const mat = materials.find(m => m.episode_date === item.data.publication_date);
                  if (mat) openMaterialModal(mat);
                  else toast.info('Nenhum material gerado. Crie em Materiais primeiro.');
                }
                else if (item.type === 'material') openMaterialModal(item.data);
                else openReleaseModal(item.data);
              }}
            >
              {item.type === 'pauta' ? (
                <div className="space-y-1">
                  {(() => {
                    const mat = materials.find(m => m.episode_date === item.data.publication_date);
                    const title = mat ? getSelectedTitle(mat) : '';
                    const thumbUrl = mat ? coverThumbnails[mat.id] : undefined;
                    return (
                      <div className="flex items-start gap-1.5">
                        {thumbUrl && (
                          <img src={thumbUrl} alt="" className="h-7 w-7 rounded-sm object-cover shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          {title && <span className="block truncate text-[10px] font-semibold text-foreground">{title}</span>}
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${pautaStatusColor(item.data.status)}`} />
                            <span className="truncate text-[10px] font-medium text-foreground">{pautaStatusLabel(item.data.status)}</span>
                            <FileText className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : item.type === 'release' ? (
                <div className="flex items-center gap-2">
                  <Disc className="h-3 w-3 shrink-0 text-primary/70" />
                  <span className="truncate text-[10px] font-medium text-foreground">{item.data.artist}</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[9px] uppercase tracking-wide">
                      EP
                    </Badge>
                    <span className="truncate text-[10px] font-medium text-foreground">{getSelectedTitle(item.data)}</span>
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CalendarIcon className="h-6 w-6 text-primary" />
            Calendário
          </h1>
          <p className="mt-1 text-muted-foreground">Visão temporal de episódios e lançamentos</p>
        </div>
        <div className="flex gap-2">
          <Button variant={showPautas ? 'default' : 'outline'} size="sm" className="gap-1 text-xs" onClick={() => setShowPautas(!showPautas)}>
            {showPautas ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />} Pautas
          </Button>
          <Button variant={showReleases ? 'default' : 'outline'} size="sm" className="gap-1 text-xs" onClick={() => setShowReleases(!showReleases)}>
            {showReleases ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />} Releases
          </Button>
        </div>
      </div>

      <Card className="border-border/60 hover:shadow-lg transition-all duration-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={prev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-3">
              <CardTitle className="text-base font-bold">{headerLabel()}</CardTitle>
              <div className="flex gap-1">
                {(['month', 'week', 'day'] as const).map((mode) => (
                  <Button key={mode} variant={viewMode === mode ? 'default' : 'ghost'} size="sm" className="h-7 px-2.5 text-xs" onClick={() => setViewMode(mode)}>
                    {mode === 'month' ? 'Mês' : mode === 'week' ? 'Semana' : 'Dia'}
                  </Button>
                ))}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={next}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === 'month' && (
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS_OF_WEEK.map((day) => (
                <div key={day} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {day}
                </div>
              ))}
              {getDaysInMonth(year, month).map((day, i) => {
                if (day === null) return <div key={i} className="min-h-[88px]" />;
                const dateObj = new Date(year, month, day);
                const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                return <DayCell key={i} dateObj={dateObj} isToday={isToday} />;
              })}
            </div>
          )}

          {viewMode === 'week' && (
            <div className="grid grid-cols-7 gap-2">
              {getWeekDays(date).map((wd, i) => {
                const isToday = fmt(wd) === fmt(today);
                return (
                  <div key={i}>
                    <div className={`mb-1.5 rounded-md py-1.5 text-center text-[11px] font-semibold ${isToday ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
                      {dayOfWeekLabel(wd)} {wd.getDate()}
                    </div>
                    <DayCell dateObj={wd} isToday={isToday} className="min-h-[220px]" />
                  </div>
                );
              })}
            </div>
          )}

          {viewMode === 'day' && (
            <div className="mx-auto max-w-xl">
              <DayCell dateObj={date} isToday={fmt(date) === fmt(today)} className="min-h-[420px]" />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> Finalizada</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent" /> Gerada</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-secondary" /> Em Progresso</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Rascunho</span>
      </div>

      {/* Episode package modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Pacote do episódio</DialogTitle>
            <DialogDescription>Copie título e HTML, baixe a capa e atualize o link do Spotify.</DialogDescription>
          </DialogHeader>
          {selectedMaterial && (
            <div className="grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{selectedMaterial.slot_key}</Badge>
                  <Badge variant="outline" className="text-xs">{selectedMaterial.episode_date}</Badge>
                  {selectedMaterial.spotify_link && <Badge variant="secondary" className="text-xs">Spotify agendado</Badge>}
                  {selectedMaterial.cover_url && <Badge variant="secondary" className="text-xs">Capa pronta</Badge>}
                </div>

                <section className="space-y-2 rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-medium">Título selecionado</Label>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => copyText(getSelectedTitle(selectedMaterial), 'Título')}>
                      <Copy className="h-3.5 w-3.5" /> Copy to clipboard
                    </Button>
                  </div>
                  <Textarea readOnly value={getSelectedTitle(selectedMaterial)} className="min-h-[88px] resize-none text-sm" />
                </section>

                <section className="space-y-2 rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <Mic className="h-4 w-4 text-primary" />
                      Mencionado no Episódio
                    </Label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={handleSaveMentioned}
                      >
                        Salvar
                      </Button>
                      <Button
                        size="sm"
                        className="gap-2"
                        onClick={handleEnrichDescription}
                        disabled={!mentionedInput.trim() || enrichingDescription}
                      >
                        {enrichingDescription ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Wand2 className="h-3.5 w-3.5" />
                        )}
                        Inserir na descrição (IA)
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={mentionedInput}
                    onChange={(e) => setMentionedInput(e.target.value)}
                    placeholder="Cole links, vídeos ou assuntos que você mencionou no episódio (um por linha)..."
                    className="min-h-[100px] resize-y text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    A IA gera uma seção "🎙️ Mencionado neste episódio" no topo da descrição. Reinserir substitui a seção anterior.
                  </p>
                </section>

                <section className="space-y-2 rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-medium">Descrição em HTML</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => copyText(selectedMaterial.description_html || '', 'HTML')}
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy to clipboard
                    </Button>
                  </div>
                  <Textarea
                    readOnly
                    value={selectedMaterial.description_html || ''}
                    placeholder="A descrição HTML aparecerá aqui..."
                    className="min-h-[260px] resize-none font-mono text-xs"
                  />
                </section>

                <section className="space-y-2 rounded-xl border border-border bg-card p-4">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    {selectedMaterial.repository_url ? (
                      <Cloud className="h-4 w-4 text-primary" />
                    ) : (
                      <CloudOff className="h-4 w-4 text-muted-foreground" />
                    )}
                    Arquivo no OneDrive
                  </Label>
                  {selectedMaterial.repository_url ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20">
                          MP3 no Drive
                        </Badge>
                        {selectedMaterial.repository_uploaded_at && (
                          <span className="text-xs text-muted-foreground">
                            enviado em{' '}
                            {new Date(selectedMaterial.repository_uploaded_at).toLocaleString('pt-BR')}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-2"
                          onClick={handleDownloadFromDrive}
                        >
                          <Download className="h-3.5 w-3.5" /> Baixar do Drive
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="flex-1 gap-2"
                          onClick={() => setConfirmDeleteDriveOpen(true)}
                          disabled={!selectedMaterial.repository_file_id}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Excluir do Drive
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Nenhum MP3 enviado ainda. Use a aba <span className="font-medium text-foreground">Rivaldo</span> para gerar e subir.
                    </p>
                  )}
                </section>

                <section className="space-y-2 rounded-xl border border-border bg-card p-4">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <LinkIcon className="h-4 w-4 text-primary" />
                    Link do Spotify
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://open.spotify.com/episode/..."
                      value={spotifyInput}
                      onChange={(e) => setSpotifyInput(e.target.value)}
                    />
                    <Button onClick={handleSaveSpotify}>Salvar</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Preencher este campo marca o episódio como agendado.</p>
                </section>
              </div>

              <div className="space-y-4">
                <section className="space-y-3 rounded-xl border border-border bg-card p-4">
                  <div>
                    <h3 className="text-sm font-semibold">Capa do episódio</h3>
                    <p className="text-xs text-muted-foreground">Baixe a arte ou gere uma nova capa.</p>
                  </div>
                  {selectedMaterial.cover_url ? (
                    <img src={selectedMaterial.cover_url} alt={`Capa do episódio ${getSelectedTitle(selectedMaterial)}`} className="aspect-square w-full rounded-lg border border-border object-cover" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-center text-xs text-muted-foreground">
                      Nenhuma capa gerada para este episódio.
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 gap-2" onClick={handleDownloadCover} disabled={!selectedMaterial.cover_url}>
                      <Download className="h-4 w-4" /> Baixar capa
                    </Button>
                    <Button variant="outline" className="flex-1 gap-2" onClick={() => {
                      const title = getSelectedTitle(selectedMaterial);
                      setCoverImageUrl(selectedMaterial.cover_source_url || '');
                      setCoverDialogOpen(true);
                    }}>
                      <Sparkles className="h-4 w-4" /> Gerar capa
                    </Button>
                  </div>
                </section>

                <section className="space-y-2 rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold">Ações rápidas</h3>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={() => {
                    const pauta = pautas.find(p => p.publication_date === selectedMaterial.episode_date);
                    if (pauta) setPreviewPauta(pauta);
                    else toast.info('Nenhuma pauta para este episódio');
                  }}>
                    <Eye className="h-4 w-4" /> Visualizar pauta
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={handleCopyShareLink}>
                    <Share2 className="h-4 w-4" /> Copiar link compartilhável
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={goToWorkspace}>
                    <FileText className="h-4 w-4" /> Abrir workspace
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={handleDownloadPackage}>
                    <Download className="h-4 w-4" /> Baixar pacote
                  </Button>
                  <Button className="w-full justify-start gap-2" onClick={() => window.open('https://podcasters.spotify.com/', '_blank')}>
                    <ExternalLink className="h-4 w-4" /> Spotify for Creators
                  </Button>
                </section>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pauta preview dialog */}
      <Dialog open={!!previewPauta} onOpenChange={(open) => !open && setPreviewPauta(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-black border-border/30">
          <DialogHeader className="sr-only">
            <DialogTitle>Visualização da Pauta</DialogTitle>
            <DialogDescription>Preview da pauta</DialogDescription>
          </DialogHeader>
          {previewPauta && (() => {
            const d = new Date(previewPauta.publication_date + 'T12:00:00');
            const wd = d.getDay();
            const slotMap: Record<number, string> = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };
            const slot = (slotMap[wd] || 'monday') as any;
            const sections = getSectionsForDay(slot);
            const data = (previewPauta.sections_json || {}) as Record<string, string>;
            const inputs = (previewPauta.raw_inputs_json || {}) as Record<string, any>;

            return (
              <div className="space-y-8 p-4">
                <header className="border-b border-white/20 pb-4 text-center">
                  <h1 className="text-2xl font-bold text-white">SNAKEPIT</h1>
                  <h2 className="mt-2 text-lg font-semibold text-white/80">
                    {d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                  </h2>
                </header>

                {sections.map((sec) => {
                  const content = data[sec.key]?.trim() || null;
                  let contextNote = '';
                  if (sec.key === 'anniversary' && inputs.anniversary) contextNote = `📅 ${inputs.anniversary}`;
                  if (sec.key === 'review_rafa') {
                    const rel = releases.find(r => r.id === inputs.review_rafa_id);
                    if (rel) contextNote = `🎵 ${rel.artist} — ${rel.album}`;
                  }
                  if (sec.key === 'review_kilton') {
                    const rel = releases.find(r => r.id === inputs.review_kilton_id);
                    if (rel) contextNote = `🎵 ${rel.artist} — ${rel.album}`;
                  }
                  if (sec.key === 'news' && inputs.news_link) contextNote = `🔗 ${inputs.news_link}`;

                  return (
                    <article key={sec.key} className="border-t border-white/10 pt-4">
                      <h3 className="mb-2 text-lg font-bold uppercase tracking-wider text-white">{sec.label}</h3>
                      {contextNote && <p className="mb-2 text-sm italic text-white/50">{contextNote}</p>}
                      {content ? (
                        <div className="text-base leading-relaxed whitespace-pre-wrap text-white/90">{content}</div>
                      ) : (
                        <p className="text-base italic text-white/30">Seção não preenchida</p>
                      )}
                    </article>
                  );
                })}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewPauta(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Release edit dialog */}
      <Dialog open={releaseModalOpen} onOpenChange={setReleaseModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Release</DialogTitle>
            <DialogDescription>{selectedRelease ? `${selectedRelease.artist} – ${selectedRelease.album}` : ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Artista</Label><Input value={editForm.artist} onChange={(e) => setEditForm((prev) => ({ ...prev, artist: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Álbum</Label><Input value={editForm.album} onChange={(e) => setEditForm((prev) => ({ ...prev, album: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={editForm.release_date} onChange={(e) => setEditForm((prev) => ({ ...prev, release_date: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Comentários</Label><Input value={editForm.comments} onChange={(e) => setEditForm((prev) => ({ ...prev, comments: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveRelease}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inline cover generation dialog */}
      <Dialog open={coverDialogOpen} onOpenChange={setCoverDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerar Capa</DialogTitle>
            <DialogDescription>Cole a URL de uma imagem para gerar a capa do episódio.</DialogDescription>
          </DialogHeader>
          {selectedMaterial && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">URL da Imagem</Label>
                <Input
                  value={coverImageUrl}
                  onChange={e => setCoverImageUrl(e.target.value)}
                  onBlur={() => {
                    if (!selectedMaterial) return;
                    const val = coverImageUrl.trim() || null;
                    if (val !== (selectedMaterial.cover_source_url || null)) {
                      updateMaterial(selectedMaterial.id, { cover_source_url: val });
                      setSelectedMaterial(prev => prev ? { ...prev, cover_source_url: val } : prev);
                    }
                  }}
                  placeholder="https://..."
                  className="text-xs"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => {
                  const title = getSelectedTitle(selectedMaterial);
                  const query = buildCoverSearchQuery(title);
                  window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`, '_blank');
                }}>
                  <Search className="h-3 w-3" /> Buscar Imagens
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2"
                  disabled={!coverImageUrl.trim() || coverGenerating}
                  onClick={async () => {
                    if (!coverImageUrl.trim() || !selectedMaterial) return;
                    setCoverGenerating(true);
                    const title = getSelectedTitle(selectedMaterial);
                    setCoverProgressItems([{ id: selectedMaterial.id, label: `Capa — ${title}`, status: 'generating' }]);
                    setCoverProgressOpen(true);
                    
                    generateCoverImage({
                      imageUrl: coverImageUrl,
                      title,
                      onComplete: (dataUrl) => {
                        const coverSavedAt = new Date().toISOString();
                        updateMaterial(selectedMaterial.id, { cover_url: dataUrl, cover_saved_at: coverSavedAt, cover_source_url: coverImageUrl });
                        setSelectedMaterial(prev => prev ? { ...prev, cover_url: dataUrl, cover_saved_at: coverSavedAt, cover_source_url: coverImageUrl } : prev);
                        setCoverThumbnails(prev => ({ ...prev, [selectedMaterial.id]: dataUrl }));
                        setCoverProgressItems([{ id: selectedMaterial.id, label: `Capa — ${title}`, status: 'done' }]);
                        setCoverGenerating(false);
                        setCoverDialogOpen(false);
                        toast.success('Capa gerada!');
                      },
                      onError: (error) => {
                        setCoverProgressItems([{ id: selectedMaterial.id, label: `Capa — ${title}`, status: 'error', error }]);
                        setCoverGenerating(false);
                        toast.error(error);
                      },
                    });
                  }}
                >
                  {coverGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {coverGenerating ? 'Gerando...' : 'Gerar Capa'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cover progress modal */}
      <GenerationProgressModal
        open={coverProgressOpen}
        onOpenChange={setCoverProgressOpen}
        title="Gerando capa..."
        items={coverProgressItems}
      />
    </div>
  );
}
