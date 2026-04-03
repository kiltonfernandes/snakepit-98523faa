import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { LayoutDashboard, Disc, FileText, Palette, Calendar, ArrowRight, Check, Circle, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { DAY_SLOTS } from '@/lib/constants';
import { EpisodeCompletionIndicators, EditorialWeek } from '@/lib/types';
import heavynautaLogo from '@/assets/heavynauta-logo.jpg';

function getWeekNumber(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime();
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { releases, weeks, pautas, materials } = useApp();
  const [expandedWeek, setExpandedWeek] = useState<string | null>(weeks[0]?.id || null);

  // Exclude sunday from dashboard indicators
  const DASHBOARD_SLOTS = DAY_SLOTS.filter(d => d.key !== 'sunday');

  function getWeekIndicators(week: EditorialWeek) {
    const weekPautas = pautas.filter(p => p.week_id === week.id);
    const weekMaterials = materials.filter(m => m.week_id === week.id);

    return DASHBOARD_SLOTS.map(day => {
      const mat = weekMaterials.find(m => m.slot_key === day.key);
      let pauta = mat?.source_pauta_id ? weekPautas.find(p => p.id === mat.source_pauta_id) : null;
      if (!pauta && mat) {
        pauta = weekPautas.find(p => p.publication_date === mat.episode_date) || null;
      }
      if (!pauta) {
        pauta = weekPautas.find(p => {
          const d = new Date(p.publication_date + 'T12:00:00');
          const wd = d.getDay();
          const slotMap: Record<number, string> = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };
          return slotMap[wd] === day.key;
        }) || null;
      }
      const indicators: EpisodeCompletionIndicators = {
        pauta: pauta?.status === 'finalized',
        title: mat?.selected_title_index != null,
        description: !!mat?.description_html,
        cover: !!mat?.cover_url,
        scheduling: !!mat?.spotify_link,
      };
      const count = Object.values(indicators).filter(Boolean).length;
      return { day, indicators, count };
    });
  }

  function weekProgress(week: EditorialWeek): number {
    const indicators = getWeekIndicators(week);
    const total = indicators.length * 5;
    const done = indicators.reduce((s, i) => s + i.count, 0);
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }

  // Group weeks by year
  const weeksByYear = useMemo(() => {
    const map: Record<number, EditorialWeek[]> = {};
    weeks.forEach(w => {
      const year = new Date(w.start_date + 'T12:00:00').getFullYear();
      if (!map[year]) map[year] = [];
      map[year].push(w);
    });
    return Object.entries(map).sort(([a], [b]) => Number(b) - Number(a));
  }, [weeks]);

  const yearProgress = (yearWeeks: EditorialWeek[]): number => {
    if (yearWeeks.length === 0) return 0;
    const total = yearWeeks.reduce((s, w) => s + weekProgress(w), 0);
    return Math.round(total / yearWeeks.length);
  };

  const Dot = ({ active }: { active: boolean }) => (
    active
      ? <Check className="h-3 w-3 text-emerald-400" />
      : <Circle className="h-3 w-3 text-muted-foreground/30" />
  );

  const trafficLight = (pct: number) => {
    if (pct >= 80) return 'bg-emerald-500';
    if (pct >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const currentWeek = weeks[0];
  const weekEpisodeCount = currentWeek ? DAY_SLOTS.length : 0;
  const weekFinalizedPautas = currentWeek ? pautas.filter(p => p.week_id === currentWeek.id && p.status === 'finalized').length : 0;
  const weekTotalPautas = currentWeek ? pautas.filter(p => p.week_id === currentWeek.id).length : weekEpisodeCount;
  const weekMatsWithTitle = currentWeek ? materials.filter(m => m.week_id === currentWeek.id && m.selected_title_index != null).length : 0;
  const weekTotalMats = currentWeek ? materials.filter(m => m.week_id === currentWeek.id).length : weekEpisodeCount;
  const weekScheduled = currentWeek ? materials.filter(m => m.week_id === currentWeek.id && m.spotify_link).length : 0;

  const stats = [
    { label: 'Lançamentos', value: String(releases.length), icon: Disc, route: '/releases' },
    { label: 'Pautas', value: `${weekFinalizedPautas}/${weekTotalPautas || weekEpisodeCount}`, icon: FileText, route: '/pautas' },
    { label: 'Materiais', value: `${weekMatsWithTitle}/${weekTotalMats || weekEpisodeCount}`, icon: Palette, route: '/materials' },
    { label: 'Agendados', value: `${weekScheduled}/${weekTotalMats || weekEpisodeCount}`, icon: Calendar, route: '/calendar' },
  ];

  const INDICATOR_LABELS = ['Pauta', 'Título', 'Descrição', 'Capa', 'Agend.'];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <img src={heavynautaLogo} alt="Heavynauta" className="h-12 w-12 rounded-xl object-cover" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            Pipeline de Produção
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Acompanhamento de completude por episódio, semana e ano</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(s => (
          <Card key={s.label} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate(s.route)}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold mt-1">{s.value}</p>
              </div>
              <s.icon className="h-5 w-5 text-muted-foreground/50" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Year-level aggregation */}
      {weeksByYear.map(([year, yearWeeks]) => {
        const yPct = yearProgress(yearWeeks);
        return (
          <Card key={year}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`h-3 w-3 rounded-full ${trafficLight(yPct)}`} />
                  <CardTitle className="text-base">{year}</CardTitle>
                  <Badge variant="secondary" className="text-xs">{yearWeeks.length} semanas</Badge>
                </div>
                <span className="text-sm font-mono text-muted-foreground">{yPct}%</span>
              </div>
              <Progress value={yPct} className="h-1.5 mt-2" />
            </CardHeader>
            <CardContent className="space-y-2">
              {yearWeeks.map(week => {
                const wPct = weekProgress(week);
                const isExpanded = expandedWeek === week.id;
                const weekNum = getWeekNumber(week.start_date);
                const dayIndicators = getWeekIndicators(week);

                return (
                  <div key={week.id} className="rounded-lg border border-border/50 overflow-hidden">
                    {/* Week row */}
                    <button
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors text-left"
                      onClick={() => setExpandedWeek(isExpanded ? null : week.id)}
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRightIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      }
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${trafficLight(wPct)}`} />
                      <span className="text-sm font-medium">
                        {(() => {
                          const mon = new Date(week.start_date + 'T12:00:00');
                          const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
                          return `Semana ${format(mon, 'dd.MM')} a ${format(sun, 'dd.MM')}`;
                        })()}
                      </span>
                      <div className="flex-1 mx-3">
                        <Progress value={wPct} className="h-1.5" />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground w-10 text-right">{wPct}%</span>
                      <Badge variant="secondary" className="text-[10px] ml-1">{week.status}</Badge>
                    </button>

                    {/* Episode details */}
                    {isExpanded && (
                      <div className="border-t border-border/30 bg-muted/10 p-3">
                        {/* Header row */}
                        <div className="grid grid-cols-[100px_repeat(5,1fr)_60px] gap-1 text-[10px] text-muted-foreground font-medium mb-1.5 px-1">
                          <span>Episódio</span>
                          {INDICATOR_LABELS.map(l => <span key={l} className="text-center">{l}</span>)}
                          <span className="text-right">Score</span>
                        </div>
                        {dayIndicators.map(({ day, indicators, count }) => (
                          <div key={day.key} className="grid grid-cols-[100px_repeat(5,1fr)_60px] gap-1 items-center py-1 px-1 rounded hover:bg-muted/20">
                            <span className="text-xs font-medium">{day.label}</span>
                            <span className="flex justify-center"><Dot active={indicators.pauta} /></span>
                            <span className="flex justify-center"><Dot active={indicators.title} /></span>
                            <span className="flex justify-center"><Dot active={indicators.description} /></span>
                            <span className="flex justify-center"><Dot active={indicators.cover} /></span>
                            <span className="flex justify-center"><Dot active={indicators.scheduling} /></span>
                            <span className="text-right text-[10px] font-mono text-muted-foreground">{count}/5</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      {weeks.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <img src={heavynautaLogo} alt="Heavynauta" className="h-16 w-16 rounded-2xl object-cover mb-4 opacity-50" />
            <p className="text-muted-foreground">Nenhuma semana criada. Comece pela aba Pautas.</p>
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => navigate('/pautas')} className="gap-2">
          Abrir Workspace <ArrowRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={() => navigate('/releases')} className="gap-2">
          Lançamentos <Disc className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={() => navigate('/calendar')} className="gap-2">
          Calendário <Calendar className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
