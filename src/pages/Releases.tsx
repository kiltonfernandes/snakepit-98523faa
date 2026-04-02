import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Disc, Plus, Search, Download, Upload, Trash2, Star, Filter, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useApp } from '@/contexts/AppContext';
import { Release } from '@/lib/types';

const emptyForm = { artist: '', album: '', release_date: '', genres: '', rating: 3, comments: '' };

interface ImportSummary {
  valid: number;
  duplicates: number;
  invalid: number;
  errors: string[];
}

export default function Releases() {
  const { releases, addRelease, updateRelease, deleteRelease, importReleases } = useApp();
  const [search, setSearch] = useState('');
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [genreDialogOpen, setGenreDialogOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Unique genres
  const allGenres = useMemo(() => {
    const set = new Set<string>();
    releases.forEach(r => (r.genres || []).forEach(g => set.add(g)));
    return Array.from(set).sort();
  }, [releases]);

  const filtered = useMemo(() => {
    return releases.filter(r => {
      const q = search.toLowerCase();
      const matchSearch = !q || r.artist.toLowerCase().includes(q) || r.album.toLowerCase().includes(q) || (r.genres || []).some(g => g.toLowerCase().includes(q));
      const matchGenre = !genreFilter || (r.genres || []).includes(genreFilter);
      return matchSearch && matchGenre;
    });
  }, [releases, search, genreFilter]);

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

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(releases, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'releases.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = useCallback(() => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string) as any[];
          let valid = 0, duplicates = 0, invalid = 0;
          const errors: string[] = [];
          const validReleases: Release[] = [];

          data.forEach((item, idx) => {
            if (!item.artist || !item.album || !item.release_date) {
              invalid++;
              errors.push(`Linha ${idx + 1}: campos obrigatórios faltando`);
              return;
            }
            const isDupe = releases.some(r =>
              r.artist.toLowerCase() === item.artist.toLowerCase() &&
              r.album.toLowerCase() === item.album.toLowerCase() &&
              r.release_date === item.release_date
            );
            if (isDupe) {
              duplicates++;
              return;
            }
            valid++;
            validReleases.push(item);
          });

          if (validReleases.length > 0) importReleases(validReleases);
          setImportSummary({ valid, duplicates, invalid, errors });
          setImportDialogOpen(true);
        } catch {
          setImportSummary({ valid: 0, duplicates: 0, invalid: 1, errors: ['Arquivo JSON inválido'] });
          setImportDialogOpen(true);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [releases, importReleases]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Disc className="h-6 w-6 text-primary" />
          Lançamentos
        </h1>
        <p className="text-muted-foreground mt-1">Hub de lançamentos musicais — {releases.length} registros</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar artista, álbum, gênero..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button variant={genreFilter ? 'default' : 'outline'} size="sm" className="gap-2" onClick={() => setGenreDialogOpen(true)}>
          <Filter className="h-4 w-4" />
          {genreFilter || 'Gênero'}
        </Button>
        {genreFilter && (
          <Button variant="ghost" size="sm" onClick={() => setGenreFilter(null)}>Limpar filtro</Button>
        )}
        <Button variant="outline" size="sm" className="gap-2" onClick={handleImport}>
          <Upload className="h-4 w-4" /> Import
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
          <Download className="h-4 w-4" /> Export
        </Button>
        <Button size="sm" className="gap-2 ml-auto" onClick={openNew}>
          <Plus className="h-4 w-4" /> Novo
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artista</TableHead>
                <TableHead>Álbum</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Gêneros</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    {releases.length === 0 ? 'Nenhum lançamento cadastrado.' : 'Nenhum resultado encontrado.'}
                  </TableCell>
                </TableRow>
              ) : filtered.slice(0, 100).map(r => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(r)}>
                  <TableCell className="font-medium">{r.artist}</TableCell>
                  <TableCell>{r.album}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{r.release_date}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {(r.genres || []).slice(0, 3).map(g => <Badge key={g} variant="secondary" className="text-[10px]">{g}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell>
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
                <Button
                  key={g}
                  size="sm"
                  variant={genreFilter === g ? 'default' : 'outline'}
                  className="text-xs"
                  onClick={() => { setGenreFilter(g); setGenreDialogOpen(false); }}
                >
                  {g}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Import summary dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resumo da Importação</DialogTitle>
          </DialogHeader>
          {importSummary && (
            <div className="space-y-3">
              <div className="flex gap-4">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm">{importSummary.valid} válidos</span>
                </div>
                <div className="flex items-center gap-2 text-yellow-400">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">{importSummary.duplicates} duplicados</span>
                </div>
                <div className="flex items-center gap-2 text-destructive">
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm">{importSummary.invalid} inválidos</span>
                </div>
              </div>
              {importSummary.errors.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-1">
                  {importSummary.errors.slice(0, 10).map((err, i) => <p key={i}>{err}</p>)}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setImportDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
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
              <div className="space-y-1.5">
                <Label>Artista</Label>
                <Input value={form.artist} onChange={e => setForm(p => ({ ...p, artist: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Álbum</Label>
                <Input value={form.album} onChange={e => setForm(p => ({ ...p, album: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Data de Lançamento</Label>
              <Input type="date" value={form.release_date} onChange={e => setForm(p => ({ ...p, release_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Gêneros (separados por vírgula)</Label>
              <Input value={form.genres} onChange={e => setForm(p => ({ ...p, genres: e.target.value }))} placeholder="Death Metal, Black Metal, Thrash" />
            </div>
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
            <div className="space-y-1.5">
              <Label>Comentários</Label>
              <Textarea value={form.comments} onChange={e => setForm(p => ({ ...p, comments: e.target.value }))} rows={3} />
            </div>
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
