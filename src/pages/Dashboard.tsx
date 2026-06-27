import { useMemo, useState } from 'react';
import { format, isThisWeek, isThisMonth, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LayoutDashboard, Disc, FileText, Palette, Calendar, ArrowRight, Check, Circle,
  ChevronDown, ChevronRight as ChevronRightIcon, BarChart3, TrendingUp,
  Globe, Music, Flame, AlertCircle, Clock, Zap, Eye, Link2, Copy, ExternalLink, Cloud,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { DAY_SLOTS, NORMALIZED_GENRES } from '@/lib/constants';
import { EpisodeCompletionIndicators, EditorialWeek, DaySlot } from '@/lib/types';
import { normalizeCountryCode } from '@/lib/country-utils';
import * as CountryFlags from 'country-flag-icons/react/3x2';
import heavynautaLogo from '@/assets/heavynauta-logo.jpg';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getEffectivePautaStatus } from '@/lib/episode-status';

const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function getPautaSlot(pubDate: string): DaySlot {
  const d = new Date(pubDate + 'T12:00:00');
  const wd = d.getDay();
  const slotMap: Record<number, DaySlot> = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };
  return slotMap[wd] || 'monday';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { releases, weeks, pautas, materials } = useApp();
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set([new Date().getFullYear()]));
  const [expandedQuarters, setExpandedQuarters] = useState<Set<string>>(new Set([`${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`]));
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set([`${new Date().getFullYear()}-${new Date().getMonth()}`]));
  const [filterStatus, setFilterStatus] = useState<'all' | 'incomplete' | 'complete'>('all');
  const [dashTab, setDashTab] = useState('releases');

  const DASHBOARD_SLOTS = DAY_SLOTS.filter(d => d.key !== 'sunday');

  const isMaterialSaved = (material?: { repository_url?: string | null; repository_file_id?: string | null; repository_uploaded_at?: string | null; repository_provider?: string | null } | null) => {
    if (!material) return false;
    return !!(
      material.repository_file_id ||
      material.repository_url ||
      material.repository_uploaded_at ||
      material.repository_provider === 'onedrive'
    );
  };

  function getWeekIndicators(week: EditorialWeek) {
    const weekPautas = pautas.filter(p => p.week_id === week.id);
    const weekMaterials = materials.filter(m => m.week_id === week.id);

    return DASHBOARD_SLOTS.map(day => {
      const mat = weekMaterials.find(m => m.slot_key === day.key);
      let pauta = mat?.source_pauta_id ? weekPautas.find(p => p.id === mat.source_pauta_id) : null;
      if (!pauta && mat) pauta = weekPautas.find(p => p.publication_date === mat.episode_date) || null;
      if (!pauta) {
        pauta = weekPautas.find(p => getPautaSlot(p.publication_date) === day.key) || null;
      }
      const indicators: EpisodeCompletionIndicators = {
        pauta: !!pauta && !['pesquisa', 'draft'].includes(pauta.status),
        title: mat?.selected_title_index != null,
        description: !!mat?.description_html,
        cover: !!(mat?.cover_url || mat?.cover_source_url || mat?.cover_saved_at),
        saved: isMaterialSaved(mat),
        scheduling: !!mat?.spotify_link,
      };
      const count = Object.values(indicators).filter(Boolean).length;
      const effectiveStatus = getEffectivePautaStatus(pauta, mat);
      return { day, indicators, count, pauta, effectiveStatus, material: mat };
    });
  }

  function weekProgress(week: EditorialWeek): number {
    const indicators = getWeekIndicators(week);
    const total = indicators.length * 6;
    const done = indicators.reduce((s, i) => s + i.count, 0);
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }

  // Find current/next week
  const currentWeek = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const sorted = [...weeks].sort((a, b) => a.start_date.localeCompare(b.start_date));
    return sorted.find(w => {
      const end = addDays(new Date(w.start_date + 'T12:00:00'), 6).toISOString().slice(0, 10);
      return w.start_date <= today && end >= today;
    }) || sorted.find(w => w.start_date >= today) || sorted[sorted.length - 1];
  }, [weeks]);

  // Current week details
  const currentIndicators = currentWeek ? getWeekIndicators(currentWeek) : [];
  const currentPct = currentWeek ? weekProgress(currentWeek) : 0;
  const currentWeekPautas = currentWeek ? pautas.filter(p => p.week_id === currentWeek.id) : [];

  // Status counts for current week
  const statusCounts = useMemo(() => {
    const c = { draft: 0, generating: 0, finalized: 0, scheduled: 0, published: 0, total: currentWeekPautas.length };
    currentWeekPautas.forEach(p => {
      const mat = materials.find(m => m.episode_date === p.publication_date);
      const eff = getEffectivePautaStatus(p, mat);
      if (eff === 'publicado') c.published++;
      else if (eff === 'agendado') c.scheduled++;
      else if (p.status === 'finalized') c.finalized++;
      else if (p.status === 'generated') c.generating++;
      else c.draft++;
    });
    return c;
  }, [currentWeekPautas, materials]);

  // Bottleneck detection
  const bottlenecks = useMemo(() => {
    if (!currentWeek) return [];
    const issues: { label: string; type: 'warning' | 'info'; action: string; route: string }[] = [];
    const mats = materials.filter(m => m.week_id === currentWeek.id);
    const noPauta = currentWeekPautas.filter(p => p.status === 'draft').length;
    const noTitle = mats.filter(m => m.selected_title_index == null).length;
    const noDesc = mats.filter(m => !m.description_html).length;
    const noCover = mats.filter(m => !m.cover_url).length;
    const noSchedule = mats.filter(m => !m.spotify_link).length;

    if (noPauta > 0) issues.push({ label: `${noPauta} pautas em rascunho`, type: 'warning', action: 'Ir para Pautas', route: '/pautas' });
    if (noTitle > 0) issues.push({ label: `${noTitle} episódios sem título`, type: 'warning', action: 'Ir para Materiais', route: '/materials' });
    if (noDesc > 0) issues.push({ label: `${noDesc} sem descrição`, type: 'info', action: 'Gerar', route: '/materials' });
    if (noCover > 0) issues.push({ label: `${noCover} sem capa`, type: 'info', action: 'Gerar', route: '/materials' });
    if (noSchedule > 0) issues.push({ label: `${noSchedule} sem agendamento`, type: 'info', action: 'Agendar', route: '/calendar' });
    return issues;
  }, [currentWeek, currentWeekPautas, materials]);

  // Group weeks by year > month
  const tree = useMemo(() => {
    const yearMap: Record<number, Record<number, Record<number, EditorialWeek[]>>> = {};
    weeks.forEach(w => {
      const d = new Date(w.start_date + 'T12:00:00');
      const y = d.getFullYear();
      const m = d.getMonth();
      const q = Math.floor(m / 3) + 1;
      if (!yearMap[y]) yearMap[y] = {};
      if (!yearMap[y][q]) yearMap[y][q] = {};
      if (!yearMap[y][q][m]) yearMap[y][q][m] = [];
      yearMap[y][q][m].push(w);
    });
    return Object.entries(yearMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, quarters]) => ({
        year: Number(year),
        quarters: Object.entries(quarters)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([quarter, months]) => ({
            quarter: Number(quarter),
            months: Object.entries(months)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([month, wks]) => ({
                month: Number(month),
                weeks: wks.sort((a, b) => a.start_date.localeCompare(b.start_date)),
              })),
          })),
      }));
  }, [weeks]);

  const trafficLight = (pct: number) => {
    if (pct >= 80) return 'bg-emerald-500';
    if (pct >= 40) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const trafficColor = (pct: number) => {
    if (pct >= 80) return 'text-emerald-400';
    if (pct >= 40) return 'text-amber-400';
    return 'text-red-400';
  };

  const Dot = ({ active }: { active: boolean }) => (
    active ? <Check className="h-3 w-3 text-emerald-400" /> : <Circle className="h-3 w-3 text-muted-foreground/30" />
  );

  const toggleYear = (y: number) => {
    setExpandedYears(prev => { const n = new Set(prev); if (n.has(y)) n.delete(y); else n.add(y); return n; });
  };
  const toggleMonth = (key: string) => {
    setExpandedMonths(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  };
  const toggleQuarter = (key: string) => {
    setExpandedQuarters(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  };

  const yearProgress = (wks: EditorialWeek[]): number => {
    if (wks.length === 0) return 0;
    return Math.round(wks.reduce((s, w) => s + weekProgress(w), 0) / wks.length);
  };
  const monthProgressFn = (wks: EditorialWeek[]): number => {
    if (wks.length === 0) return 0;
    return Math.round(wks.reduce((s, w) => s + weekProgress(w), 0) / wks.length);
  };

  // Release stats
  const normalizeGenreToMain = (genre: string): string | null => {
    const lower = genre.toLowerCase().trim();
    for (const ng of NORMALIZED_GENRES) {
      const ngLower = ng.toLowerCase();
      if (lower === ngLower || (lower.includes(ngLower.replace(' metal', '')) && ngLower.includes('metal'))) return ng;
    }
    if (lower.includes('thrash')) return 'Thrash Metal';
    if (lower.includes('death') && lower.includes('melod')) return 'Melodic Death Metal';
    if (lower.includes('death')) return 'Death Metal';
    if (lower.includes('black')) return 'Black Metal';
    if (lower.includes('power')) return 'Power Metal';
    if (lower.includes('doom') || lower.includes('stoner') || lower.includes('sludge')) return 'Doom Metal';
    if (lower.includes('prog')) return 'Progressive Metal';
    if (lower.includes('groove')) return 'Groove Metal';
    if (lower.includes('core')) return 'Metalcore';
    if (lower.includes('symphonic')) return 'Symphonic Metal';
    if (lower.includes('heavy')) return 'Heavy Metal';
    return null;
  };

  const releaseStats = useMemo(() => {
    const byGenre: Record<string, number> = {};
    const byCountry: Record<string, { count: number; label: string }> = {};
    releases.forEach(r => {
      const code = normalizeCountryCode(r.country);
      if (code) {
        if (!byCountry[code]) byCountry[code] = { count: 0, label: r.country || code };
        byCountry[code].count++;
      }
      (r.genres || []).forEach(g => {
        const main = normalizeGenreToMain(g);
        if (main) byGenre[main] = (byGenre[main] || 0) + 1;
      });
    });
    const topGenre = Object.entries(byGenre).sort(([, a], [, b]) => b - a)[0];
    const topCountry = Object.entries(byCountry).sort(([, a], [, b]) => b.count - a.count)[0];
    return { topGenre, topCountry, topCountryCode: topCountry?.[0] };
  }, [releases]);

  const renderSmallFlag = (code: string) => {
    const FC = CountryFlags[code as keyof typeof CountryFlags] as unknown as ((props: { className?: string }) => JSX.Element) | undefined;
    return FC ? <FC className="h-3.5 w-4.5 rounded-[2px] overflow-hidden" /> : null;
  };

  const INDICATOR_LABELS = ['Pauta', 'Título', 'Desc.', 'Capa', 'Salvo', 'Agend.'];

  const filteredWeeksForTree = (wks: EditorialWeek[]) => {
    if (filterStatus === 'all') return wks;
    return wks.filter(w => {
      const pct = weekProgress(w);
      return filterStatus === 'complete' ? pct === 100 : pct < 100;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <img src={heavynautaLogo} alt="Heavynauta" className="h-12 w-12 rounded-xl object-cover" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            Pipeline de Produção
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Visão geral de completude e gargalos</p>
        </div>
      </div>

      <Tabs value={dashTab} onValueChange={setDashTab}>
        <TabsList>
          <TabsTrigger value="releases" className="gap-1.5"><Disc className="h-3.5 w-3.5" /> Releases</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Histórico</TabsTrigger>
        </TabsList>

        {/* ===== CURRENT WEEK TAB ===== */}
        <TabsContent value="current" className="space-y-4 mt-4">
          {currentWeek ? (
            <>
              {/* Week header with big progress */}
              <Card className="overflow-hidden">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-lg font-bold">
                        Semana de {format(new Date(currentWeek.start_date + 'T12:00:00'), "dd 'de' MMMM", { locale: ptBR })}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(currentWeek.start_date + 'T12:00:00'), 'dd.MM')} – {format(addDays(new Date(currentWeek.start_date + 'T12:00:00'), 5), 'dd.MM')}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={cn("text-3xl font-bold font-mono", trafficColor(currentPct))}>{currentPct}%</span>
                      <Badge variant="secondary" className="ml-2">{currentWeek.status}</Badge>
                    </div>
                  </div>
                  <Progress value={currentPct} className="h-2.5" />

                  {/* Status pills */}
                  <div className="flex gap-3 mt-4">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/50 text-xs">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                      <span>{statusCounts.draft} rascunho</span>
                    </div>
                    {statusCounts.generating > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-xs text-amber-400">
                        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                        <span>{statusCounts.generating} gerando</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-xs text-emerald-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span>{statusCounts.finalized} finalizada</span>
                    </div>
                    {statusCounts.scheduled > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 text-xs text-cyan-400">
                        <span className="h-2 w-2 rounded-full bg-cyan-500" />
                        <span>{statusCounts.scheduled} agendado</span>
                      </div>
                    )}
                    {statusCounts.published > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/10 text-xs text-violet-400">
                        <span className="h-2 w-2 rounded-full bg-violet-500" />
                        <span>{statusCounts.published} publicado</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Day-by-day grid */}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {currentIndicators.map(({ day, indicators, count, pauta, effectiveStatus }) => {
                  const pct = Math.round((count / 6) * 100);
                  return (
                    <motion.div key={day.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                      <Card className={cn("hover:border-primary/30 transition-all cursor-pointer", pct === 100 && "border-emerald-500/30")}
                        onClick={() => navigate('/pautas')}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold">{day.label}</span>
                              {effectiveStatus === 'publicado' && (
                                <Badge className="h-4 px-1.5 text-[9px] bg-violet-500/20 text-violet-400 border-0">Publicado</Badge>
                              )}
                              {effectiveStatus === 'agendado' && (
                                <Badge className="h-4 px-1.5 text-[9px] bg-cyan-500/20 text-cyan-400 border-0">Agendado</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={cn("text-xs font-mono font-bold", trafficColor(pct))}>{count}/6</span>
                              <span className={cn("h-2 w-2 rounded-full", trafficLight(pct))} />
                            </div>
                          </div>
                          <Progress value={pct} className="h-1 mb-2" />
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                            {Object.entries(indicators).map(([key, val]) => (
                              <span key={key} className={cn("flex items-center gap-0.5", val && "text-emerald-400")}>
                                {key === 'saved'
                                  ? <Cloud className={cn("h-2.5 w-2.5", !val && "text-muted-foreground/30")} />
                                  : (val ? <Check className="h-2.5 w-2.5" /> : <Circle className="h-2.5 w-2.5" />)}
                                {INDICATOR_LABELS[Object.keys(indicators).indexOf(key)]}
                              </span>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>

              {/* Bottlenecks */}
              {bottlenecks.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-400" /> Próximos Passos
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {bottlenecks.map((b, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-md bg-muted/20 hover:bg-muted/40 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className={cn("h-1.5 w-1.5 rounded-full", b.type === 'warning' ? "bg-amber-400" : "bg-blue-400")} />
                          <span className="text-xs">{b.label}</span>
                        </div>
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => navigate(b.route)}>
                          {b.action} <ArrowRight className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <img src={heavynautaLogo} alt="" className="h-16 w-16 rounded-2xl object-cover mb-4 opacity-50" />
                <p className="text-muted-foreground">Nenhuma semana criada. Comece pela aba Pautas.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== HISTORY TAB ===== */}
        <TabsContent value="history" className="space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="incomplete">Incompletas</SelectItem>
                <SelectItem value="complete">Completas</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{weeks.length} semanas no total</span>
          </div>

          {tree.map(({ year: y, quarters }) => {
            const allYearWeeks = filteredWeeksForTree(quarters.flatMap(q => q.months.flatMap(m => m.weeks)));
            if (allYearWeeks.length === 0 && filterStatus !== 'all') return null;
            const yPct = yearProgress(allYearWeeks);
            const isYearOpen = expandedYears.has(y);

            return (
              <Card key={y} className="hover:shadow-lg transition-all duration-200">
                <button className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left" onClick={() => toggleYear(y)}>
                  {isYearOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRightIcon className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className={cn("h-3 w-3 rounded-full", trafficLight(yPct))} />
                  <span className="text-base font-bold">{y}</span>
                  <Badge variant="secondary" className="text-xs">{allYearWeeks.length} semanas</Badge>
                  <div className="flex-1 mx-3"><Progress value={yPct} className="h-1.5" /></div>
                  <span className="text-sm font-mono text-muted-foreground">{yPct}%</span>
                </button>

                <AnimatePresence>
                  {isYearOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="px-4 pb-4 space-y-2">
                        {quarters.map(({ quarter: q, months }) => {
                          const allQWeeks = filteredWeeksForTree(months.flatMap(m => m.weeks));
                          if (allQWeeks.length === 0 && filterStatus !== 'all') return null;
                          const qKey = `${y}-Q${q}`;
                          const qPct = monthProgressFn(allQWeeks);
                          const isQOpen = expandedQuarters.has(qKey);
                          return (
                            <div key={qKey} className="rounded-lg border border-border/40 overflow-hidden">
                              <button className="w-full flex items-center gap-3 p-3 hover:bg-muted/20 transition-colors text-left" onClick={() => toggleQuarter(qKey)}>
                                {isQOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                                <span className={cn("h-2.5 w-2.5 rounded-full", trafficLight(qPct))} />
                                <span className="text-sm font-semibold">Q{q}</span>
                                <Badge variant="secondary" className="text-[10px]">{allQWeeks.length} sem</Badge>
                                <div className="flex-1 mx-3"><Progress value={qPct} className="h-1" /></div>
                                <span className="text-xs font-mono text-muted-foreground">{qPct}%</span>
                              </button>
                              <AnimatePresence>
                                {isQOpen && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                    <div className="px-3 pb-3 space-y-2">
                        {months.map(({ month: m, weeks: mWeeks }) => {
                          const filtered = filteredWeeksForTree(mWeeks);
                          if (filtered.length === 0 && filterStatus !== 'all') return null;
                          const mKey = `${y}-${m}`;
                          const mPct = monthProgressFn(filtered);
                          const isMonthOpen = expandedMonths.has(mKey);

                          return (
                            <div key={mKey} className="rounded-lg border border-border/50 overflow-hidden">
                              <button className="w-full flex items-center gap-3 p-3 hover:bg-muted/20 transition-colors text-left" onClick={() => toggleMonth(mKey)}>
                                {isMonthOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                                <span className={cn("h-2.5 w-2.5 rounded-full", trafficLight(mPct))} />
                                <span className="text-sm font-medium">{MONTHS_PT[m]}</span>
                                <Badge variant="secondary" className="text-[10px]">{filtered.length} sem</Badge>
                                <div className="flex-1 mx-3"><Progress value={mPct} className="h-1" /></div>
                                <span className="text-xs font-mono text-muted-foreground">{mPct}%</span>
                              </button>

                              <AnimatePresence>
                                {isMonthOpen && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                    <div className="px-3 pb-3 space-y-1.5">
                                      {filtered.map(week => {
                                        const wPct = weekProgress(week);
                                        const isExpanded = expandedWeek === week.id;
                                        const dayIndicators = getWeekIndicators(week);
                                        const isCurrent = currentWeek?.id === week.id;

                                        return (
                                          <div key={week.id} className={cn("rounded-md border overflow-hidden", isCurrent ? "border-primary/40" : "border-border/30")}>
                                            <button className="w-full flex items-center gap-3 p-2.5 hover:bg-muted/20 transition-colors text-left" onClick={() => setExpandedWeek(isExpanded ? null : week.id)}>
                                              {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRightIcon className="h-3 w-3 text-muted-foreground shrink-0" />}
                                              <span className={cn("h-2 w-2 rounded-full shrink-0", trafficLight(wPct))} />
                                              <span className="text-xs font-medium">
                                                {format(new Date(week.start_date + 'T12:00:00'), 'dd.MM')} – {format(addDays(new Date(week.start_date + 'T12:00:00'), 6), 'dd.MM')}
                                              </span>
                                              {isCurrent && <Badge className="text-[8px] h-4 bg-primary/20 text-primary border-0">atual</Badge>}
                                              <div className="flex-1 mx-2"><Progress value={wPct} className="h-1" /></div>
                                              <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{wPct}%</span>
                                              <Badge variant="secondary" className="text-[9px] ml-1">{week.status}</Badge>
                                            </button>

                                            {isExpanded && (
                                              <div className="border-t border-border/30 bg-muted/10 p-2.5">
                                                <div className="grid grid-cols-[100px_repeat(6,1fr)_60px] gap-1 text-[10px] text-muted-foreground font-medium mb-1 px-1">
                                                  <span>Episódio</span>
                                                  {INDICATOR_LABELS.map(l => <span key={l} className="text-center">{l}</span>)}
                                                  <span className="text-right">Score</span>
                                                </div>
                                                {dayIndicators.map(({ day, indicators, count }) => (
                                                  <div key={day.key} className="grid grid-cols-[100px_repeat(6,1fr)_60px] gap-1 items-center py-1 px-1 rounded hover:bg-muted/20">
                                                    <span className="text-xs font-medium">{day.label}</span>
                                                    <span className="flex justify-center"><Dot active={indicators.pauta} /></span>
                                                    <span className="flex justify-center"><Dot active={indicators.title} /></span>
                                                    <span className="flex justify-center"><Dot active={indicators.description} /></span>
                                                    <span className="flex justify-center"><Dot active={indicators.cover} /></span>
                                                    <span className="flex justify-center">
                                                      {indicators.saved
                                                        ? <Cloud className="h-3 w-3 text-emerald-400" />
                                                        : <Cloud className="h-3 w-3 text-muted-foreground/30" />}
                                                    </span>
                                                    <span className="flex justify-center"><Dot active={indicators.scheduling} /></span>
                                                    <span className="text-right text-[10px] font-mono text-muted-foreground">{count}/6</span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })}
        </TabsContent>

        {/* ===== RELEASES TAB ===== */}
        <TabsContent value="releases" className="space-y-4 mt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} whileHover={{ scale: 1.02 }}>
              <Card className="cursor-pointer hover:border-primary/40 transition-all" onClick={() => navigate('/releases')}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-2xl font-bold mt-1">{releases.length}</p>
                  </div>
                  <Disc className="h-5 w-5 text-muted-foreground/50" />
                </CardContent>
              </Card>
            </motion.div>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Music className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Top Gênero</p>
                  <p className="text-sm font-bold truncate">{releaseStats.topGenre ? `${releaseStats.topGenre[0]} (${releaseStats.topGenre[1]})` : '—'}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                {releaseStats.topCountryCode ? renderSmallFlag(releaseStats.topCountryCode) : <Globe className="h-4 w-4 text-muted-foreground/50 shrink-0" />}
                <div>
                  <p className="text-xs text-muted-foreground">Top País</p>
                  <p className="text-sm font-bold truncate">{releaseStats.topCountry ? `${releaseStats.topCountry[1].label} (${releaseStats.topCountry[1].count})` : '—'}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:border-primary/40 transition-all" onClick={() => navigate('/analytics')}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Analytics</p>
                  <p className="text-sm font-bold">Dashboard Completo</p>
                </div>
                <BarChart3 className="h-5 w-5 text-primary" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Quick nav */}
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
        {currentWeek && (
          <>
            <Button variant="outline" className="gap-2" onClick={() => {
              const url = `${window.location.origin}/week/${currentWeek.id}`;
              window.open(url, '_blank', 'noopener,noreferrer');
            }}>
              <ExternalLink className="h-4 w-4" /> Abrir Pauta Pública
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => {
              const url = `${window.location.origin}/week/${currentWeek.id}`;
              navigator.clipboard.writeText(url);
              toast.success('Link copiado!');
            }}>
              <Link2 className="h-4 w-4" /> Copiar Link da Semana
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
