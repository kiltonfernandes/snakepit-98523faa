import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Globe, Music, TrendingUp, TrendingDown, Filter, ArrowLeft, Flame, Hash, Search, Star, Zap, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { normalizeCountryCode } from '@/lib/country-utils';
import { NORMALIZED_GENRES } from '@/lib/constants';
import * as CountryFlags from 'country-flag-icons/react/3x2';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

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

const CHART_COLORS = [
  'hsl(var(--primary))', 'hsl(var(--chart-2, 280 60% 50%))', 'hsl(var(--chart-3, 200 60% 50%))',
  'hsl(var(--chart-4, 120 60% 40%))', 'hsl(var(--chart-5, 40 80% 50%))', '#e74c3c', '#9b59b6', '#1abc9c',
  '#f39c12', '#2ecc71', '#e67e22',
];

// Scene presets: popular combinations for quick exploration
const SCENE_PRESETS = [
  { label: '🇧🇷 Brasil Death', country: 'BR', genre: 'Death Metal' },
  { label: '🇧🇷 Brasil Thrash', country: 'BR', genre: 'Thrash Metal' },
  { label: '🇺🇸 USA Death', country: 'US', genre: 'Death Metal' },
  { label: '🇸🇪 Suécia Death', country: 'SE', genre: 'Death Metal' },
  { label: '🇸🇪 Suécia Black', country: 'SE', genre: 'Black Metal' },
  { label: '🇫🇮 Finlândia Death', country: 'FI', genre: 'Death Metal' },
  { label: '🇫🇮 Finlândia Power', country: 'FI', genre: 'Power Metal' },
  { label: '🇩🇪 Alemanha Power', country: 'DE', genre: 'Power Metal' },
  { label: '🇩🇪 Alemanha Thrash', country: 'DE', genre: 'Thrash Metal' },
  { label: '🇬🇧 UK Heavy', country: 'GB', genre: 'Heavy Metal' },
  { label: '🇳🇴 Noruega Black', country: 'NO', genre: 'Black Metal' },
  { label: '🇬🇷 Grécia Black', country: 'GR', genre: 'Black Metal' },
  { label: '🇺🇸 USA Metalcore', country: 'US', genre: 'Metalcore' },
  { label: '🇮🇹 Itália Symphonic', country: 'IT', genre: 'Symphonic Metal' },
  { label: '🇺🇸 USA Doom', country: 'US', genre: 'Doom Metal' },
  { label: '🇺🇸 USA Prog', country: 'US', genre: 'Progressive Metal' },
];

interface SceneEntry {
  country: string;
  genre: string;
  count: number;
  uniqueArtists: number;
  artists: Set<string>;
}

interface ScenesTabProps {
  scenes: SceneEntry[];
  filtered: any[];
  totalScenes: number;
  avgPerScene: number;
  sceneSearch: string;
  setSceneSearch: (v: string) => void;
  sceneGenreFilter: string;
  setSceneGenreFilter: (v: string) => void;
  sceneCountryFilter: string;
  setSceneCountryFilter: (v: string) => void;
  sceneMinCount: number;
  setSceneMinCount: (v: number) => void;
  sceneDrilldown: { country: string; genre: string } | null;
  setSceneDrilldown: (v: { country: string; genre: string } | null) => void;
}

