import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Disc, Plus, Search, Filter, Download, Upload, Trash2, Edit, Star, X } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApp } from '@/contexts/AppContext';
import { Release, ReleaseStatus } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';

const emptyForm = { artist: '', album: '', releaseDate: '', genres: '', rating: 3, comments: '', status: 'pending' as ReleaseStatus };

export default function Releases() {
  const { releases, addRelease, updateRelease, deleteRelease, importReleases } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const filtered = useMemo(() => {
    return releases.filter(r => {
      const q = search.toLowerCase();
      const matchSearch = !q || r.artist.toLowerCase().includes(q) || r.album.toLowerCase().includes(q) || r.genres.some(g => g.toLowerCase().includes(q));
      const matchStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [releases, search, statusFilter]);

  const openNew = () => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); };
  const openEdit = (r: Release) => {
    setForm({ artist: r.artist, album: r.album, releaseDate: r.releaseDate, genres: r.genres.join(', '), rating: r.rating, comments: r.comments, status: r.status });
    setEditingId(r.id); setDialogOpen(true);
  };

  const handleSave = () => {
    const data = { artist: form.artist, album: form.album, releaseDate: form.releaseDate, genres: form.genres.split(',').map(g => g.trim()).filter(Boolean), rating: form.rating, comments: form.comments, status: form.status };
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

  const handleImport = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try { importReleases(JSON.parse(ev.target?.result as string)); } catch { /* ignore */ }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Disc className="h-6 w-6 text-primary" />
          Lançamentos
        </h1>
        <p className="text-muted-foreground mt-1">Hub de lançamentos musicais para pauta</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar artista, álbum, gênero..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="reviewed">Revisado</SelectItem>
            <SelectItem value="used">Usado</SelectItem>
            <SelectItem value="archived">Arquivado</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="gap-2" onClick={handleImport}>
          <Upload className="h-4 w-4" /> Import
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
          <Download className="h-4 w-4" /> Export
        </Button>
        <Button size="sm" className="gap-2 ml-auto" onClick={openNew}>
          <Plus className="h-4 w-4" /> Novo Lançamento
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
                <TableHead>Status</TableHead>
                <TableHead className="w-[80px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    {releases.length === 0 ? 'Nenhum lançamento cadastrado. Clique em "Novo Lançamento" para começar.' : 'Nenhum resultado encontrado.'}
                  </TableCell>
                </TableRow>
              ) : filtered.map(r => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(r)}>
                  <TableCell className="font-medium">{r.artist}</TableCell>
                  <TableCell>{r.album}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{r.releaseDate}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {r.genres.slice(0, 3).map(g => <Badge key={g} variant="secondary" className="text-[10px]">{g}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(i => <Star key={i} className={`h-3 w-3 ${i <= r.rating ? 'text-primary fill-primary' : 'text-muted-foreground/30'}`} />)}
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); deleteRelease(r.id); }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data de Lançamento</Label>
                <Input type="date" value={form.releaseDate} onChange={e => setForm(p => ({ ...p, releaseDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v as ReleaseStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="reviewed">Revisado</SelectItem>
                    <SelectItem value="used">Usado</SelectItem>
                    <SelectItem value="archived">Arquivado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
