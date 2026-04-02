import { useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Link as LinkIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useApp } from '@/contexts/AppContext';
import { EpisodeMaterial, DaySlot } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { DAY_SLOTS } from '@/lib/constants';

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

const daySlotMap: Record<number, DaySlot> = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };

export default function CalendarView() {
  const { weeks, materials, pautas, updateMaterial } = useApp();
  const [date, setDate] = useState(new Date());
  const [selectedMaterial, setSelectedMaterial] = useState<EpisodeMaterial | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [spotifyInput, setSpotifyInput] = useState('');

  const year = date.getFullYear();
  const month = date.getMonth();
  const days = getDaysInMonth(year, month);
  const today = new Date();

  const prev = () => setDate(new Date(year, month - 1, 1));
  const next = () => setDate(new Date(year, month + 1, 1));

  const getMaterialsForDay = (day: number) => {
    const d = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return materials.filter(m => m.episode_date === d);
  };

  const openModal = (mat: EpisodeMaterial) => {
    setSelectedMaterial(mat);
    setSpotifyInput(mat.spotify_link || '');
    setModalOpen(true);
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

  const handleDownloadPackage = () => {
    if (!selectedMaterial) return;
    const title = getSelectedTitle(selectedMaterial);
    const content = `Episódio: ${title}\nDescrição: ${selectedMaterial.description_html || 'Sem descrição'}\nSpotify: ${selectedMaterial.spotify_link || 'Não agendado'}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `episodio_${selectedMaterial.slot_key}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const statusColor = (mat: EpisodeMaterial) => {
    if (mat.spotify_link) return 'bg-green-500';
    if (mat.description_html && mat.cover_url) return 'bg-primary';
    if (mat.selected_title_index != null) return 'bg-yellow-500';
    return 'bg-muted-foreground/30';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CalendarIcon className="h-6 w-6 text-primary" />
          Calendário
        </h1>
        <p className="text-muted-foreground mt-1">Visão mensal dos episódios</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={prev}><ChevronLeft className="h-4 w-4" /></Button>
            <CardTitle className="text-base">{MONTHS[month]} {year}</CardTitle>
            <Button variant="ghost" size="icon" onClick={next}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1">
            {DAYS_OF_WEEK.map(d => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
            ))}
            {days.map((day, i) => {
              const dayMats = day ? getMaterialsForDay(day) : [];
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              return (
                <div
                  key={i}
                  className={`min-h-[80px] rounded-md border p-1.5 text-xs transition-colors ${
                    day === null ? 'border-transparent'
                    : isToday ? 'border-primary/50 bg-primary/5'
                    : dayMats.length > 0 ? 'border-primary/20 bg-primary/5 cursor-pointer hover:border-primary/40'
                    : 'border-border hover:border-primary/30 cursor-pointer'
                  }`}
                >
                  {day && (
                    <>
                      <span className={`font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>{day}</span>
                      <div className="mt-1 space-y-0.5">
                        {dayMats.map(mat => (
                          <button
                            key={mat.id}
                            className="w-full text-left flex items-center gap-1 p-0.5 rounded hover:bg-primary/10"
                            onClick={() => openModal(mat)}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusColor(mat)}`} />
                            <span className="truncate text-[10px]">{getSelectedTitle(mat)}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedMaterial ? getSelectedTitle(selectedMaterial) : 'Episódio'}</DialogTitle>
            <DialogDescription>Detalhes e agendamento do episódio</DialogDescription>
          </DialogHeader>
          {selectedMaterial && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{selectedMaterial.slot_key}</Badge>
                <Badge variant="outline" className="text-xs">{selectedMaterial.episode_date}</Badge>
                {selectedMaterial.spotify_link && <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30">Agendado</Badge>}
              </div>

              {selectedMaterial.cover_url && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Capa</label>
                  <img src={selectedMaterial.cover_url} alt="Capa" className="w-full max-w-[200px] aspect-square rounded-md" />
                </div>
              )}

              {selectedMaterial.description_html && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" /> Descrição</label>
                  <div className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap">{selectedMaterial.description_html}</div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1 text-xs"><LinkIcon className="h-3 w-3" /> Link Spotify (Agendamento)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://open.spotify.com/episode/..."
                    value={spotifyInput}
                    onChange={e => setSpotifyInput(e.target.value)}
                    className="text-xs"
                  />
                  <Button size="sm" onClick={handleSaveSpotify}>Salvar</Button>
                </div>
                <p className="text-[10px] text-muted-foreground">Preencher este campo marca o episódio como agendado.</p>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="gap-2" onClick={handleDownloadPackage}>
              <Download className="h-4 w-4" /> Baixar Pacote
            </Button>
            <Button className="gap-2" onClick={() => window.open('https://podcasters.spotify.com/', '_blank')}>
              <ExternalLink className="h-4 w-4" /> Spotify for Creators
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
