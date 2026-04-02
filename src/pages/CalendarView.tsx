import { useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Download, ExternalLink, Play, FileText, Image as ImageIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useApp } from '@/contexts/AppContext';
import { Episode, DaySlot } from '@/lib/types';
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

const daySlotMap: Record<number, DaySlot> = { 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };

export default function CalendarView() {
  const { weeks, episodes, materials, pautas } = useApp();
  const [date, setDate] = useState(new Date());
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const year = date.getFullYear();
  const month = date.getMonth();
  const days = getDaysInMonth(year, month);
  const today = new Date();

  const prev = () => setDate(new Date(year, month - 1, 1));
  const next = () => setDate(new Date(year, month + 1, 1));

  const getEpisodesForDay = (day: number) => {
    const d = new Date(year, month, day);
    const weekDay = d.getDay();
    const slot = daySlotMap[weekDay];
    if (!slot) return [];

    return episodes.filter(ep => {
      const week = weeks.find(w => w.id === ep.weekId);
      if (!week) return false;
      const weekStart = new Date(week.startDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return d >= weekStart && d <= weekEnd && ep.daySlot === slot;
    });
  };

  const openEpisodeModal = (ep: Episode) => {
    setSelectedEpisode(ep);
    setModalOpen(true);
  };

  const epMaterial = selectedEpisode ? materials.find(m => m.id === selectedEpisode.materialId) : null;
  const epPauta = selectedEpisode ? pautas.find(p => p.id === selectedEpisode.pautaId) : null;

  const handleDownloadPackage = () => {
    if (!selectedEpisode || !epMaterial) return;
    // Simulated ZIP download - in production would use JSZip
    const content = `Episódio: ${epMaterial.selectedTitle || 'Sem título'}\nStatus: ${selectedEpisode.status}\nDescrição: ${epMaterial.descriptionHtml || 'Sem descrição'}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `episodio_${selectedEpisode.daySlot}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'published': return 'bg-green-500';
      case 'ready': return 'bg-primary';
      case 'processing': return 'bg-yellow-500';
      default: return 'bg-muted-foreground/30';
    }
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
              const dayEpisodes = day ? getEpisodesForDay(day) : [];
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              return (
                <div
                  key={i}
                  className={`min-h-[80px] rounded-md border p-1.5 text-xs transition-colors ${
                    day === null ? 'border-transparent'
                    : isToday ? 'border-primary/50 bg-primary/5'
                    : dayEpisodes.length > 0 ? 'border-primary/20 bg-primary/5 cursor-pointer hover:border-primary/40'
                    : 'border-border hover:border-primary/30 cursor-pointer'
                  }`}
                >
                  {day && (
                    <>
                      <span className={`font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>{day}</span>
                      <div className="mt-1 space-y-0.5">
                        {dayEpisodes.map(ep => {
                          const mat = materials.find(m => m.id === ep.materialId);
                          return (
                            <button
                              key={ep.id}
                              className="w-full text-left flex items-center gap-1 p-0.5 rounded hover:bg-primary/10"
                              onClick={() => openEpisodeModal(ep)}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusColor(ep.status)}`} />
                              <span className="truncate text-[10px]">{mat?.selectedTitle || ep.daySlot}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Episode Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{epMaterial?.selectedTitle || 'Episódio'}</DialogTitle>
            <DialogDescription>Detalhes e exportação do episódio</DialogDescription>
          </DialogHeader>
          {selectedEpisode && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedEpisode.status} />
                <Badge variant="secondary" className="text-xs">{selectedEpisode.daySlot}</Badge>
              </div>

              {epMaterial?.coverData && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Capa</label>
                  <img src={epMaterial.coverData} alt="Capa" className="w-full max-w-[200px] aspect-square rounded-md" />
                </div>
              )}

              {epMaterial?.descriptionHtml && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" /> Descrição</label>
                  <div className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap">{epMaterial.descriptionHtml}</div>
                </div>
              )}

              {selectedEpisode.audioUrl && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Áudio</label>
                  <audio controls src={selectedEpisode.audioUrl} className="w-full" />
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="gap-2" onClick={handleDownloadPackage}>
              <Download className="h-4 w-4" /> Baixar Pacote
            </Button>
            <Button className="gap-2" onClick={() => window.open('https://podcasters.spotify.com/', '_blank')}>
              <ExternalLink className="h-4 w-4" /> Publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
