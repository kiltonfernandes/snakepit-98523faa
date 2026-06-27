import { useState, useMemo, useCallback, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Disc, Plus, Search, Download, Upload, Trash2, Star, Filter, AlertCircle, CheckCircle, XCircle, ArrowUpDown, ClipboardPaste, LayoutGrid, TableIcon, FileText, Square, CheckSquare, ExternalLink, Link2, Globe, Loader2, RefreshCw, Users, ChevronRight, ChevronDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApp } from '@/contexts/AppContext';
import { Release } from '@/lib/types';
import { resolveAllLinks, linksToMarkdown, PLATFORM_CONFIG, type PlatformLinks } from '@/lib/dynamic-links';
import { countryFlag, normalizeCountryCode } from '@/lib/country-utils';
import { NORMALIZED_GENRES } from '@/lib/constants';
import * as CountryFlags from 'country-flag-icons/react/3x2';
import { GenerationProgressModal, GenerationItem } from '@/components/GenerationProgressModal';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

const emptyForm = { artist: '', album: '', release_date: '', genres: '', rating: 3, comments: '', country: '', youtube_url: '', spotify_url: '', deezer_url: '', apple_music_url: '', bandcamp_url: '', metal_archives_url: '', shortlist: false };

interface ImportSummary { valid: number; duplicates: number; invalid: number; errors: string[]; }

type QuickFilter = 'all' | 'today' | 'this_week' | 'last_week' | 'next_week' | 'this_month' | 'last_month' | 'next_month' | 'this_year' | 'last_year';
type SortField = 'release_date' | 'artist' | 'album' | 'rating';
type SortDir = 'asc' | 'desc';
import { ViewModeToggle } from '@/components/shared/ViewModeToggle';
import { useViewMode, ViewMode } from '@/hooks/use-view-mode';
import { AutosaveBadge } from '@/components/shared/AutosaveBadge';
import { SortRulesPopover } from '@/components/releases/SortRulesPopover';
import { GroupRulesPopover } from '@/components/releases/GroupRulesPopover';
import {
  buildGroups,
  compareWithRules,
  collectAllGroupKeys,
  loadLS,
  saveLS,
  type GroupNode,
  type GroupRule,
  type SortRule,
} from '@/lib/releases-grouping';

function getDateRange(filter: QuickFilter): [string, string] | null {
  if (filter === 'all') return null;
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const dow = now.getDay();
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
  switch (filter) {
    case 'today': return [fmt(now), fmt(now)];
    case 'this_week': {
      const mon = new Date(y, m, d - (dow === 0 ? 6 : dow - 1));
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return [fmt(mon), fmt(sun)];
    }
    case 'last_week': {
      const mon = new Date(y, m, d - (dow === 0 ? 6 : dow - 1) - 7);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return [fmt(mon), fmt(sun)];
    }
    case 'next_week': {
      const mon = new Date(y, m, d - (dow === 0 ? 6 : dow - 1) + 7);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return [fmt(mon), fmt(sun)];
    }
    case 'this_month': return [fmt(new Date(y, m, 1)), fmt(new Date(y, m + 1, 0))];
    case 'last_month': return [fmt(new Date(y, m - 1, 1)), fmt(new Date(y, m, 0))];
    case 'next_month': return [fmt(new Date(y, m + 1, 1)), fmt(new Date(y, m + 2, 0))];
    case 'this_year': return [`${y}-01-01`, `${y}-12-31`];
    case 'last_year': return [`${y-1}-01-01`, `${y-1}-12-31`];
    default: return null;
  }
}

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'today', label: 'Hoje' },
  { key: 'this_week', label: 'Esta Semana' },
  { key: 'last_week', label: 'Semana Passada' },
  { key: 'next_week', label: 'Próxima Semana' },
  { key: 'this_month', label: 'Este Mês' },
  { key: 'last_month', label: 'Mês Passado' },
  { key: 'next_month', label: 'Próximo Mês' },
  { key: 'this_year', label: 'Este Ano' },
  { key: 'last_year', label: 'Ano Passado' },
];

