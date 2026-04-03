import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Disc, Plus, Search, Download, Upload, Trash2, Star, Filter, AlertCircle, CheckCircle, XCircle, ArrowUpDown, ClipboardPaste, LayoutGrid, TableIcon, FileText, Square, CheckSquare, ExternalLink, Link2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApp } from '@/contexts/AppContext';
import { Release } from '@/lib/types';
import { resolveAllLinks, linksToMarkdown, PLATFORM_CONFIG, type PlatformLinks } from '@/lib/dynamic-links';
import { toast } from 'sonner';

const emptyForm = { artist: '', album: '', release_date: '', genres: '', rating: 3, comments: '', youtube_url: '', spotify_url: '', deezer_url: '', apple_music_url: '', bandcamp_url: '', metal_archives_url: '' };

interface ImportSummary { valid: number; duplicates: number; invalid: number; errors: string[]; }

type QuickFilter = 'all' | 'today' | 'this_week' | 'last_week' | 'next_week' | 'this_month' | 'last_month' | 'next_month' | 'this_year' | 'last_year';
type SortField = 'release_date' | 'artist' | 'album' | 'rating';
type SortDir = 'asc' | 'desc';
type ViewMode = 'table' | 'cards';

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

/**
 * Parse structured release data in the format:
 * DD.MM
 * Artist - Album
 * [Studio] or [EP] or [Live]
 * Genre1, Genre2
 *
 * Assumes current year if not specified.
 */
