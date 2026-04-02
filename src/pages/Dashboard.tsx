import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { LayoutDashboard, Disc, FileText, Palette, Mic, Calendar, ArrowRight, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';

export default function Dashboard() {
  const navigate = useNavigate();
  const { releases, weeks, pautas, materials, episodes } = useApp();

  const finalizedPautas = pautas.filter(p => p.status === 'finalized').length;
  const totalPautas = pautas.length;
  const materialsWithTitle = materials.filter(m => m.selectedTitle).length;
  const totalMaterials = materials.length;
  const readyEpisodes = episodes.filter(e => e.status === 'ready' || e.status === 'published').length;
  const totalEpisodes = episodes.length;

  const pct = (n: number, t: number) => t > 0 ? Math.round((n / t) * 100) : 0;

  const stats = [
    { label: 'Lançamentos', value: String(releases.length), icon: Disc, route: '/releases' },
    { label: 'Pautas', value: `${finalizedPautas}/${totalPautas}`, icon: FileText, route: '/pautas' },
    { label: 'Materiais', value: `${materialsWithTitle}/${totalMaterials}`, icon: Palette, route: '/materials' },
    { label: 'Episódios', value: `${readyEpisodes}/${totalEpisodes}`, icon: Mic, route: '/rivaldo' },
  ];

  const pipeline = [
    { label: 'Lançamentos', progress: releases.length > 0 ? 100 : 0 },
    { label: 'Pautas', progress: pct(finalizedPautas, totalPautas) },
    { label: 'Assets', progress: pct(materialsWithTitle, totalMaterials) },
    { label: 'Áudio', progress: pct(readyEpisodes, totalEpisodes) },
    { label: 'Publicação', progress: pct(episodes.filter(e => e.status === 'published').length, totalEpisodes) },
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Pipeline da Semana</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pipeline.map((step, i) => (
            <div key={step.label} className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{i + 1}. {step.label}</span>
                <span className="text-muted-foreground">{step.progress}%</span>
              </div>
              <Progress value={step.progress} className="h-1.5" />
            </div>
          ))}
        </CardContent>
      </Card>

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
