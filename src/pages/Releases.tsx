import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Disc, Plus, Search, Download, Upload, Trash2, Star, Filter, AlertCircle, CheckCircle, XCircle, Calendar, ArrowUpDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApp } from '@/contexts/AppContext';
import { Release } from '@/lib/types';

const emptyForm = { artist: '', album: '', release_date: '', genres: '', rating: 3, comments: '' };

interface ImportSummary { valid: number; duplicates: number; invalid: number; errors: string[]; }

type QuickFilter = 'all' | 'today' | 'this_week' | 'last_week' | 'next_week' | 'this_month' | 'last_month' | 'next_month' | 'this_year' | 'last_year';
type SortField = 'release_date' | 'artist' | 'album' | 'rating';
type SortDir = 'asc' | 'desc';

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
    setForm({ artist: r.artist, album: r.album, release_date: r.release_date, genres: (r.genres || []).join(', '), rating: r.rating || 3, comments: r.comments || '' });
    setEditingId(r.id); setDialogOpen(true);
  };

  const handleSave = () => {
    const data = {
      artist: form.artist, album: form.album, release_date: form.release_date,
      genres: form.genres.split(',').map(g => g.trim()).filter(Boolean),
      rating: form.rating, comments: form.comments,
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

  const handleBulkDelete = () => {
    selectedIds.forEach(id => deleteRelease(id));
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(field)}>
      <span className="flex items-center gap-1">
        {children}
        {sortField === field && <ArrowUpDown className="h-3 w-3" />}
      </span>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Disc className="h-6 w-6 text-primary" />
          Lançamentos
        </h1>
        <p className="text-muted-foreground mt-1">Hub de lançamentos musicais — {releases.length} registros</p>
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
        <Button size="sm" className="gap-2 ml-auto" onClick={openNew}>
          <Plus className="h-4 w-4" /> Novo
        </Button>
      </div>

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