function parseStructuredReleases(text: string, currentYear: number): { artist: string; album: string; release_date: string; genres: string[]; rating: number | null; comments: string | null }[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results: { artist: string; album: string; release_date: string; genres: string[]; rating: number | null; comments: string | null }[] = [];

  let currentDate = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const dateMatch = line.match(/^(\d{2})\.(\d{2})$/);
    if (dateMatch) {
      const day = dateMatch[1];
      const month = dateMatch[2];
      currentDate = `${currentYear}-${month}-${day}`;
      i++;
      continue;
    }

    if (/^[A-Za-z]+ \d{4}$/.test(line) || /^---/.test(line) || /^\[/.test(line)) {
      if (/^\[/.test(line) && results.length > 0) {
        i++;
        continue;
      }
      i++;
      continue;
    }

    const artistAlbumMatch = line.match(/^(.+?)\s*-\s+(.+)$/);
    if (artistAlbumMatch && currentDate) {
      const artist = artistAlbumMatch[1].trim();
      const album = artistAlbumMatch[2].trim();

      let releaseType = '';
      const genres: string[] = [];

      if (i + 1 < lines.length && /^\[/.test(lines[i + 1])) {
        const typeMatch = lines[i + 1].match(/^\[(.*?)\]$/);
        if (typeMatch) {
          releaseType = typeMatch[1];
          i++;
        }
      }

      if (i + 1 < lines.length && !lines[i + 1].match(/^\d{2}\.\d{2}$/) && !lines[i + 1].match(/^.+?\s*-\s+.+$/) && !lines[i + 1].match(/^\[/)) {
        const genreLine = lines[i + 1];
        genreLine.split(',').forEach(g => {
          const trimmed = g.trim();
          if (trimmed && !/^\d+(\.\d+)?$/.test(trimmed)) genres.push(trimmed);
        });
        i++;
      }

      results.push({
        artist,
        album,
        release_date: currentDate,
        genres,
        rating: null,
        comments: releaseType ? `[${releaseType}]` : null,
      });
    }

    i++;
  }

  return results;
}

export default function Releases() {
  const navigate = useNavigate();
  const { releases, addRelease, updateRelease, deleteRelease, importReleases, loadReleases, pautas } = useApp();
  const [search, setSearch] = useState('');
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [countryFilter, setCountryFilter] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [shortlistOnly, setShortlistOnly] = useState(false);
  const [genreDialogOpen, setGenreDialogOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>('release_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [sortRules, setSortRules] = useState<SortRule[]>(() =>
    loadLS<SortRule[]>('releases:sort', [{ field: 'release_date', dir: 'desc' }])
  );
  const [groupRules, setGroupRules] = useState<GroupRule[]>(() =>
    loadLS<GroupRule[]>('releases:group', [])
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(loadLS<string[]>('releases:collapsed', []))
  );
  useEffect(() => { saveLS('releases:sort', sortRules); }, [sortRules]);
  useEffect(() => { saveLS('releases:group', groupRules); }, [groupRules]);
  useEffect(() => { saveLS('releases:collapsed', Array.from(collapsedGroups)); }, [collapsedGroups]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useViewMode('releases', 'table');
  const [enrichingCountries, setEnrichingCountries] = useState(false);

  // Repatriation modal
  const [repatriateModalOpen, setRepatriateModalOpen] = useState(false);
  const [repatriateItems, setRepatriateItems] = useState<GenerationItem[]>([]);
  const [repatriateLogs, setRepatriateLogs] = useState<string[]>([]);

  // Bulk paste state
  const [pasteText, setPasteText] = useState('');
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [pasting, setPasting] = useState(false);
  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  // Band-level delete state
  const [bandsModalOpen, setBandsModalOpen] = useState(false);
  const [bandsSearch, setBandsSearch] = useState('');
  const [deleteBandConfirm, setDeleteBandConfirm] = useState<string | null>(null);

  const renderFlag = useCallback((country: string | null | undefined, className = 'h-4 w-5 rounded-[2px] overflow-hidden') => {
    const code = normalizeCountryCode(country);
    if (!code) return <Globe className="h-4 w-4 text-muted-foreground/30" />;
    const FlagComponent = CountryFlags[code as keyof typeof CountryFlags] as unknown as ((props: { className?: string }) => JSX.Element) | undefined;
    if (!FlagComponent) return <Globe className="h-4 w-4 text-muted-foreground/30" />;
    return <span title={country ?? code}><FlagComponent className={className} /></span>;
  }, []);

  const allCountries = useMemo(() => {
    const map = new Map<string, string>(); // code → original label
    releases.forEach(r => {
      if (r.country) {
        const code = normalizeCountryCode(r.country);
        if (code && !map.has(code)) map.set(code, r.country);
      }
    });
    return Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([code, label]) => ({ code, label }));
  }, [releases]);

  // Build map of release ID -> pauta info for review tags
  const reviewMap = useMemo(() => {
    const map = new Map<string, { pautaId: string; reviewer: string; pubDate: string }>();
    pautas.forEach(p => {
      const inputs = (p.raw_inputs_json || {}) as Record<string, any>;
      if (inputs.review_rafa_id) map.set(inputs.review_rafa_id, { pautaId: p.id, reviewer: 'Rafa', pubDate: p.publication_date });
      if (inputs.review_kilton_id) map.set(inputs.review_kilton_id, { pautaId: p.id, reviewer: 'Kilton', pubDate: p.publication_date });
    });
    return map;
  }, [pautas]);

  const allGenres = useMemo(() => {
    const set = new Set<string>();
    releases.forEach(r => (r.genres || []).forEach(g => {
      if (g && !/^\d+(\.\d+)?$/.test(g.trim())) set.add(g);
    }));
    return Array.from(set).sort();
  }, [releases]);

  const filtered = useMemo(() => {
    const dateRange = getDateRange(quickFilter);
    let result = releases.filter(r => {
      const q = search.toLowerCase();
      const matchSearch = !q || r.artist.toLowerCase().includes(q) || r.album.toLowerCase().includes(q) || (r.genres || []).some(g => g.toLowerCase().includes(q));
      const matchGenre = !genreFilter || (genreFilter.startsWith('~')
        ? (r.genres || []).some(g => g.toLowerCase().includes(genreFilter.slice(1).toLowerCase()))
        : (r.genres || []).includes(genreFilter));
      const matchCountry = countryFilter === null ? true : countryFilter === '__empty__' ? !r.country : normalizeCountryCode(r.country) === countryFilter;
      const matchShortlist = !shortlistOnly || !!r.shortlist;
      let matchDate = true;
      if (dateRange) {
        matchDate = r.release_date >= dateRange[0] && r.release_date <= dateRange[1];
      }
      return matchSearch && matchGenre && matchCountry && matchDate && matchShortlist;
    });
    const effectiveRules: SortRule[] = sortRules.length
      ? sortRules
      : [{ field: 'release_date', dir: 'desc' }];
    result.sort((a, b) => compareWithRules(a, b, effectiveRules));
    return result;
  }, [releases, search, genreFilter, countryFilter, quickFilter, sortRules, shortlistOnly]);

  const reviewIds = useMemo(() => new Set(reviewMap.keys()), [reviewMap]);

  const groupedTree = useMemo<GroupNode[]>(() => {
    if (groupRules.length === 0) return [];
    return buildGroups(filtered, groupRules, sortRules.length ? sortRules : [{ field: 'release_date', dir: 'desc' }], reviewIds);
  }, [filtered, groupRules, sortRules, reviewIds]);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const toggleGroupSelection = useCallback((ids: string[]) => {
    setSelectedIds(prev => {
      const allSelected = ids.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  }, []);

  // Repatriation: enrich countries with progress modal
  const enrichCountries = useCallback(async (forceAll = false) => {
    const targets = forceAll ? releases : releases.filter(r => !r.country);
    if (targets.length === 0) {
      toast.info('Todos os releases já possuem país');
      return;
    }

    // Group by unique artist, but send full release data for context
    const artistMap = new Map<string, typeof targets[0]>();
    for (const r of targets) {
      if (!artistMap.has(r.artist)) artistMap.set(r.artist, r);
    }
    const uniqueEntries = Array.from(artistMap.values());

    const items: GenerationItem[] = uniqueEntries.map(r => ({
      id: r.artist,
      label: r.artist,
      status: 'pending' as const,
    }));
    setRepatriateItems(items);
    setRepatriateLogs([`Iniciando repatriação de ${uniqueEntries.length} artistas${forceAll ? ' (todos)' : ''}...`]);
    setRepatriateModalOpen(true);
    setEnrichingCountries(true);

    try {
      const batchSize = 30;
      for (let i = 0; i < uniqueEntries.length; i += batchSize) {
        const batch = uniqueEntries.slice(i, i + batchSize);
        const batchArtists = batch.map(r => r.artist);
        
        // Mark batch as generating
        setRepatriateItems(prev => prev.map(item =>
          batchArtists.includes(item.id) ? { ...item, status: 'generating' } : item
        ));
        setRepatriateLogs(prev => [...prev, `Processando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(uniqueEntries.length / batchSize)} (${batch.length} artistas)...`]);

        try {
          const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lookup-country`;
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
            body: JSON.stringify({
              releases: batch.map(r => ({
                artist: r.artist,
                album: r.album,
                release_date: r.release_date,
                genres: r.genres || [],
              })),
            }),
          });

          if (!resp.ok) {
            setRepatriateItems(prev => prev.map(item =>
              batchArtists.includes(item.id) ? { ...item, status: 'error', error: `HTTP ${resp.status}` } : item
            ));
            setRepatriateLogs(prev => [...prev, `✗ Erro no lote: HTTP ${resp.status}`]);
            continue;
          }

          const { results } = await resp.json();
          if (!results) {
            setRepatriateItems(prev => prev.map(item =>
              batchArtists.includes(item.id) ? { ...item, status: 'error', error: 'Sem resultados' } : item
            ));
            continue;
          }

          for (const entry of batch) {
            const country = results[entry.artist.toLowerCase()];
            if (country) {
              // Update all releases by this artist
              const artistReleases = targets.filter(r => r.artist === entry.artist);
              for (const r of artistReleases) {
                await supabase.from('releases' as any).update({ country } as any).eq('id', r.id);
                updateRelease(r.id, { country });
              }
              setRepatriateItems(prev => prev.map(item =>
                item.id === entry.artist ? { ...item, status: 'done' } : item
              ));
               setRepatriateLogs(prev => [...prev, `✓ ${entry.artist} → ${countryFlag(country)} ${country}`]);
            } else {
              setRepatriateItems(prev => prev.map(item =>
                item.id === entry.artist ? { ...item, status: 'done' } : item
              ));
              setRepatriateLogs(prev => [...prev, `— ${entry.artist}: não encontrado`]);
            }
          }
        } catch (err: any) {
          setRepatriateItems(prev => prev.map(item =>
            batchArtists.includes(item.id) ? { ...item, status: 'error', error: err.message } : item
          ));
          setRepatriateLogs(prev => [...prev, `✗ Erro: ${err.message}`]);
        }

        // Small delay between batches
        if (i + batchSize < uniqueEntries.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setRepatriateLogs(prev => [...prev, 'Repatriação concluída']);
      toast.success('Países atualizados');
      loadReleases();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao buscar países');
    } finally {
      setEnrichingCountries(false);
    }
  }, [releases, updateRelease, loadReleases]);

  const toggleSort = (field: SortField) => {
    setSortRules(prev => {
      const top = prev[0];
      if (top && top.field === field) {
        const flipped: SortRule = { field, dir: top.dir === 'asc' ? 'desc' : 'asc' };
        return [flipped, ...prev.slice(1)];
      }
      const rest = prev.filter(r => r.field !== field);
      return [{ field, dir: 'desc' }, ...rest];
    });
  };

  const openNew = () => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); };
  const openEdit = (r: Release) => {
    setForm({ artist: r.artist, album: r.album, release_date: r.release_date, genres: (r.genres || []).join(', '), rating: r.rating || 3, comments: r.comments || '', country: r.country || '', youtube_url: r.youtube_url || '', spotify_url: r.spotify_url || '', deezer_url: r.deezer_url || '', apple_music_url: r.apple_music_url || '', bandcamp_url: r.bandcamp_url || '', metal_archives_url: r.metal_archives_url || '', shortlist: r.shortlist ?? false });
    setEditingId(r.id); setDialogOpen(true);
  };

  const handleSave = () => {
    const data = {
      artist: form.artist, album: form.album, release_date: form.release_date,
      genres: form.genres.split(',').map(g => g.trim()).filter(Boolean),
      rating: form.rating, comments: form.comments,
      country: form.country || null,
      youtube_url: form.youtube_url || null,
      spotify_url: form.spotify_url || null,
      deezer_url: form.deezer_url || null,
      apple_music_url: form.apple_music_url || null,
      bandcamp_url: form.bandcamp_url || null,
      metal_archives_url: form.metal_archives_url || null,
      shortlist: form.shortlist,
    };
    if (editingId) updateRelease(editingId, data);
    else addRelease(data);
    setDialogOpen(false);
  };

  const handleExport = (format: 'json' | 'csv') => {
    const data = filtered.map(r => ({
      ...r,
      links: resolveAllLinks(r),
      links_markdown: linksToMarkdown(r),
    }));
    let content: string;
    let mime: string;
    let ext: string;
    if (format === 'csv') {
      const header = 'artist,album,release_date,genres,rating,comments,country,youtube,spotify,deezer,apple_music,bandcamp,metal_archives';
      const rows = data.map(r => {
        const l = r.links;
        return [r.artist, r.album, r.release_date, (r.genres || []).join(';'), r.rating || '', r.comments || '', r.country || '', l.youtube, l.spotify, l.deezer, l.apple_music, l.bandcamp, l.metal_archives].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
      });
      content = [header, ...rows].join('\n');
      mime = 'text/csv';
      ext = 'csv';
    } else {
      content = JSON.stringify(data, null, 2);
      mime = 'application/json';
      ext = 'json';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `releases.${ext}`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = useCallback(() => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,.csv';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const text = ev.target?.result as string;
          let data: any[];
          if (file.name.endsWith('.csv')) {
            const lines = text.split('\n').filter(l => l.trim());
            const header = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
            data = lines.slice(1).map(line => {
              const vals = line.match(/("(?:[^"]|"")*"|[^,]*)/g)?.map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"').trim()) || [];
              const obj: any = {};
              header.forEach((h, i) => obj[h] = vals[i] || '');
              if (obj.genres) obj.genres = obj.genres.split(';').map((g: string) => g.trim()).filter(Boolean);
              if (obj.rating) obj.rating = Number(obj.rating);
              return obj;
            });
          } else {
            data = JSON.parse(text);
          }

          let valid = 0, duplicates = 0, invalid = 0;
          const errors: string[] = [];
          const validReleases: Release[] = [];

          data.forEach((item, idx) => {
            if (!item.artist || !item.album || !item.release_date) {
              invalid++; errors.push(`Linha ${idx + 1}: campos obrigatórios faltando`); return;
            }
            const isDupe = releases.some(r =>
              r.artist.toLowerCase() === item.artist.toLowerCase() &&
              r.album.toLowerCase() === item.album.toLowerCase() &&
              r.release_date === item.release_date
            );
            if (isDupe) { duplicates++; return; }
            valid++; validReleases.push(item);
          });

        if (validReleases.length > 0) {
            importReleases(validReleases);
            setTimeout(() => enrichCountries(false), 1500);
          }
          setImportSummary({ valid, duplicates, invalid, errors });
          setImportDialogOpen(true);
        } catch {
          setImportSummary({ valid: 0, duplicates: 0, invalid: 1, errors: ['Arquivo inválido'] });
          setImportDialogOpen(true);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [releases, importReleases, enrichCountries]);

  // Bulk paste handler
  const handleBulkPaste = useCallback(() => {
    if (!pasteText.trim()) return;
    setPasting(true);

    try {
      const currentYear = new Date().getFullYear();
      const parsed = parseStructuredReleases(pasteText, currentYear);

      if (parsed.length === 0) {
        toast.error('Nenhum lançamento encontrado no texto colado');
        setPasting(false);
        return;
      }

      let valid = 0, duplicates = 0, invalid = 0;
      const errors: string[] = [];
      const validReleases: any[] = [];

      parsed.forEach((item, idx) => {
        if (!item.artist || !item.album || !item.release_date) {
          invalid++; errors.push(`Entrada ${idx + 1}: campos obrigatórios faltando`); return;
        }
        const isDupe = releases.some(r =>
          r.artist.toLowerCase() === item.artist.toLowerCase() &&
          r.album.toLowerCase() === item.album.toLowerCase() &&
          r.release_date === item.release_date
        );
        if (isDupe) { duplicates++; return; }
        valid++;
        validReleases.push(item);
      });

      if (validReleases.length > 0) {
        importReleases(validReleases);
        setTimeout(() => enrichCountries(false), 1500);
      }
      setImportSummary({ valid, duplicates, invalid, errors });
      setImportDialogOpen(true);
      setPasteDialogOpen(false);
      setPasteText('');
    } catch {
      toast.error('Erro ao processar dados');
    }

    setPasting(false);
  }, [pasteText, releases, importReleases, enrichCountries]);

  const handleBulkDelete = () => {
    selectedIds.forEach(id => deleteRelease(id));
    setSelectedIds(new Set());
    toast.success(`${selectedIds.size} lançamentos removidos`);
  };

  /**
   * Delete every release belonging to a given artist (case-insensitive match
   * on the exact artist name). Used by the "Excluir banda" UI.
   */
  const handleDeleteBand = useCallback((artist: string) => {
    const target = artist.trim().toLowerCase();
    const ids = releases.filter(r => (r.artist || '').trim().toLowerCase() === target).map(r => r.id);
    if (ids.length === 0) {
      toast.error('Nenhum lançamento encontrado para essa banda');
      return;
    }
    ids.forEach(id => deleteRelease(id));
    // Clear any selection that might reference removed rows
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
    toast.success(`Banda "${artist}" removida (${ids.length} álbum${ids.length > 1 ? 'ns' : ''})`);
  }, [releases, deleteRelease]);

  /**
   * Distinct list of artists currently in the catalog, with how many albums
   * each one has. Sorted alphabetically. Used by the "Gerenciar bandas" modal.
   */
  const bandsList = useMemo(() => {
    const map = new Map<string, { artist: string; count: number; country: string | null }>();
    releases.forEach(r => {
      const key = (r.artist || '').trim().toLowerCase();
      if (!key) return;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { artist: r.artist, count: 1, country: r.country || null });
      }
    });
    const q = bandsSearch.trim().toLowerCase();
    return Array.from(map.values())
      .filter(b => !q || b.artist.toLowerCase().includes(q))
      .sort((a, b) => a.artist.localeCompare(b.artist));
  }, [releases, bandsSearch]);

  const bandToConfirmCount = useMemo(() => {
    if (!deleteBandConfirm) return 0;
    const target = deleteBandConfirm.trim().toLowerCase();
    return releases.filter(r => (r.artist || '').trim().toLowerCase() === target).length;
  }, [deleteBandConfirm, releases]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(prev => {
      const allSelected = filtered.every(r => prev.has(r.id));
      return allSelected ? new Set() : new Set(filtered.map(r => r.id));
    });
  }, [filtered]);

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => {
    const ruleIdx = sortRules.findIndex(r => r.field === field);
    const active = ruleIdx >= 0;
    return (
      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(field)}>
        <span className="flex items-center gap-1">
          {children}
          {active && (
            <span className="inline-flex items-center gap-0.5 text-primary">
              <ArrowUpDown className="h-3 w-3" />
              {sortRules.length > 1 && <span className="text-[9px]">{ruleIdx + 1}</span>}
            </span>
          )}
        </span>
      </TableHead>
    );
  };

  // Group releases by date for card view (always sorted by primary date direction)
  const groupedByDate = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach(r => {
      if (!map.has(r.release_date)) map.set(r.release_date, []);
      map.get(r.release_date)!.push(r);
    });
    const dateRule = sortRules.find(r => r.field === 'release_date');
    const dir: 'asc' | 'desc' = dateRule?.dir ?? 'desc';
    const entries = Array.from(map.entries());
    entries.sort((a, b) => dir === 'desc' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0]));
    return entries;
  }, [filtered, sortRules]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Disc className="h-6 w-6 text-primary" />
            Lançamentos
          </h1>
          <p className="text-muted-foreground mt-1">Hub de lançamentos musicais — {releases.length} registros</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setPasteDialogOpen(true)}>
            <ClipboardPaste className="h-4 w-4" /> Colar Dados
          </Button>
          <Button size="sm" className="gap-2" onClick={openNew}>
            <Plus className="h-4 w-4" /> Novo
          </Button>
        </div>
      </div>

      {/* Quick date filters */}
      <div className="flex gap-1.5 flex-wrap">
        {QUICK_FILTERS.map(f => (
          <Button key={f.key} variant={quickFilter === f.key ? 'default' : 'outline'} size="sm" className="text-xs h-7 px-2" onClick={() => setQuickFilter(f.key)}>
            {f.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar artista, álbum, gênero..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button variant={genreFilter ? 'default' : 'outline'} size="sm" className="gap-2" onClick={() => setGenreDialogOpen(true)}>
          <Filter className="h-4 w-4" /> {genreFilter || 'Gênero'}
        </Button>
        {genreFilter && <Button variant="ghost" size="sm" onClick={() => setGenreFilter(null)}>Limpar</Button>}

        <Button
          variant={shortlistOnly ? 'default' : 'outline'}
          size="sm"
          className="gap-1.5"
          onClick={() => setShortlistOnly(v => !v)}
          title="Mostrar apenas itens da shortlist"
        >
          <Star className={`h-4 w-4 ${shortlistOnly ? 'fill-current' : ''}`} /> Shortlist
        </Button>

        {/* Country filter */}
        <Select value={countryFilter ?? '__all__'} onValueChange={v => setCountryFilter(v === '__all__' ? null : v)}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <Globe className="h-3 w-3 mr-1" /><SelectValue placeholder="País" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os países</SelectItem>
            <SelectItem value="__empty__">Sem país</SelectItem>
            {allCountries.map(c => <SelectItem key={c.code} value={c.code}><span className="inline-flex items-center gap-2">{renderFlag(c.code)}<span>{c.label}</span></span></SelectItem>)}
          </SelectContent>
        </Select>
        {countryFilter && <Button variant="ghost" size="sm" onClick={() => setCountryFilter(null)}>Limpar</Button>}

        {/* Enrich countries */}
        {releases.some(r => !r.country) && (
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => enrichCountries(false)} disabled={enrichingCountries}>
            {enrichingCountries ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
            Repatriar ({releases.filter(r => !r.country).length})
          </Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs" disabled={enrichingCountries}>
              <RefreshCw className="h-3 w-3" /> Repatriar Todos
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Repatriar todos os releases?</AlertDialogTitle>
              <AlertDialogDescription>
                Isso vai buscar o país de origem de todos os {releases.length} releases, sobrescrevendo países já preenchidos. O processo pode demorar alguns minutos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => enrichCountries(true)}>Repatriar Todos</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AutosaveBadge className="mr-1" />
        <SortRulesPopover rules={sortRules} onChange={setSortRules} />
        <GroupRulesPopover rules={groupRules} onChange={setGroupRules} />
        {groupRules.length > 0 && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              title="Expandir todos os grupos"
              onClick={() => setCollapsedGroups(new Set())}
            >
              <ChevronDown className="h-3.5 w-3.5" /> Expandir
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              title="Recolher todos os grupos"
              onClick={() => setCollapsedGroups(new Set(collectAllGroupKeys(groupedTree)))}
            >
              <ChevronRight className="h-3.5 w-3.5" /> Recolher
            </Button>
          </>
        )}
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />

        <Button variant="outline" size="sm" className="gap-2" onClick={handleImport}>
          <Upload className="h-4 w-4" /> Import
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setBandsModalOpen(true)} title="Gerenciar e excluir bandas inteiras">
          <Users className="h-4 w-4" /> Bandas
        </Button>
        <Select defaultValue="json" onValueChange={(v) => handleExport(v as any)}>
          <SelectTrigger className="w-[100px] h-8">
            <Download className="h-4 w-4 mr-1" /><SelectValue placeholder="Export" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="json">JSON</SelectItem>
            <SelectItem value="csv">CSV</SelectItem>
          </SelectContent>
        </Select>
        {selectedIds.size > 0 && (
          <Button variant="destructive" size="sm" className="gap-2" onClick={() => setBulkDeleteConfirmOpen(true)}>
            <Trash2 className="h-4 w-4" /> Excluir ({selectedIds.size})
          </Button>
        )}
      </div>

      {/* Selection bar */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-4">
          <button onClick={selectAllFiltered} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {filtered.every(r => selectedIds.has(r.id)) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
            {filtered.every(r => selectedIds.has(r.id)) ? `Desmarcar todos (${filtered.length})` : `Selecionar todos (${filtered.length})`}
          </button>
          {selectedIds.size > 0 && <span className="text-xs text-muted-foreground">({selectedIds.size} selecionados)</span>}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (() => {
        const COL_COUNT = 8;
        const renderRow = (r: Release) => (
          <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50">
            <TableCell onClick={e => e.stopPropagation()}>
              <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} className="rounded" />
            </TableCell>
            <TableCell className="font-medium" onClick={() => openEdit(r)}><span className="inline-flex items-center gap-2">{renderFlag(r.country)}<span>{r.artist}</span></span></TableCell>
            <TableCell onClick={() => openEdit(r)}>{r.album}</TableCell>
            <TableCell className="text-muted-foreground text-sm" onClick={() => openEdit(r)}>{r.release_date}</TableCell>
            <TableCell className="text-sm" onClick={() => openEdit(r)}>{r.country ? <span className="inline-flex items-center gap-2">{renderFlag(r.country)}<span>{r.country}</span></span> : <span className="text-muted-foreground/40">—</span>}</TableCell>
            <TableCell onClick={() => openEdit(r)}>
              <div className="flex gap-1 flex-wrap">
                {(r.genres || []).slice(0, 3).map(g => <Badge key={g} variant="secondary" className="text-[10px]">{g}</Badge>)}
              </div>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2">
                <a
                  href={resolveAllLinks(r).metal_archives}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir no Metal Archives"
                  className="inline-flex items-center justify-center h-6 px-1.5 rounded border border-border bg-background hover:border-primary hover:text-primary text-[10px] font-mono uppercase tracking-wider text-muted-foreground transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  MA
                </a>
                <button type="button" onClick={() => openEdit(r)} className="flex gap-0.5" title="Editar">
                  {[1,2,3,4,5].map(i => <Star key={i} className={`h-3 w-3 ${i <= (r.rating || 0) ? 'text-primary fill-primary' : 'text-muted-foreground/30'}`} />)}
                </button>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Excluir este álbum"
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(r.id); }}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title={`Excluir TODA a banda "${r.artist}" (todos os álbuns)`}
                  onClick={(e) => { e.stopPropagation(); setDeleteBandConfirm(r.artist); }}>
                  <Users className="h-3.5 w-3.5 text-destructive/80" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        );

        const renderGroup = (node: GroupNode): JSX.Element => {
          const collapsed = collapsedGroups.has(node.key);
          const allSelected = node.itemIds.length > 0 && node.itemIds.every(id => selectedIds.has(id));
          const indent = node.level * 20;
          return (
            <Fragment key={node.key}>
              <TableRow className="bg-muted/40 hover:bg-muted/60 border-y">
                <TableCell colSpan={COL_COUNT} className="py-2">
                  <div className="flex items-center gap-2" style={{ paddingLeft: indent }}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(node.key)}
                      className="text-muted-foreground hover:text-foreground"
                      title={collapsed ? 'Expandir' : 'Recolher'}
                    >
                      {collapsed
                        ? <ChevronRight className="h-4 w-4" />
                        : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleGroupSelection(node.itemIds); }}
                      title={allSelected ? 'Desmarcar grupo' : 'Selecionar grupo'}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {allSelected
                        ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                        : <Square className="h-3.5 w-3.5" />}
                    </button>
                    <span className="text-sm font-medium">{node.label}</span>
                    <span className="text-xs text-muted-foreground">({node.count})</span>
                  </div>
                </TableCell>
              </TableRow>
              {!collapsed && node.children && node.children.map(renderGroup)}
              {!collapsed && node.items && node.items.map(renderRow)}
            </Fragment>
          );
        };

        const isGrouped = groupRules.length > 0;
        const flatLimit = 100;
        const flatVisible = isGrouped ? filtered : filtered.slice(0, flatLimit);

        return (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30px]"></TableHead>
                    <SortHeader field="artist">Artista</SortHeader>
                    <SortHeader field="album">Álbum</SortHeader>
                    <SortHeader field="release_date">Data</SortHeader>
                    <TableHead>País</TableHead>
                    <TableHead>Gêneros</TableHead>
                    <SortHeader field="rating">Rating</SortHeader>
                    <TableHead className="w-[90px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={COL_COUNT} className="h-32 text-center text-muted-foreground">
                        {releases.length === 0 ? 'Nenhum lançamento cadastrado.' : 'Nenhum resultado encontrado.'}
                      </TableCell>
                    </TableRow>
                  ) : isGrouped
                    ? groupedTree.map(renderGroup)
                    : flatVisible.map(renderRow)}
                </TableBody>
              </Table>
              {!isGrouped && filtered.length > flatLimit && (
                <p className="text-xs text-muted-foreground text-center py-3">Mostrando {flatLimit} de {filtered.length} resultados</p>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Card View — Compact horizontal cards */}
      {viewMode === 'cards' && (
        <div className="space-y-6">
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-16">
                <p className="text-muted-foreground">{releases.length === 0 ? 'Nenhum lançamento cadastrado.' : 'Nenhum resultado encontrado.'}</p>
              </CardContent>
            </Card>
          ) : groupedByDate.map(([date, rels]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground tracking-wider uppercase">
                  {new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </span>
                <span className="text-[10px] text-muted-foreground/60">({rels.length})</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {rels.map((r, idx) => {
                  const links = resolveAllLinks(r);
                  return (
                    <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.015 }} whileHover={{ scale: 1.02 }}>
                    <Card className="cursor-pointer hover:border-primary/40 hover:shadow-lg transition-all duration-200 group overflow-hidden" onClick={() => openEdit(r)}>
                      <CardContent className="p-3 flex items-start gap-3">
                        {/* Flag + date column */}
                        <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                          {renderFlag(r.country)}
                          <span className="text-[9px] text-muted-foreground font-mono">{r.release_date.slice(5).replace('-', '.')}</span>
                        </div>

                        {/* Info column */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-sm leading-tight truncate">{r.artist}</h3>
                          <p className="text-xs text-muted-foreground italic truncate">{r.album}</p>
                          
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {(r.genres || []).slice(0, 2).map(g => (
                              <Badge key={g} variant="secondary" className="text-[8px] h-[18px] rounded-full px-1.5">{g}</Badge>
                            ))}
                            {reviewMap.has(r.id) && (
                              <Badge
                                className="text-[8px] h-[18px] rounded-full px-1.5 bg-primary/20 text-primary border-primary/30 cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const info = reviewMap.get(r.id)!;
                                  navigate(`/pautas`);
                                }}
                              >
                                ★ Review {reviewMap.get(r.id)!.reviewer} ({reviewMap.get(r.id)!.pubDate.slice(5)})
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Actions column */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(r.id)}
                            onChange={(e) => { e.stopPropagation(); toggleSelect(r.id); }}
                            className="rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex gap-1 mt-auto">
                            {([
                              { key: 'youtube' as const, label: 'YT', color: 'text-red-400 border-red-400/30' },
                              { key: 'spotify' as const, label: 'SP', color: 'text-emerald-400 border-emerald-400/30' },
                              { key: 'metal_archives' as const, label: 'MA', color: 'text-orange-400 border-orange-400/30' },
                            ]).map(p => (
                              <a
                                key={p.key}
                                href={links[p.key]}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className={`inline-flex items-center text-[8px] border rounded-full px-1 py-0.5 transition-colors hover:bg-muted/50 ${p.color}`}
                              >
                                {p.label}
                              </a>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bulk Paste Dialog */}
      <Dialog open={pasteDialogOpen} onOpenChange={setPasteDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Colar Lançamentos</DialogTitle>
            <DialogDescription>
              Cole dados estruturados no formato MetalStorm. O parser aceita o formato:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="rounded-md bg-muted p-3 text-xs font-mono space-y-0.5 flex-1">
                <p className="text-muted-foreground">DD.MM</p>
                <p>Artista - Álbum</p>
                <p className="text-muted-foreground">[Studio] ou [EP] ou [Live]</p>
                <p className="text-muted-foreground">Gênero 1, Gênero 2</p>
              </div>
              <div className="ml-3">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => window.open('https://metalstorm.net/events/new_releases.php?upcoming=1&invisible=1', '_blank')}>
                  <ExternalLink className="h-3.5 w-3.5" /> Source
                </Button>
              </div>
            </div>
            <Textarea
              placeholder={"04.04\nVintergatA - Зверобой\n[Studio]\nSymphonic black metal\n\n08.04\nAttila - Concrete Throne\n[Studio]\nDeathcore, Melodic metalcore, Nu metal"}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              className="min-h-[200px] font-mono text-sm resize-y"
            />
            <p className="text-xs text-muted-foreground">
              Ano assumido: {new Date().getFullYear()} • Duplicatas serão ignoradas automaticamente
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPasteDialogOpen(false); setPasteText(''); }}>Cancelar</Button>
            <Button onClick={handleBulkPaste} disabled={!pasteText.trim() || pasting} className="gap-2">
              <ClipboardPaste className="h-4 w-4" />
              {pasting ? 'Importando...' : 'Importar Lançamentos'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Genre filter dialog */}
      <Dialog open={genreDialogOpen} onOpenChange={setGenreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filtrar por Gênero</DialogTitle>
            <DialogDescription>Selecione um gênero principal ou específico.</DialogDescription>
          </DialogHeader>
          {/* Main genre quick tags */}
          <div className="flex flex-wrap gap-1.5 pb-2 border-b border-border">
            {NORMALIZED_GENRES.map(ng => {
              const isActive = genreFilter === `~${ng}`;
              return (
                <Button key={ng} size="sm" variant={isActive ? 'default' : 'secondary'} className="text-xs h-7 px-2.5 font-medium"
                  onClick={() => { setGenreFilter(isActive ? null : `~${ng}`); if (!isActive) setGenreDialogOpen(false); }}>
                  {ng}
                </Button>
              );
            })}
          </div>
          <ScrollArea className="h-[250px]">
            <div className="flex flex-wrap gap-2">
              {allGenres.map(g => (
                <Button key={g} size="sm" variant={genreFilter === g ? 'default' : 'outline'} className="text-xs"
                  onClick={() => { setGenreFilter(g); setGenreDialogOpen(false); }}>
                  {g}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Import summary */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resumo da Importação</DialogTitle></DialogHeader>
          {importSummary && (
            <div className="space-y-3">
              <div className="flex gap-4">
                <div className="flex items-center gap-2 text-emerald-400"><CheckCircle className="h-4 w-4" /><span className="text-sm">{importSummary.valid} válidos</span></div>
                <div className="flex items-center gap-2 text-yellow-400"><AlertCircle className="h-4 w-4" /><span className="text-sm">{importSummary.duplicates} duplicados</span></div>
                <div className="flex items-center gap-2 text-destructive"><XCircle className="h-4 w-4" /><span className="text-sm">{importSummary.invalid} inválidos</span></div>
              </div>
              {importSummary.errors.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-1">
                  {importSummary.errors.slice(0, 10).map((err, i) => <p key={i}>{err}</p>)}
                </div>
              )}
            </div>
          )}
          <DialogFooter><Button onClick={() => setImportDialogOpen(false)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Lançamento' : 'Novo Lançamento'}</DialogTitle>
            <DialogDescription>Preencha os dados do lançamento musical.</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="info">
            <TabsList className="w-full">
              <TabsTrigger value="info" className="flex-1">Informações</TabsTrigger>
              <TabsTrigger value="links" className="flex-1 gap-1"><Link2 className="h-3 w-3" /> Links</TabsTrigger>
            </TabsList>
            <TabsContent value="info" className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Artista</Label><Input value={form.artist} onChange={e => setForm(p => ({ ...p, artist: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Álbum</Label><Input value={form.album} onChange={e => setForm(p => ({ ...p, album: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Data de Lançamento</Label><Input type="date" value={form.release_date} onChange={e => setForm(p => ({ ...p, release_date: e.target.value }))} /></div>
                <div className="space-y-1.5">
                  <Label>País de Origem</Label>
                  <div className="flex items-center gap-2">
                    {form.country && renderFlag(form.country, 'h-5 w-6 rounded-[2px] overflow-hidden')}
                    <Input value={form.country} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} placeholder="Ex: United States, Brazil..." className="flex-1" />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5"><Label>Gêneros (separados por vírgula)</Label><Input value={form.genres} onChange={e => setForm(p => ({ ...p, genres: e.target.value }))} placeholder="Death Metal, Black Metal, Thrash" /></div>
              <div className="space-y-1.5">
                <Label>Rating ({form.rating}/5)</Label>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(i => (
                    <button key={i} type="button" onClick={() => setForm(p => ({ ...p, rating: i }))}>
                      <Star className={`h-5 w-5 transition-colors ${i <= form.rating ? 'text-primary fill-primary' : 'text-muted-foreground/30 hover:text-primary/50'}`} />
                    </button>
                  ))}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={form.shortlist ? 'default' : 'outline'}
                  onClick={() => setForm(p => ({ ...p, shortlist: !p.shortlist }))}
                  className="mt-2 gap-1.5"
                >
                  <Star className={`h-3.5 w-3.5 ${form.shortlist ? 'fill-current' : ''}`} />
                  {form.shortlist ? 'Na shortlist' : 'Add to shortlist'}
                </Button>
              </div>
              <div className="space-y-1.5"><Label>Comentários</Label><Textarea value={form.comments} onChange={e => setForm(p => ({ ...p, comments: e.target.value }))} rows={3} /></div>
            </TabsContent>
            <TabsContent value="links" className="space-y-4 pt-2">
              <p className="text-xs text-muted-foreground">Links oficiais (override). Se vazio, será gerado automaticamente a partir de artista + álbum.</p>
              {(Object.entries(PLATFORM_CONFIG) as [keyof PlatformLinks, typeof PLATFORM_CONFIG[keyof PlatformLinks]][]).map(([key, cfg]) => {
                const fieldKey = `${key}_url` as keyof typeof form;
                const dynamicLink = form.artist && form.album ? resolveAllLinks({ artist: form.artist, album: form.album })[key] : '';
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">{cfg.label}</Label>
                      {dynamicLink && !form[fieldKey] && (
                        <a href={dynamicLink} target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" /> Link dinâmico
                        </a>
                      )}
                      {form[fieldKey] && (
                        <Badge variant="secondary" className="text-[9px]">Override</Badge>
                      )}
                    </div>
                    <Input
                      value={String(form[fieldKey] ?? '')}
                      onChange={e => setForm(p => ({ ...p, [fieldKey]: e.target.value }))}
                      placeholder={dynamicLink || `https://...`}
                      className="text-xs h-8"
                    />
                  </div>
                );
              })}
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.artist || !form.album}>{editingId ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Repatriation progress modal */}
      <GenerationProgressModal
        open={repatriateModalOpen}
        onOpenChange={setRepatriateModalOpen}
        title={`Repatriando releases (${repatriateItems.filter(i => i.status === 'done').length}/${repatriateItems.length})`}
        items={repatriateItems}
        logs={repatriateLogs}
      />

      {/* Delete single confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação é irreversível. O release será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
              if (deleteConfirmId) {
                deleteRelease(deleteConfirmId);
                setDeleteConfirmId(null);
                toast.success('Lançamento removido');
              }
            }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} lançamentos?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação é irreversível. Todos os {selectedIds.size} releases selecionados serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
              selectedIds.forEach(id => deleteRelease(id));
              setSelectedIds(new Set());
              setBulkDeleteConfirmOpen(false);
              toast.success(`${selectedIds.size} lançamentos removidos`);
            }}>Excluir Todos</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manage Bands modal — search, count, and delete entire bands */}
      <Dialog open={bandsModalOpen} onOpenChange={setBandsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Gerenciar Bandas
            </DialogTitle>
            <DialogDescription>
              Excluir uma banda remove <strong>todos os álbuns</strong> dela do catálogo. Ação irreversível.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar banda..."
              value={bandsSearch}
              onChange={(e) => setBandsSearch(e.target.value)}
              className="pl-9 h-9"
              autoFocus
            />
          </div>

          <div className="max-h-[420px] overflow-y-auto rounded-md border border-border/60">
            {bandsList.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {releases.length === 0 ? 'Nenhuma banda no catálogo.' : 'Nenhuma banda encontrada para esta busca.'}
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {bandsList.map((b) => (
                  <li key={b.artist} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/30">
                    <div className="min-w-0 flex items-center gap-2">
                      {renderFlag(b.country)}
                      <span className="truncate font-medium text-sm">{b.artist}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {b.count} álbum{b.count > 1 ? 'ns' : ''}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => setDeleteBandConfirm(b.artist)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir banda
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            {bandsList.length} banda{bandsList.length !== 1 ? 's' : ''} encontrada{bandsList.length !== 1 ? 's' : ''}.
          </p>
        </DialogContent>
      </Dialog>

      {/* Delete entire band confirmation */}
      <AlertDialog open={!!deleteBandConfirm} onOpenChange={(open) => !open && setDeleteBandConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir banda "{deleteBandConfirm}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação é irreversível. Todos os <strong>{bandToConfirmCount} álbum{bandToConfirmCount > 1 ? 'ns' : ''}</strong> dessa banda serão removidos permanentemente do catálogo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteBandConfirm) {
                  handleDeleteBand(deleteBandConfirm);
                  setDeleteBandConfirm(null);
                }
              }}
            >
              Excluir banda inteira
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
