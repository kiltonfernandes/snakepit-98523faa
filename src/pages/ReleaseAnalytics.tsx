import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Globe, Music, TrendingUp, TrendingDown, Filter, ArrowLeft, Flame, Hash } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { normalizeCountryCode } from '@/lib/country-utils';
import { NORMALIZED_GENRES } from '@/lib/constants';
import * as CountryFlags from 'country-flag-icons/react/3x2';
import { motion } from 'framer-motion';

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTHS_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function normalizeGenreToMain(genre: string): string | null {
  const lower = genre.toLowerCase().trim();
  for (const ng of NORMALIZED_GENRES) {
    const ngLower = ng.toLowerCase();
    if (lower === ngLower) return ng;
    if (lower.includes(ngLower.replace(' metal', '')) && ngLower.includes('metal')) return ng;
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

function renderFlag(code: string, className = 'h-4 w-5 rounded-[2px] overflow-hidden') {
  const FC = CountryFlags[code as keyof typeof CountryFlags] as unknown as ((props: { className?: string }) => JSX.Element) | undefined;
  if (!FC) return null;
  return <FC className={className} />;
}

export default function ReleaseAnalytics() {
  const navigate = useNavigate();
  const { releases } = useApp();

  // Date range filter
  const allYears = useMemo(() => {
    const yrs = new Set<number>();
    releases.forEach(r => yrs.add(new Date(r.release_date + 'T12:00:00').getFullYear()));
    return Array.from(yrs).sort();
  }, [releases]);

  const currentYear = new Date().getFullYear();
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [genreFilter, setGenreFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [monthRange, setMonthRange] = useState<number[]>([1, 12]);

  const filtered = useMemo(() => {
    return releases.filter(r => {
      const d = new Date(r.release_date + 'T12:00:00');
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      if (yearFilter !== 'all' && y !== Number(yearFilter)) return false;
      if (m < monthRange[0] || m > monthRange[1]) return false;
      if (genreFilter !== 'all') {
        const mainGenres = (r.genres || []).map(g => normalizeGenreToMain(g)).filter(Boolean);
        if (!mainGenres.includes(genreFilter)) return false;
      }
      if (countryFilter !== 'all') {
        const code = normalizeCountryCode(r.country);
        if (code !== countryFilter) return false;
      }
      return true;
    });
  }, [releases, yearFilter, monthRange, genreFilter, countryFilter]);

  // === Analytics computations ===

  // Releases by month
  const byMonth = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => {
      const d = new Date(r.release_date + 'T12:00:00');
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const avgPerMonth = byMonth.length > 0 ? (filtered.length / byMonth.length) : 0;
  const topMonth = byMonth.length > 0 ? byMonth.reduce((a, b) => b[1] > a[1] ? b : a) : null;
  const bottomMonth = byMonth.length > 0 ? byMonth.reduce((a, b) => b[1] < a[1] ? b : a) : null;

  // By genre (normalized)
  const byGenre = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => {
      const seen = new Set<string>();
      (r.genres || []).forEach(g => {
        const main = normalizeGenreToMain(g);
        if (main && !seen.has(main)) { seen.add(main); map[main] = (map[main] || 0) + 1; }
      });
    });
    return Object.entries(map).sort(([, a], [, b]) => b - a);
  }, [filtered]);

  const topGenre = byGenre[0] || null;
  const bottomGenre = byGenre.length > 0 ? byGenre[byGenre.length - 1] : null;

  // By country
  const byCountry = useMemo(() => {
    const map: Record<string, { count: number; label: string }> = {};
    filtered.forEach(r => {
      const code = normalizeCountryCode(r.country);
      if (code) {
        if (!map[code]) map[code] = { count: 0, label: r.country || code };
        map[code].count++;
      }
    });
    return Object.entries(map).sort(([, a], [, b]) => b.count - a.count);
  }, [filtered]);

  const topCountry = byCountry[0] || null;
  const bottomCountry = byCountry.length > 0 ? byCountry[byCountry.length - 1] : null;
  const avgPerCountry = byCountry.length > 0 ? (filtered.length / byCountry.length) : 0;

  // Per week
  const byWeek = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => {
      const d = new Date(r.release_date + 'T12:00:00');
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
      const key = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const avgPerWeek = byWeek.length > 0 ? (filtered.length / byWeek.length) : 0;

  // === SCENES: country + normalized genre ===
  const scenes = useMemo(() => {
    const map: Record<string, { country: string; genre: string; count: number; artists: Set<string> }> = {};
    filtered.forEach(r => {
      const code = normalizeCountryCode(r.country);
      if (!code) return;
      const seen = new Set<string>();
      (r.genres || []).forEach(g => {
        const main = normalizeGenreToMain(g);
        if (main && !seen.has(main)) {
          seen.add(main);
          const key = `${code}:${main}`;
          if (!map[key]) map[key] = { country: code, genre: main, count: 0, artists: new Set() };
          map[key].count++;
          map[key].artists.add(r.artist);
        }
      });
    });
    return Object.values(map)
      .map(s => ({ ...s, uniqueArtists: s.artists.size }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const totalScenes = scenes.length;
  const avgPerScene = totalScenes > 0 ? (scenes.reduce((s, sc) => s + sc.count, 0) / totalScenes) : 0;
  const topScenes = scenes.slice(0, 10);
  const bottomScenes = scenes.length > 5 ? scenes.slice(-5).reverse() : [];

  // Countries for filter
  const filterCountries = useMemo(() => {
    const map = new Map<string, string>();
    releases.forEach(r => {
      const code = normalizeCountryCode(r.country);
      if (code && !map.has(code)) map.set(code, r.country || code);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [releases]);

  const formatMonthLabel = (key: string) => {
    const [y, m] = key.split('-');
    return `${MONTHS_PT[Number(m) - 1]} ${y}`;
  };

  const BarVisual = ({ items, maxVal }: { items: [string, number][]; maxVal: number }) => (
    <div className="space-y-1.5">
      {items.map(([label, val]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-24 truncate text-right">{label}</span>
          <div className="flex-1 h-5 bg-muted/30 rounded-sm overflow-hidden">
            <div className="h-full bg-primary/60 rounded-sm transition-all" style={{ width: `${Math.max((val / maxVal) * 100, 2)}%` }} />
          </div>
          <span className="text-xs font-mono w-8 text-right">{val}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Analytics de Lançamentos
            </h1>
            <p className="text-muted-foreground text-sm">{filtered.length} lançamentos filtrados de {releases.length} total</p>
          </div>
        </div>
      </div>

      {/* Filters bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Ano</Label>
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {allYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 flex-1 min-w-[200px] max-w-[300px]">
              <Label className="text-xs">Meses: {MONTHS_PT[monthRange[0] - 1]} – {MONTHS_PT[monthRange[1] - 1]}</Label>
              <Slider
                min={1} max={12} step={1}
                value={monthRange}
                onValueChange={setMonthRange}
                className="mt-2"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Gênero</Label>
              <Select value={genreFilter} onValueChange={setGenreFilter}>
                <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {NORMALIZED_GENRES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">País</Label>
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {filterCountries.map(([code, label]) => (
                    <SelectItem key={code} value={code}>
                      <span className="inline-flex items-center gap-2">{renderFlag(code)}<span>{label}</span></span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setYearFilter('all'); setGenreFilter('all'); setCountryFilter('all'); setMonthRange([1, 12]); }}>
              <Filter className="h-3 w-3 mr-1" /> Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="countries">Países</TabsTrigger>
          <TabsTrigger value="genres">Gêneros</TabsTrigger>
          <TabsTrigger value="scenes">Cenas</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Total Lançamentos', value: filtered.length, icon: Music },
              { label: 'Média por Mês', value: avgPerMonth.toFixed(1), icon: TrendingUp },
              { label: 'Média por Semana', value: avgPerWeek.toFixed(1), icon: Hash },
              { label: 'Total de Cenas', value: totalScenes, icon: Flame },
            ].map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card>
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

          <div className="grid gap-4 md:grid-cols-2">
            {/* Top/Bottom months */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Meses</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {topMonth && (
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm">Mais ativo: <strong>{formatMonthLabel(topMonth[0])}</strong></span>
                    <Badge variant="secondary">{topMonth[1]}</Badge>
                  </div>
                )}
                {bottomMonth && (
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-400" />
                    <span className="text-sm">Menos ativo: <strong>{formatMonthLabel(bottomMonth[0])}</strong></span>
                    <Badge variant="secondary">{bottomMonth[1]}</Badge>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Média: {avgPerMonth.toFixed(1)} lançamentos/mês</p>
              </CardContent>
            </Card>

            {/* Top/Bottom genres */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Gêneros</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {topGenre && (
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm">Mais ativo: <strong>{topGenre[0]}</strong></span>
                    <Badge variant="secondary">{topGenre[1]}</Badge>
                  </div>
                )}
                {bottomGenre && (
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-400" />
                    <span className="text-sm">Menos ativo: <strong>{bottomGenre[0]}</strong></span>
                    <Badge variant="secondary">{bottomGenre[1]}</Badge>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{byGenre.length} gêneros distintos</p>
              </CardContent>
            </Card>

            {/* Top/Bottom countries */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Países</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {topCountry && (
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    {renderFlag(topCountry[0])}
                    <span className="text-sm"><strong>{topCountry[1].label}</strong></span>
                    <Badge variant="secondary">{topCountry[1].count}</Badge>
                  </div>
                )}
                {bottomCountry && (
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-400" />
                    {renderFlag(bottomCountry[0])}
                    <span className="text-sm"><strong>{bottomCountry[1].label}</strong></span>
                    <Badge variant="secondary">{bottomCountry[1].count}</Badge>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{byCountry.length} países • Média: {avgPerCountry.toFixed(1)}/país</p>
              </CardContent>
            </Card>

            {/* Scenes summary */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Cenas</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {topScenes[0] && (
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-orange-400" />
                    {renderFlag(topScenes[0].country)}
                    <span className="text-sm"><strong>{topScenes[0].genre}</strong></span>
                    <Badge variant="secondary">{topScenes[0].count}</Badge>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{totalScenes} cenas • Média: {avgPerScene.toFixed(1)} lançamentos/cena</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* COUNTRIES */}
        <TabsContent value="countries" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Lançamentos por País</CardTitle></CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {byCountry.map(([code, data], i) => (
                    <motion.div key={code} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
                      className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/20 cursor-pointer"
                      onClick={() => setCountryFilter(code)}
                    >
                      <span className="text-xs text-muted-foreground w-6 text-right font-mono">{i + 1}</span>
                      {renderFlag(code)}
                      <span className="text-sm flex-1">{data.label}</span>
                      <div className="w-32 h-3 bg-muted/30 rounded-sm overflow-hidden">
                        <div className="h-full bg-primary/60 rounded-sm" style={{ width: `${(data.count / (byCountry[0]?.[1]?.count || 1)) * 100}%` }} />
                      </div>
                      <span className="text-xs font-mono w-8 text-right">{data.count}</span>
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* GENRES */}
        <TabsContent value="genres" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Lançamentos por Gênero Normalizado</CardTitle></CardHeader>
            <CardContent>
              {byGenre.length > 0 && (
                <BarVisual items={byGenre.map(([g, c]) => [g, c])} maxVal={byGenre[0][1]} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SCENES */}
        <TabsContent value="scenes" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Flame className="h-4 w-4 text-orange-400" /> Top 10 Cenas Mais Ativas</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {topScenes.map((sc, i) => (
                      <div key={`${sc.country}:${sc.genre}`} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/20">
                        <span className="text-xs text-muted-foreground w-5 font-mono">{i + 1}</span>
                        {renderFlag(sc.country)}
                        <span className="text-sm flex-1 truncate">{sc.genre}</span>
                        <Badge variant="outline" className="text-[10px]">{sc.uniqueArtists} artistas</Badge>
                        <span className="text-xs font-mono font-bold">{sc.count}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Resumo de Cenas</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-3 rounded-lg bg-muted/20">
                    <p className="text-2xl font-bold">{totalScenes}</p>
                    <p className="text-xs text-muted-foreground">Cenas Ativas</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/20">
                    <p className="text-2xl font-bold">{avgPerScene.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">Média/Cena</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/20">
                    <p className="text-2xl font-bold">{scenes.filter(s => s.count >= 5).length}</p>
                    <p className="text-xs text-muted-foreground">Cenas com 5+</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/20">
                    <p className="text-2xl font-bold">{new Set(scenes.map(s => s.country)).size}</p>
                    <p className="text-xs text-muted-foreground">Países com Cena</p>
                  </div>
                </div>

                {bottomScenes.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 font-medium">Cenas Menos Ativas</p>
                    <div className="space-y-1.5">
                      {bottomScenes.map(sc => (
                        <div key={`${sc.country}:${sc.genre}`} className="flex items-center gap-2 text-sm">
                          {renderFlag(sc.country)}
                          <span className="flex-1 truncate">{sc.genre}</span>
                          <span className="text-xs font-mono text-muted-foreground">{sc.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TIMELINE */}
        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Lançamentos por Mês</CardTitle></CardHeader>
            <CardContent>
              {byMonth.length > 0 && (
                <BarVisual items={byMonth.map(([k, v]) => [formatMonthLabel(k), v])} maxVal={topMonth?.[1] || 1} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
