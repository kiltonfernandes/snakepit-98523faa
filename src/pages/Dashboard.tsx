import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { LayoutDashboard, Disc, FileText, Palette, Calendar, ArrowRight, Check, Circle, ChevronDown, ChevronRight as ChevronRightIcon, BarChart3, TrendingUp, TrendingDown, Globe, Music, Flame } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { DAY_SLOTS, NORMALIZED_GENRES } from '@/lib/constants';
import { EpisodeCompletionIndicators, EditorialWeek } from '@/lib/types';
import { normalizeCountryCode } from '@/lib/country-utils';
import * as CountryFlags from 'country-flag-icons/react/3x2';
import heavynautaLogo from '@/assets/heavynauta-logo.jpg';
import { motion, AnimatePresence } from 'framer-motion';

const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function Dashboard() {
  const navigate = useNavigate();
  const { releases, weeks, pautas, materials } = useApp();
  const [expandedWeek, setExpandedWeek] = useState<string | null>(weeks[0]?.id || null);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set([new Date().getFullYear()]));
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set([`${new Date().getFullYear()}-${new Date().getMonth()}`]));

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

  // Group weeks by year > month
  const tree = useMemo(() => {
    const yearMap: Record<number, Record<number, EditorialWeek[]>> = {};
    weeks.forEach(w => {
      const d = new Date(w.start_date + 'T12:00:00');
      const y = d.getFullYear();
      const m = d.getMonth();
      if (!yearMap[y]) yearMap[y] = {};
      if (!yearMap[y][m]) yearMap[y][m] = [];
      yearMap[y][m].push(w);
    });
    return Object.entries(yearMap)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([year, months]) => ({
        year: Number(year),
        months: Object.entries(months)
          .sort(([a], [b]) => Number(b) - Number(a))
          .map(([month, weeks]) => ({
            month: Number(month),
            weeks: weeks.sort((a, b) => b.start_date.localeCompare(a.start_date)),
          })),
      }));
  }, [weeks]);

  const yearProgress = (yearWeeks: EditorialWeek[]): number => {
    if (yearWeeks.length === 0) return 0;
    const total = yearWeeks.reduce((s, w) => s + weekProgress(w), 0);
    return Math.round(total / yearWeeks.length);
  };

  const monthProgress = (monthWeeks: EditorialWeek[]): number => {
    if (monthWeeks.length === 0) return 0;
    const total = monthWeeks.reduce((s, w) => s + weekProgress(w), 0);
    return Math.round(total / monthWeeks.length);
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

  const toggleYear = (y: number) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(y)) next.delete(y); else next.add(y);
      return next;
    });
  };

  const toggleMonth = (key: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const currentWeek = weeks[0];
  const weekEpisodeCount = currentWeek ? DAY_SLOTS.length : 0;
  const weekFinalizedPautas = currentWeek ? pautas.filter(p => p.week_id === currentWeek.id && p.status === 'finalized').length : 0;
  const weekTotalPautas = currentWeek ? pautas.filter(p => p.week_id === currentWeek.id).length : weekEpisodeCount;
  const weekMatsWithTitle = currentWeek ? materials.filter(m => m.week_id === currentWeek.id && m.selected_title_index != null).length : 0;
  const weekTotalMats = currentWeek ? materials.filter(m => m.week_id === currentWeek.id).length : weekEpisodeCount;
  const weekScheduled = currentWeek ? materials.filter(m => m.week_id === currentWeek.id && m.spotify_link).length : 0;

  // === Quick release analytics ===
  const renderSmallFlag = (code: string, className = 'h-3.5 w-4.5 rounded-[2px] overflow-hidden') => {
    const FC = CountryFlags[code as keyof typeof CountryFlags] as unknown as ((props: { className?: string }) => JSX.Element) | undefined;
    return FC ? <FC className={className} /> : null;
  };

  function normalizeGenreToMain(genre: string): string | null {
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
  }

  const releaseStats = useMemo(() => {
    const byMonth: Record<string, number> = {};
    const byGenre: Record<string, number> = {};
    const byCountry: Record<string, { count: number; label: string }> = {};
    const sceneMap: Record<string, number> = {};
    const MONTHS_PT_S = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    releases.forEach(r => {
      const d = new Date(r.release_date + 'T12:00:00');
      const mKey = `${MONTHS_PT_S[d.getMonth()]} ${d.getFullYear()}`;
      byMonth[mKey] = (byMonth[mKey] || 0) + 1;

      const code = normalizeCountryCode(r.country);
      if (code) {
        if (!byCountry[code]) byCountry[code] = { count: 0, label: r.country || code };
        byCountry[code].count++;
      }

      const seen = new Set<string>();
      (r.genres || []).forEach(g => {
        const main = normalizeGenreToMain(g);
        if (main && !seen.has(main)) {
          seen.add(main);
          byGenre[main] = (byGenre[main] || 0) + 1;
          if (code) sceneMap[`${code}:${main}`] = (sceneMap[`${code}:${main}`] || 0) + 1;
        }
      });
    });

    const monthEntries = Object.entries(byMonth);
    const genreEntries = Object.entries(byGenre).sort(([, a], [, b]) => b - a);
    const countryEntries = Object.entries(byCountry).sort(([, a], [, b]) => b.count - a.count);
    const sceneCount = Object.keys(sceneMap).length;
    const topScene = Object.entries(sceneMap).sort(([, a], [, b]) => b - a)[0];

    return {
      avgPerMonth: monthEntries.length > 0 ? (releases.length / monthEntries.length).toFixed(1) : '0',
      topMonth: monthEntries.length > 0 ? monthEntries.reduce((a, b) => b[1] > a[1] ? b : a) : null,
      topGenre: genreEntries[0] || null,
      topCountry: countryEntries[0] || null,
      topCountryCode: countryEntries[0]?.[0] || null,
      sceneCount,
      topScene: topScene ? { key: topScene[0], count: topScene[1] } : null,
    };
  }, [releases]);

  const stats = [
    { label: 'Lançamentos', value: String(releases.length), icon: Disc, route: '/releases' },
    { label: 'Pautas', value: `${weekFinalizedPautas}/${weekTotalPautas || weekEpisodeCount}`, icon: FileText, route: '/pautas' },
    { label: 'Materiais', value: `${weekMatsWithTitle}/${weekTotalMats || weekEpisodeCount}`, icon: Palette, route: '/materials' },
    { label: 'Agendados', value: `${weekScheduled}/${weekTotalMats || weekEpisodeCount}`, icon: Calendar, route: '/calendar' },
  ];

  const INDICATOR_LABELS = ['Pauta', 'Título', 'Descrição', 'Capa', 'Agend.'];

  return (
    <div className="space-y-8">
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ scale: 1.02 }}>
            <Card className="cursor-pointer hover:border-primary/40 hover:shadow-lg transition-all duration-200" onClick={() => navigate(s.route)}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold mt-1">{s.value}</p>
                </div>
                <s.icon className="h-5 w-5 text-muted-foreground/50" />
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Hierarchical tree: Year > Month > Week > Day */}
      {tree.map(({ year: y, months }) => {
        const allYearWeeks = months.flatMap(m => m.weeks);
        const yPct = yearProgress(allYearWeeks);
        const isYearOpen = expandedYears.has(y);

        return (
          <Card key={y} className="hover:shadow-lg transition-all duration-200">
            <button
              className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
              onClick={() => toggleYear(y)}
            >
              {isYearOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRightIcon className="h-4 w-4 text-muted-foreground shrink-0" />}
              <span className={`h-3 w-3 rounded-full ${trafficLight(yPct)}`} />
              <span className="text-base font-bold">{y}</span>
              <Badge variant="secondary" className="text-xs">{allYearWeeks.length} semanas</Badge>
              <div className="flex-1 mx-3"><Progress value={yPct} className="h-1.5" /></div>
              <span className="text-sm font-mono text-muted-foreground">{yPct}%</span>
            </button>

            <AnimatePresence>
              {isYearOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="px-4 pb-4 space-y-2">
                    {months.map(({ month: m, weeks: mWeeks }) => {
                      const mKey = `${y}-${m}`;
                      const mPct = monthProgress(mWeeks);
                      const isMonthOpen = expandedMonths.has(mKey);

                      return (
                        <div key={mKey} className="rounded-lg border border-border/50 overflow-hidden">
                          <button
                            className="w-full flex items-center gap-3 p-3 hover:bg-muted/20 transition-colors text-left"
                            onClick={() => toggleMonth(mKey)}
                          >
                            {isMonthOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                            <span className={`h-2.5 w-2.5 rounded-full ${trafficLight(mPct)}`} />
                            <span className="text-sm font-medium">{MONTHS_PT[m]}</span>
                            <Badge variant="secondary" className="text-[10px]">{mWeeks.length} sem</Badge>
                            <div className="flex-1 mx-3"><Progress value={mPct} className="h-1" /></div>
                            <span className="text-xs font-mono text-muted-foreground">{mPct}%</span>
                          </button>

                          <AnimatePresence>
                            {isMonthOpen && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <div className="px-3 pb-3 space-y-1.5">
                                  {mWeeks.map(week => {
                                    const wPct = weekProgress(week);
                                    const isExpanded = expandedWeek === week.id;
                                    const dayIndicators = getWeekIndicators(week);

                                    return (
                                      <div key={week.id} className="rounded-md border border-border/30 overflow-hidden">
                                        <button
                                          className="w-full flex items-center gap-3 p-2.5 hover:bg-muted/20 transition-colors text-left"
                                          onClick={() => setExpandedWeek(isExpanded ? null : week.id)}
                                        >
                                          {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRightIcon className="h-3 w-3 text-muted-foreground shrink-0" />}
                                          <span className={`h-2 w-2 rounded-full shrink-0 ${trafficLight(wPct)}`} />
                                          <span className="text-xs font-medium">
                                            {(() => {
                                              const mon = new Date(week.start_date + 'T12:00:00');
                                              const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
                                              return `${format(mon, 'dd.MM')} – ${format(sun, 'dd.MM')}`;
                                            })()}
                                          </span>
                                          <div className="flex-1 mx-2"><Progress value={wPct} className="h-1" /></div>
                                          <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{wPct}%</span>
                                          <Badge variant="secondary" className="text-[9px] ml-1">{week.status}</Badge>
                                        </button>

                                        {isExpanded && (
                                          <div className="border-t border-border/30 bg-muted/10 p-2.5">
                                            <div className="grid grid-cols-[100px_repeat(5,1fr)_60px] gap-1 text-[10px] text-muted-foreground font-medium mb-1 px-1">
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

      {weeks.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <img src={heavynautaLogo} alt="Heavynauta" className="h-16 w-16 rounded-2xl object-cover mb-4 opacity-50" />
            <p className="text-muted-foreground">Nenhuma semana criada. Comece pela aba Pautas.</p>
          </CardContent>
        </Card>
      )}

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