function ScenesTab({
  scenes, filtered, totalScenes, avgPerScene,
  sceneSearch, setSceneSearch,
  sceneGenreFilter, setSceneGenreFilter,
  sceneCountryFilter, setSceneCountryFilter,
  sceneMinCount, setSceneMinCount,
  sceneDrilldown, setSceneDrilldown,
}: ScenesTabProps) {
  const sceneGenres = useMemo(() => [...new Set(scenes.map(s => s.genre))].sort(), [scenes]);
  const sceneCountries = useMemo(() => {
    const map = new Map<string, string>();
    scenes.forEach(s => { if (!map.has(s.country)) map.set(s.country, s.country); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [scenes]);

  const filteredScenes = useMemo(() => {
    return scenes.filter(s => {
      if (s.count < sceneMinCount) return false;
      if (sceneGenreFilter !== 'all' && s.genre !== sceneGenreFilter) return false;
      if (sceneCountryFilter !== 'all' && s.country !== sceneCountryFilter) return false;
      if (sceneSearch) {
        const q = sceneSearch.toLowerCase();
        if (!s.genre.toLowerCase().includes(q) && !s.country.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [scenes, sceneMinCount, sceneGenreFilter, sceneCountryFilter, sceneSearch]);

  const sceneChartData = useMemo(() =>
    filteredScenes.slice(0, 20).map(s => ({
      name: `${s.country} ${s.genre}`,
      count: s.count,
      artists: s.uniqueArtists,
      country: s.country,
      genre: s.genre,
    })),
  [filteredScenes]);

  const sceneDrilldownReleases = useMemo(() => {
    if (!sceneDrilldown) return [];
    return filtered.filter(r => {
      const code = normalizeCountryCode(r.country);
      if (code !== sceneDrilldown.country) return false;
      return (r.genres || []).some((g: string) => normalizeGenreToMain(g) === sceneDrilldown.genre);
    }).sort((a: any, b: any) => b.release_date.localeCompare(a.release_date));
  }, [sceneDrilldown, filtered]);

  const applyPreset = (preset: { country: string; genre: string }) => {
    setSceneCountryFilter(preset.country);
    setSceneGenreFilter(preset.genre);
    setSceneSearch('');
    setSceneMinCount(1);
  };

  const clearSceneFilters = () => {
    setSceneSearch('');
    setSceneGenreFilter('all');
    setSceneCountryFilter('all');
    setSceneMinCount(1);
    setSceneDrilldown(null);
  };

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Cenas Ativas', value: totalScenes, icon: Flame },
          { label: 'Média / Cena', value: avgPerScene.toFixed(1), icon: Hash },
          { label: 'Cenas 5+', value: scenes.filter(s => s.count >= 5).length, icon: Star },
          { label: 'Filtradas', value: filteredScenes.length, icon: Search },
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

      {/* Presets */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Presets de Cenas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {SCENE_PRESETS.map(p => {
              const isActive = sceneCountryFilter === p.country && sceneGenreFilter === p.genre;
              const sceneData = scenes.find(s => s.country === p.country && s.genre === p.genre);
              return (
                <Button
                  key={`${p.country}-${p.genre}`}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs h-7 gap-1"
                  onClick={() => isActive ? clearSceneFilters() : applyPreset(p)}
                >
                  {p.label}
                  {sceneData && <Badge variant="secondary" className="text-[9px] px-1 ml-0.5">{sceneData.count}</Badge>}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1 flex-1 min-w-[150px] max-w-[250px]">
              <Label className="text-xs">Buscar cena</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="h-8 text-xs pl-7" placeholder="País ou gênero..." value={sceneSearch} onChange={e => setSceneSearch(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Gênero</Label>
              <Select value={sceneGenreFilter} onValueChange={setSceneGenreFilter}>
                <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {sceneGenres.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">País</Label>
              <Select value={sceneCountryFilter} onValueChange={setSceneCountryFilter}>
                <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {sceneCountries.map(([code]) => (
                    <SelectItem key={code} value={code}>
                      <span className="inline-flex items-center gap-2">{renderFlag(code)}<span>{code}</span></span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-[120px]">
              <Label className="text-xs">Mín. lançamentos: {sceneMinCount}</Label>
              <Slider min={1} max={20} step={1} value={[sceneMinCount]} onValueChange={v => setSceneMinCount(v[0])} />
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={clearSceneFilters}>
              <Filter className="h-3 w-3 mr-1" /> Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      {sceneChartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Top Cenas (clique para detalhar)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(300, sceneChartData.length * 28)}>
              <BarChart data={sceneChartData} layout="vertical" margin={{ left: 100 }}
                onClick={(e) => {
                  const p = e?.activePayload?.[0]?.payload;
                  if (p) setSceneDrilldown({ country: p.country, genre: p.genre });
                }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={100} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                  formatter={(value: any, name: string) => [value, name === 'count' ? 'Lançamentos' : 'Artistas']} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} cursor="pointer" />
                <Bar dataKey="artists" fill="hsl(var(--chart-2, 280 60% 50%))" radius={[0, 4, 4, 0]} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Full list */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{filteredScenes.length} Cenas</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-1">
              {filteredScenes.map((sc, i) => {
                const isSelected = sceneDrilldown?.country === sc.country && sceneDrilldown?.genre === sc.genre;
                return (
                  <motion.div key={`${sc.country}:${sc.genre}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.015, 0.5) }}
                    className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/20'}`}
                    onClick={() => setSceneDrilldown(isSelected ? null : { country: sc.country, genre: sc.genre })}
                  >
                    <span className="text-xs text-muted-foreground w-5 font-mono">{i + 1}</span>
                    {renderFlag(sc.country)}
                    <span className="text-xs text-muted-foreground w-8">{sc.country}</span>
                    <span className="text-sm flex-1 truncate">{sc.genre}</span>
                    <Badge variant="outline" className="text-[10px]">{sc.uniqueArtists} artistas</Badge>
                    <div className="w-24 h-2.5 bg-muted/30 rounded-sm overflow-hidden">
                      <div className="h-full bg-primary/60 rounded-sm" style={{ width: `${(sc.count / (filteredScenes[0]?.count || 1)) * 100}%` }} />
                    </div>
                    <span className="text-xs font-mono font-bold w-6 text-right">{sc.count}</span>
                  </motion.div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Scene drilldown */}
      {sceneDrilldown && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              {renderFlag(sceneDrilldown.country)}
              <span>{sceneDrilldown.country} — {sceneDrilldown.genre}</span>
              <Badge variant="secondary">{sceneDrilldownReleases.length} releases</Badge>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setSceneDrilldown(null)} className="text-xs">✕ Fechar</Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[350px]">
              <div className="space-y-1">
                {sceneDrilldownReleases.map((r: any) => (
                  <div key={r.id} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/20 text-sm">
                    {renderFlag(normalizeCountryCode(r.country) || '')}
                    <span className="font-medium">{r.artist}</span>
                    <span className="text-muted-foreground italic flex-1 truncate">{r.album}</span>
                    <span className="text-xs text-muted-foreground">{r.release_date}</span>
                    <div className="flex gap-1">
                      {(r.genres || []).slice(0, 2).map((g: string) => (
                        <Badge key={g} variant="secondary" className="text-[8px]">{g}</Badge>
                      ))}
                    </div>
                    {r.rating != null && <Badge variant="outline" className="text-[9px]">★ {r.rating}</Badge>}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
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
  const [drilldown, setDrilldown] = useState<{ type: string; value: string } | null>(null);

  // Scene-specific state
  const [sceneSearch, setSceneSearch] = useState('');
  const [sceneGenreFilter, setSceneGenreFilter] = useState<string>('all');
  const [sceneCountryFilter, setSceneCountryFilter] = useState<string>('all');
  const [sceneMinCount, setSceneMinCount] = useState(1);
  const [sceneDrilldown, setSceneDrilldown] = useState<{ country: string; genre: string } | null>(null);

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

  // Drilldown releases
  const drilldownReleases = useMemo(() => {
    if (!drilldown) return [];
    return filtered.filter(r => {
      if (drilldown.type === 'genre') {
        return (r.genres || []).some(g => normalizeGenreToMain(g) === drilldown.value);
      }
      if (drilldown.type === 'country') {
        return normalizeCountryCode(r.country) === drilldown.value;
      }
      if (drilldown.type === 'month') {
        const d = new Date(r.release_date + 'T12:00:00');
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === drilldown.value;
      }
      return false;
    });
  }, [drilldown, filtered]);

  const genreChartData = useMemo(() => byGenre.map(([g, c]) => ({ name: g, count: c })), [byGenre]);
  const monthChartData = useMemo(() => byMonth.map(([k, v]) => ({ name: formatMonthLabel(k), key: k, count: v })), [byMonth]);
  const countryChartData = useMemo(() => byCountry.slice(0, 15).map(([code, data]) => ({ name: data.label, code, count: data.count })), [byCountry]);
  const genrePieData = useMemo(() => byGenre.slice(0, 8).map(([g, c]) => ({ name: g, value: c })), [byGenre]);

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
        <TabsContent value="countries" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Top 15 Países</CardTitle></CardHeader>
            <CardContent>
              {countryChartData.length > 0 && (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={countryChartData} layout="vertical" margin={{ left: 60 }}
                    onClick={(e) => e?.activePayload?.[0] && setDrilldown({ type: 'country', value: e.activePayload[0].payload.code })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={60} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} cursor="pointer" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Todos os Países</CardTitle></CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {byCountry.map(([code, data], i) => (
                    <motion.div key={code} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
                      className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/20 cursor-pointer"
                      onClick={() => setDrilldown({ type: 'country', value: code })}
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
        <TabsContent value="genres" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Lançamentos por Gênero Normalizado</CardTitle></CardHeader>
            <CardContent>
              {genreChartData.length > 0 && (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={genreChartData} layout="vertical" margin={{ left: 80 }}
                    onClick={(e) => e?.activePayload?.[0] && setDrilldown({ type: 'genre', value: e.activePayload[0].payload.name })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={80} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} cursor="pointer" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Genre pie chart */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Distribuição por Gênero</CardTitle></CardHeader>
            <CardContent className="flex justify-center">
              {genrePieData.length > 0 && (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={genrePieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      onClick={(_, idx) => setDrilldown({ type: 'genre', value: genrePieData[idx].name })}>
                      {genrePieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} cursor="pointer" />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SCENES */}
        <TabsContent value="scenes" className="mt-4 space-y-4">
          <ScenesTab
            scenes={scenes}
            filtered={filtered}
            totalScenes={totalScenes}
            avgPerScene={avgPerScene}
            sceneSearch={sceneSearch}
            setSceneSearch={setSceneSearch}
            sceneGenreFilter={sceneGenreFilter}
            setSceneGenreFilter={setSceneGenreFilter}
            sceneCountryFilter={sceneCountryFilter}
            setSceneCountryFilter={setSceneCountryFilter}
            sceneMinCount={sceneMinCount}
            setSceneMinCount={setSceneMinCount}
            sceneDrilldown={sceneDrilldown}
            setSceneDrilldown={setSceneDrilldown}
          />
        </TabsContent>

        {/* TIMELINE */}
        <TabsContent value="timeline" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Lançamentos por Mês</CardTitle></CardHeader>
            <CardContent>
              {monthChartData.length > 0 && (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={monthChartData}
                    onClick={(e) => e?.activePayload?.[0] && setDrilldown({ type: 'month', value: e.activePayload[0].payload.key })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} angle={-45} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} cursor="pointer" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Trend line */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Tendência de Lançamentos</CardTitle></CardHeader>
            <CardContent>
              {monthChartData.length > 0 && (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={monthChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} angle={-45} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                    <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))' }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Drilldown Panel */}
      {drilldown && (
        <Card className="mt-4">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">
              Drilldown: {drilldown.type === 'genre' ? drilldown.value : drilldown.type === 'country' ? drilldown.value : formatMonthLabel(drilldown.value)}
              <Badge variant="secondary" className="ml-2">{drilldownReleases.length} releases</Badge>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setDrilldown(null)} className="text-xs">✕ Fechar</Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-1">
                {drilldownReleases.map(r => (
                  <div key={r.id} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/20 text-sm">
                    {renderFlag(normalizeCountryCode(r.country) || '')}
                    <span className="font-medium">{r.artist}</span>
                    <span className="text-muted-foreground italic">{r.album}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{r.release_date}</span>
                    <div className="flex gap-1">
                      {(r.genres || []).slice(0, 2).map(g => (
                        <Badge key={g} variant="secondary" className="text-[8px]">{g}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
