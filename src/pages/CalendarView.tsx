import { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Link as LinkIcon, Disc, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useApp } from '@/contexts/AppContext';
import { EpisodeMaterial, DaySlot, Release } from '@/lib/types';
import { useNavigate } from 'react-router-dom';

const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function getDaysInMonth(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  return days;
}

function getWeekDays(date: Date): Date[] {
  const d = new Date(date);
  const dow = d.getDay();
  const mon = new Date(d); mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); return x; });
}

export default function CalendarView() {
  const { weeks, materials, pautas, releases, updateMaterial, updateRelease } = useApp();
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

  const year = date.getFullYear();
  const month = date.getMonth();
  const today = new Date();

  const prev = () => {
    if (viewMode === 'month') setDate(new Date(year, month - 1, 1));
    else if (viewMode === 'week') { const d = new Date(date); d.setDate(d.getDate() - 7); setDate(d); }
    else { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d); }
  };
  const next = () => {
    if (viewMode === 'month') setDate(new Date(year, month + 1, 1));
    else if (viewMode === 'week') { const d = new Date(date); d.setDate(d.getDate() + 7); setDate(d); }
    else { const d = new Date(date); d.setDate(d.getDate() + 1); setDate(d); }
  };

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  // Get pautas for a date
  const getPautasForDate = (dateStr: string) => {
    return pautas.filter(p => p.publication_date === dateStr);
  };

  const getItemsForDate = (dateStr: string) => {
    const items: { type: 'pauta' | 'material' | 'release'; data: any }[] = [];
    if (showPautas) {
      // Show pautas directly, not materials
      const dayPautas = getPautasForDate(dateStr);
      dayPautas.forEach(p => items.push({ type: 'pauta', data: p }));
      // Also show materials without pautas
      materials.filter(m => m.episode_date === dateStr && !dayPautas.some(p => p.publication_date === m.episode_date)).forEach(m => items.push({ type: 'material', data: m }));
    }
    if (showReleases) {
      releases.filter(r => r.release_date === dateStr).forEach(r => items.push({ type: 'release', data: r }));
    }
    return items;
  };

  const openMaterialModal = (mat: EpisodeMaterial) => {
    setSelectedMaterial(mat);
    setSpotifyInput(mat.spotify_link || '');
    setModalOpen(true);
  };

  const openReleaseModal = (rel: Release) => {
    setSelectedRelease(rel);
    setEditForm({ artist: rel.artist, album: rel.album, release_date: rel.release_date, comments: rel.comments || '' });
    setReleaseModalOpen(true);
  };

  const getSelectedTitle = (mat: EpisodeMaterial) => {
    if (mat.selected_title_index != null && mat.title_options_json.length > mat.selected_title_index) {
      return (mat.title_options_json[mat.selected_title_index] as any)?.text || mat.slot_key;
    }
    return mat.slot_key;
  };

  const handleSaveSpotify = () => {
    if (!selectedMaterial) return;
    updateMaterial(selectedMaterial.id, { spotify_link: spotifyInput || null });
    setSelectedMaterial(prev => prev ? { ...prev, spotify_link: spotifyInput || null } : null);
  };

  const handleSaveRelease = () => {
    if (!selectedRelease) return;
    updateRelease(selectedRelease.id, editForm);
    setReleaseModalOpen(false);
  };

  const handleDownloadPackage = () => {
    if (!selectedMaterial) return;
    const title = getSelectedTitle(selectedMaterial);
    const content = `Episódio: ${title}\nData: ${selectedMaterial.episode_date}\nDescrição: ${selectedMaterial.description_html || 'Sem descrição'}\nSpotify: ${selectedMaterial.spotify_link || 'Não agendado'}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `episodio_${selectedMaterial.slot_key}_${selectedMaterial.episode_date}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const pautaStatusColor = (status: string) => {
    if (status === 'finalized') return 'bg-emerald-500';
    if (status === 'generated' || status === 'needs_review') return 'bg-yellow-500';
    if (status === 'in_progress') return 'bg-blue-500';
    return 'bg-muted-foreground/40';
  };

  const pautaStatusLabel = (status: string) => {
    if (status === 'finalized') return 'Finalizada';
    if (status === 'generated') return 'Gerada';
    if (status === 'needs_review') return 'Revisão';
    if (status === 'in_progress') return 'Em Progresso';
    return 'Rascunho';
  };

  const goToWorkspace = () => {
    navigate('/pautas');
  };

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
      <div className={`min-h-[80px] rounded-lg border p-2 text-xs transition-all ${
        isToday ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
        : items.length > 0 ? 'border-primary/30 bg-card'
        : 'border-border/50 bg-card/50 hover:border-primary/20'
      } ${className}`}>
        <span className={`text-[11px] font-semibold ${isToday ? 'text-primary' : 'text-foreground'}`}>{dateObj.getDate()}</span>
        <div className="mt-1.5 space-y-1">
          {items.map((item, i) => (
            <button key={i} className={`w-full text-left flex items-center gap-1.5 p-1 rounded-md transition-colors ${
              item.type === 'pauta' ? 'hover:bg-primary/10' : item.type === 'release' ? 'hover:bg-accent' : 'hover:bg-muted'
            }`}
              onClick={() => {
                if (item.type === 'pauta') goToWorkspace();
                else if (item.type === 'material') openMaterialModal(item.data);
                else openReleaseModal(item.data);
              }}>
              {item.type === 'pauta' ? (
                <>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${pautaStatusColor(item.data.status)}`} />
                  <span className="truncate text-[10px] font-medium text-foreground">{pautaStatusLabel(item.data.status)}</span>
                  <FileText className="h-2.5 w-2.5 text-muted-foreground ml-auto shrink-0" />
                </>
              ) : item.type === 'release' ? (
                <>
                  <Disc className="h-2.5 w-2.5 shrink-0 text-primary/60" />
                  <span className="truncate text-[10px] text-foreground">{item.data.artist}</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full shrink-0 bg-muted-foreground/30" />
                  <span className="truncate text-[10px] text-muted-foreground">{getSelectedTitle(item.data)}</span>
                </>
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
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-primary" />
            Calendário
          </h1>
          <p className="text-muted-foreground mt-1">Visão temporal de episódios e lançamentos</p>
        </div>
        <div className="flex gap-2">
          <Button variant={showPautas ? 'default' : 'outline'} size="sm" className="text-xs gap-1" onClick={() => setShowPautas(!showPautas)}>
            {showPautas ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />} Pautas
          </Button>
          <Button variant={showReleases ? 'default' : 'outline'} size="sm" className="text-xs gap-1" onClick={() => setShowReleases(!showReleases)}>
            {showReleases ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />} Releases
          </Button>
        </div>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={prev}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="flex items-center gap-3">
              <CardTitle className="text-base font-bold">{headerLabel()}</CardTitle>
              <div className="flex gap-1">
                {(['month', 'week', 'day'] as const).map(m => (
                  <Button key={m} variant={viewMode === m ? 'default' : 'ghost'} size="sm" className="text-xs h-7 px-2.5"
                    onClick={() => setViewMode(m)}>
                    {m === 'month' ? 'Mês' : m === 'week' ? 'Semana' : 'Dia'}
                  </Button>
                ))}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={next}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === 'month' && (
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS_OF_WEEK.map(d => (
                <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-2 uppercase tracking-wider">{d}</div>
              ))}
              {getDaysInMonth(year, month).map((day, i) => {
                if (day === null) return <div key={i} className="min-h-[80px]" />;
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
                    <div className={`text-center text-[11px] font-semibold py-1.5 mb-1.5 rounded-md ${isToday ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
                      {DAYS_OF_WEEK[wd.getDay()]} {wd.getDate()}
                    </div>
                    <DayCell dateObj={wd} isToday={isToday} className="min-h-[200px]" />
                  </div>
                );
              })}
            </div>
          )}

          {viewMode === 'day' && (
            <div className="max-w-lg mx-auto">
              <DayCell dateObj={date} isToday={fmt(date) === fmt(today)} className="min-h-[400px]" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Finalizada</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-500" /> Gerada</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Em Progresso</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Rascunho</span>
      </div>

      {/* Material Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedMaterial ? getSelectedTitle(selectedMaterial) : 'Episódio'}</DialogTitle>
            <DialogDescription>Detalhes e agendamento do episódio</DialogDescription>
          </DialogHeader>
          {selectedMaterial && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs">{selectedMaterial.slot_key}</Badge>
                <Badge variant="outline" className="text-xs">{selectedMaterial.episode_date}</Badge>
                {selectedMaterial.spotify_link && <Badge className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Agendado</Badge>}
              </div>
              {selectedMaterial.description_html && (
                <div className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap max-h-[150px] overflow-y-auto">{selectedMaterial.description_html}</div>
              )}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1 text-xs"><LinkIcon className="h-3 w-3" /> Link Spotify (Agendamento)</Label>
                <div className="flex gap-2">
                  <Input placeholder="https://open.spotify.com/episode/..." value={spotifyInput} onChange={e => setSpotifyInput(e.target.value)} className="text-xs" />
                  <Button size="sm" onClick={handleSaveSpotify}>Salvar</Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="gap-2" onClick={goToWorkspace}>
              <FileText className="h-4 w-4" /> Abrir Workspace
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleDownloadPackage}>
              <Download className="h-4 w-4" /> Baixar Pacote
            </Button>
            <Button className="gap-2" onClick={() => window.open('https://podcasters.spotify.com/', '_blank')}>
              <ExternalLink className="h-4 w-4" /> Spotify for Creators
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Release Edit Modal */}
      <Dialog open={releaseModalOpen} onOpenChange={setReleaseModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Release</DialogTitle>
            <DialogDescription>{selectedRelease ? `${selectedRelease.artist} – ${selectedRelease.album}` : ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Artista</Label><Input value={editForm.artist} onChange={e => setEditForm(p => ({ ...p, artist: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Álbum</Label><Input value={editForm.album} onChange={e => setEditForm(p => ({ ...p, album: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={editForm.release_date} onChange={e => setEditForm(p => ({ ...p, release_date: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Comentários</Label><Input value={editForm.comments} onChange={e => setEditForm(p => ({ ...p, comments: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveRelease}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