function parseStructuredReleases(text: string, currentYear: number): { artist: string; album: string; release_date: string; genres: string[]; rating: number | null; comments: string | null }[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results: { artist: string; album: string; release_date: string; genres: string[]; rating: number | null; comments: string | null }[] = [];

  let currentDate = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Check if this is a date line (DD.MM format)
    const dateMatch = line.match(/^(\d{2})\.(\d{2})$/);
    if (dateMatch) {
      const day = dateMatch[1];
      const month = dateMatch[2];
      currentDate = `${currentYear}-${month}-${day}`;
      i++;
      continue;
    }

    // Skip month headers like "March 2026" or empty separators
    if (/^[A-Za-z]+ \d{4}$/.test(line) || /^---/.test(line) || /^\[/.test(line)) {
      // If it starts with [ it could be a type line without a preceding artist — skip
      if (/^\[/.test(line) && results.length > 0) {
        // This is a type indicator for a previous entry — attach the type info as comment
        i++;
        continue;
      }
      i++;
      continue;
    }

    // Check if this line is an artist - album line
    const artistAlbumMatch = line.match(/^(.+?)\s*-\s+(.+)$/);
    if (artistAlbumMatch && currentDate) {
      const artist = artistAlbumMatch[1].trim();
      const album = artistAlbumMatch[2].trim();

      // Look ahead for [Type] and genres
      let releaseType = '';
      const genres: string[] = [];

      // Next line might be [Studio], [EP], [Live]
      if (i + 1 < lines.length && /^\[/.test(lines[i + 1])) {
        const typeMatch = lines[i + 1].match(/^\[(.*?)\]$/);
        if (typeMatch) {
          releaseType = typeMatch[1];
          i++;
        }
      }

      // Next line might be genres (comma-separated, no brackets, no date)
      if (i + 1 < lines.length && !lines[i + 1].match(/^\d{2}\.\d{2}$/) && !lines[i + 1].match(/^.+?\s*-\s+.+$/) && !lines[i + 1].match(/^\[/)) {
        const genreLine = lines[i + 1];
        // Split by comma and filter out empty
        genreLine.split(',').forEach(g => {
          const trimmed = g.trim();
          if (trimmed) genres.push(trimmed);
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
  const { releases, addRelease, updateRelease, deleteRelease, importReleases } = useApp();
  const [search, setSearch] = useState('');
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [genreDialogOpen, setGenreDialogOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>('release_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Bulk paste state
  const [pasteText, setPasteText] = useState('');
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [pasting, setPasting] = useState(false);

  const allGenres = useMemo(() => {
    const set = new Set<string>();
    releases.forEach(r => (r.genres || []).forEach(g => set.add(g)));
    return Array.from(set).sort();
  }, [releases]);

  const filtered = useMemo(() => {
    const dateRange = getDateRange(quickFilter);
    let result = releases.filter(r => {
      const q = search.toLowerCase();
      const matchSearch = !q || r.artist.toLowerCase().includes(q) || r.album.toLowerCase().includes(q) || (r.genres || []).some(g => g.toLowerCase().includes(q));
      const matchGenre = !genreFilter || (r.genres || []).includes(genreFilter);
      let matchDate = true;
      if (dateRange) {
        matchDate = r.release_date >= dateRange[0] && r.release_date <= dateRange[1];
      }
      return matchSearch && matchGenre && matchDate;
    });
    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'release_date') cmp = a.release_date.localeCompare(b.release_date);
      else if (sortField === 'artist') cmp = a.artist.localeCompare(b.artist);
      else if (sortField === 'album') cmp = a.album.localeCompare(b.album);
      else if (sortField === 'rating') cmp = (a.rating || 0) - (b.rating || 0);
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [releases, search, genreFilter, quickFilter, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const openNew = () => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); };
  const openEdit = (r: Release) => {
    setForm({ artist: r.artist, album: r.album, release_date: r.release_date, genres: (r.genres || []).join(', '), rating: r.rating || 3, comments: r.comments || '', youtube_url: r.youtube_url || '', spotify_url: r.spotify_url || '', deezer_url: r.deezer_url || '', apple_music_url: r.apple_music_url || '', bandcamp_url: r.bandcamp_url || '', metal_archives_url: r.metal_archives_url || '' });
    setEditingId(r.id); setDialogOpen(true);
  };

  const handleSave = () => {
    const data = {
      artist: form.artist, album: form.album, release_date: form.release_date,
      genres: form.genres.split(',').map(g => g.trim()).filter(Boolean),
      rating: form.rating, comments: form.comments,
      youtube_url: form.youtube_url || null,
      spotify_url: form.spotify_url || null,
      deezer_url: form.deezer_url || null,
      apple_music_url: form.apple_music_url || null,
      bandcamp_url: form.bandcamp_url || null,
      metal_archives_url: form.metal_archives_url || null,
    };
    if (editingId) updateRelease(editingId, data);
    else addRelease(data);
    setDialogOpen(false);
  };

  const handleExport = (format: 'json' | 'csv') => {
    const data = filtered;
    let content: string;
    let mime: string;
    let ext: string;
    if (format === 'csv') {
      const header = 'artist,album,release_date,genres,rating,comments';
      const rows = data.map(r => [r.artist, r.album, r.release_date, (r.genres || []).join(';'), r.rating || '', r.comments || ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
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

          if (validReleases.length > 0) importReleases(validReleases);
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
  }, [releases, importReleases]);

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

      if (validReleases.length > 0) importReleases(validReleases);
      setImportSummary({ valid, duplicates, invalid, errors });
      setImportDialogOpen(true);
      setPasteDialogOpen(false);
      setPasteText('');
    } catch {
      toast.error('Erro ao processar dados');
    }

    setPasting(false);
  }, [pasteText, releases, importReleases]);

  const handleBulkDelete = () => {
    selectedIds.forEach(id => deleteRelease(id));
    setSelectedIds(new Set());
    toast.success(`${selectedIds.size} lançamentos removidos`);
  };

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

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(field)}>
      <span className="flex items-center gap-1">
        {children}
        {sortField === field && <ArrowUpDown className="h-3 w-3" />}
      </span>
    </TableHead>
  );

  // Group releases by date for card view
  const groupedByDate = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach(r => {
      if (!map.has(r.release_date)) map.set(r.release_date, []);
      map.get(r.release_date)!.push(r);
    });
    const entries = Array.from(map.entries());
    entries.sort((a, b) => sortDir === 'desc' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0]));
    return entries;
  }, [filtered, sortDir]);

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
        {genreFilter && <Button variant="ghost" size="sm" onClick={() => setGenreFilter(null)}>Limpar filtro</Button>}

        {/* View mode toggle */}
        <div className="flex items-center rounded-md border border-border overflow-hidden">
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 transition-colors ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
            title="Tabela"
          >
            <TableIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('cards')}
            className={`p-1.5 transition-colors ${viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
            title="Cards"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>

        <Button variant="outline" size="sm" className="gap-2" onClick={handleImport}>
          <Upload className="h-4 w-4" /> Import
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
          <Button variant="destructive" size="sm" className="gap-2" onClick={handleBulkDelete}>
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
      {viewMode === 'table' && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30px]"></TableHead>
                  <SortHeader field="artist">Artista</SortHeader>
                  <SortHeader field="album">Álbum</SortHeader>
                  <SortHeader field="release_date">Data</SortHeader>
                  <TableHead>Gêneros</TableHead>
                  <SortHeader field="rating">Rating</SortHeader>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      {releases.length === 0 ? 'Nenhum lançamento cadastrado.' : 'Nenhum resultado encontrado.'}
                    </TableCell>
                  </TableRow>
                ) : filtered.slice(0, 100).map(r => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} className="rounded" />
                    </TableCell>
                    <TableCell className="font-medium" onClick={() => openEdit(r)}>{r.artist}</TableCell>
                    <TableCell onClick={() => openEdit(r)}>{r.album}</TableCell>
                    <TableCell className="text-muted-foreground text-sm" onClick={() => openEdit(r)}>{r.release_date}</TableCell>
                    <TableCell onClick={() => openEdit(r)}>
                      <div className="flex gap-1 flex-wrap">
                        {(r.genres || []).slice(0, 3).map(g => <Badge key={g} variant="secondary" className="text-[10px]">{g}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell onClick={() => openEdit(r)}>
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map(i => <Star key={i} className={`h-3 w-3 ${i <= (r.rating || 0) ? 'text-primary fill-primary' : 'text-muted-foreground/30'}`} />)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); deleteRelease(r.id); }}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length > 100 && (
              <p className="text-xs text-muted-foreground text-center py-3">Mostrando 100 de {filtered.length} resultados</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Card View */}
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
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {rels.map(r => (
                  <Card key={r.id} className="cursor-pointer hover:border-primary/30 transition-colors group" onClick={() => openEdit(r)}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{r.artist}</p>
                          <p className="text-xs text-muted-foreground truncate">{r.album}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(r.id)}
                            onChange={(e) => { e.stopPropagation(); toggleSelect(r.id); }}
                            className="rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); deleteRelease(r.id); }}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {(r.genres || []).slice(0, 3).map(g => <Badge key={g} variant="secondary" className="text-[10px]">{g}</Badge>)}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-0.5">
                          {[1,2,3,4,5].map(i => <Star key={i} className={`h-3 w-3 ${i <= (r.rating || 0) ? 'text-primary fill-primary' : 'text-muted-foreground/30'}`} />)}
                        </div>
                        {r.comments && <Badge variant="outline" className="text-[9px]">{r.comments}</Badge>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
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
            <div className="rounded-md bg-muted p-3 text-xs font-mono space-y-0.5">
              <p className="text-muted-foreground">DD.MM</p>
              <p>Artista - Álbum</p>
              <p className="text-muted-foreground">[Studio] ou [EP] ou [Live]</p>
              <p className="text-muted-foreground">Gênero 1, Gênero 2</p>
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
            <DialogDescription>Selecione um gênero para filtrar os lançamentos.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[300px]">
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

      {/* Edit/Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Lançamento' : 'Novo Lançamento'}</DialogTitle>
            <DialogDescription>Preencha os dados do lançamento musical.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Artista</Label><Input value={form.artist} onChange={e => setForm(p => ({ ...p, artist: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Álbum</Label><Input value={form.album} onChange={e => setForm(p => ({ ...p, album: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Data de Lançamento</Label><Input type="date" value={form.release_date} onChange={e => setForm(p => ({ ...p, release_date: e.target.value }))} /></div>
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
            </div>
            <div className="space-y-1.5"><Label>Comentários</Label><Textarea value={form.comments} onChange={e => setForm(p => ({ ...p, comments: e.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.artist || !form.album}>{editingId ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
