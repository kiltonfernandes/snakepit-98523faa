import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { LayoutDashboard, Disc, FileText, Palette, Calendar, ArrowRight, Check, Circle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { DAY_SLOTS } from '@/lib/constants';
import { EpisodeCompletionIndicators } from '@/lib/types';

export default function Dashboard() {
  const navigate = useNavigate();
  const { releases, weeks, pautas, materials } = useApp();

  const currentWeek = weeks[0];
  const weekPautas = currentWeek ? pautas.filter(p => p.week_id === currentWeek.id) : [];
  const weekMaterials = currentWeek ? materials.filter(m => m.week_id === currentWeek.id) : [];

  function getIndicators(slotKey: string): EpisodeCompletionIndicators {
    const pauta = weekPautas.find(p => {
      const mat = weekMaterials.find(m => m.slot_key === slotKey);
      return mat && p.id === mat.source_pauta_id;
    });
    const mat = weekMaterials.find(m => m.slot_key === slotKey);
    return {
      pauta: pauta?.status === 'finalized',
      title: mat?.selected_title_index != null,
      description: !!mat?.description_html,
      cover: !!mat?.cover_url,
      scheduling: !!mat?.spotify_link,
    };
  }

  const allIndicators = DAY_SLOTS.map(day => ({ day, indicators: getIndicators(day.key) }));
  const totalChecks = allIndicators.length * 5;
  const completedChecks = allIndicators.reduce((sum, { indicators }) => {
    return sum + (indicators.pauta ? 1 : 0) + (indicators.title ? 1 : 0) +
      (indicators.description ? 1 : 0) + (indicators.cover ? 1 : 0) + (indicators.scheduling ? 1 : 0);
  }, 0);
  const weekProgress = totalChecks > 0 ? Math.round((completedChecks / totalChecks) * 100) : 0;

  const Dot = ({ active }: { active: boolean }) => (
    active
      ? <Check className="h-3.5 w-3.5 text-emerald-400" />
      : <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
  );

  const stats = [
    { label: 'Lançamentos', value: String(releases.length), icon: Disc, route: '/releases' },
    { label: 'Semanas', value: String(weeks.length), icon: Calendar, route: '/calendar' },
    { label: 'Pautas', value: `${pautas.filter(p => p.status === 'finalized').length}/${pautas.length}`, icon: FileText, route: '/pautas' },
    { label: 'Materiais', value: `${materials.filter(m => m.selected_title_index != null).length}/${materials.length}`, icon: Palette, route: '/materials' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6 text-primary" />
          Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">Visão geral da produção semanal</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(s => (
          <Card key={s.label} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate(s.route)}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {currentWeek && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                Pipeline da Semana — {currentWeek.start_date}
              </CardTitle>
              <span className="text-xs text-muted-foreground">{weekProgress}%</span>
            </div>
            <Progress value={weekProgress} className="h-2 mt-2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="grid grid-cols-[120px_repeat(5,1fr)] gap-2 text-[10px] text-muted-foreground font-medium mb-2 px-1">
                <span>Episódio</span>
                <span className="text-center">Pauta</span>
                <span className="text-center">Título</span>
                <span className="text-center">Descrição</span>
                <span className="text-center">Capa</span>
                <span className="text-center">Agend.</span>
              </div>
              {allIndicators.map(({ day, indicators }) => (
                <div key={day.key} className="grid grid-cols-[120px_repeat(5,1fr)] gap-2 items-center py-1.5 px-1 rounded hover:bg-muted/30">
                  <span className="text-sm font-medium">{day.label}</span>
                  <span className="flex justify-center"><Dot active={indicators.pauta} /></span>
                  <span className="flex justify-center"><Dot active={indicators.title} /></span>
                  <span className="flex justify-center"><Dot active={indicators.description} /></span>
                  <span className="flex justify-center"><Dot active={indicators.cover} /></span>
                  <span className="flex justify-center"><Dot active={indicators.scheduling} /></span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => navigate('/pautas')} className="gap-2">
          Abrir Workspace <ArrowRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={() => navigate('/releases')} className="gap-2">
          Ver Lançamentos <Disc className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={() => navigate('/calendar')} className="gap-2">
          Calendário <Calendar className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
