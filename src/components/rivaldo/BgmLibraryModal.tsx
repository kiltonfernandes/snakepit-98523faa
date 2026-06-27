import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Upload, Play, Pause, Trash2, Music, X, Loader2, CheckCircle2, FileAudio } from 'lucide-react';
import { listBgm, uploadBgm, deleteBgm, getBgmSignedUrl, downloadBgmAsFile, type BgmTrack } from '@/lib/bgm-library';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** When provided, modal acts as a picker — clicking "Usar" returns the file. */
  onPick?: (file: File, track: BgmTrack) => void;
}

function formatDuration(secs: number | null): string {
  if (!secs || !Number.isFinite(secs)) return '—';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function BgmLibraryModal({ open, onOpenChange, onPick }: Props) {
  const { toast } = useToast();
  const [tracks, setTracks] = useState<BgmTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [activeGenres, setActiveGenres] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BgmTrack | null>(null);
  const [picking, setPicking] = useState(false);

  // Pending upload
  const [pending, setPending] = useState<{ file: File; name: string; genresText: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setTracks(await listBgm()); }
    catch (e: any) { toast({ title: 'Falha ao carregar biblioteca', description: e?.message ?? String(e), variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);
  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  const allGenres = useMemo(() => {
    const set = new Set<string>();
    for (const t of tracks) for (const g of t.genres) if (g) set.add(g);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tracks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tracks.filter(t => {
      if (activeGenres.size > 0 && !t.genres.some(g => activeGenres.has(g))) return false;
      if (!q) return true;
      if (t.name.toLowerCase().includes(q)) return true;
      if (t.genres.some(g => g.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [tracks, query, activeGenres]);

  const selected = useMemo(() => tracks.find(t => t.id === selectedId) ?? null, [tracks, selectedId]);

  const togglePlay = useCallback(async (track: BgmTrack) => {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    try {
      const url = await getBgmSignedUrl(track);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlayingId(p => p === track.id ? null : p);
      await audio.play();
      setPlayingId(track.id);
    } catch (e: any) {
      toast({ title: 'Falha ao tocar', description: e?.message ?? String(e), variant: 'destructive' });
    }
  }, [playingId, toast]);

  const onDropFile = useCallback((file: File) => {
    if (!file.type.includes('audio') && !file.name.toLowerCase().endsWith('.mp3')) {
      toast({ title: 'Arquivo inválido', description: 'Envie um arquivo de áudio (mp3).', variant: 'destructive' });
      return;
    }
    setPending({ file, name: file.name.replace(/\.[^.]+$/, ''), genresText: '' });
  }, [toast]);

  const confirmUpload = useCallback(async () => {
    if (!pending) return;
    setUploading(true);
    try {
      const genres = pending.genresText.split(',').map(g => g.trim()).filter(Boolean);
      const track = await uploadBgm({ file: pending.file, name: pending.name, genres });
      toast({ title: 'BGM adicionado', description: track.name });
      setPending(null);
      await refresh();
      setSelectedId(track.id);
    } catch (e: any) {
      toast({ title: 'Falha no upload', description: e?.message ?? String(e), variant: 'destructive' });
    } finally { setUploading(false); }
  }, [pending, refresh, toast]);

  const doDelete = useCallback(async (track: BgmTrack) => {
    try {
      await deleteBgm(track);
      toast({ title: 'BGM removido' });
      setConfirmDelete(null);
      if (selectedId === track.id) setSelectedId(null);
      await refresh();
    } catch (e: any) {
      toast({ title: 'Falha ao remover', description: e?.message ?? String(e), variant: 'destructive' });
    }
  }, [selectedId, refresh, toast]);

  const pick = useCallback(async () => {
    if (!selected || !onPick) return;
    setPicking(true);
    try {
      const file = await downloadBgmAsFile(selected);
      onPick(file, selected);
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Falha ao carregar BGM', description: e?.message ?? String(e), variant: 'destructive' });
    } finally { setPicking(false); }
  }, [selected, onPick, onOpenChange, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Music className="w-4 h-4 text-primary" /> Biblioteca de BGM
          </DialogTitle>
          <DialogDescription className="text-xs">Envie, organize por gêneros e selecione a trilha do episódio.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] h-[70vh]">
          {/* LEFT: search + list */}
          <div
            className="flex flex-col min-w-0 border-r border-border"
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onDropFile(f); }}
          >
            <div className="px-4 pt-3 pb-2 space-y-2 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    className="h-8 pl-7 text-xs"
                    placeholder="Buscar por nome ou gênero…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                </div>
                <label>
                  <input type="file" accept=".mp3,audio/mpeg,audio/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onDropFile(f); e.currentTarget.value = ''; }} />
                  <Button size="sm" variant="default" asChild>
                    <span className="cursor-pointer"><Upload className="w-3.5 h-3.5 mr-1" /> Upload</span>
                  </Button>
                </label>
              </div>
              {allGenres.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {allGenres.map(g => {
                    const active = activeGenres.has(g);
                    return (
                      <button
                        key={g}
                        onClick={() => setActiveGenres(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; })}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full border transition-colors ${active ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-background text-muted-foreground hover:border-primary/40'}`}
                      >{g}</button>
                    );
                  })}
                  {activeGenres.size > 0 && (
                    <button onClick={() => setActiveGenres(new Set())} className="text-[10px] font-mono px-2 py-0.5 text-muted-foreground hover:text-foreground">limpar</button>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-xs"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando…</div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-3">
                  <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center"><FileAudio className="w-7 h-7 text-muted-foreground" /></div>
                  <div>
                    <p className="text-sm font-medium">{tracks.length === 0 ? 'Sua biblioteca está vazia' : 'Nada encontrado'}</p>
                    <p className="text-xs text-muted-foreground mt-1">{tracks.length === 0 ? 'Arraste um mp3 aqui ou clique em Upload.' : 'Ajuste os filtros ou a busca.'}</p>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map(t => {
                    const isSel = t.id === selectedId;
                    const isPlay = t.id === playingId;
                    return (
                      <li
                        key={t.id}
                        onClick={() => setSelectedId(t.id)}
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${isSel ? 'bg-primary/10' : 'hover:bg-muted/40'}`}
                      >
                        <button onClick={(e) => { e.stopPropagation(); togglePlay(t); }} className="w-8 h-8 rounded-full bg-muted hover:bg-primary/20 flex items-center justify-center shrink-0">
                          {isPlay ? <Pause className="w-3.5 h-3.5 text-primary" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${isSel ? 'font-semibold' : 'font-medium'}`}>{t.name}</p>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {t.genres.slice(0, 4).map(g => <Badge key={g} variant="secondary" className="text-[9px] h-4 rounded-full px-1.5">{g}</Badge>)}
                            {t.genres.length === 0 && <span className="text-[10px] text-muted-foreground/60 italic">sem gêneros</span>}
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">{formatDuration(t.duration_seconds)}</span>
                        {isSel && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* RIGHT: preview / actions */}
          <div className="flex flex-col bg-muted/10">
            {selected ? (
              <div className="p-5 flex flex-col h-full gap-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-mono">Selecionado</p>
                  <h3 className="text-lg font-bold leading-tight mt-1 break-words">{selected.name}</h3>
                </div>
                <div className="flex flex-wrap gap-1">
                  {selected.genres.map(g => <Badge key={g} className="text-[10px]">{g}</Badge>)}
                  {selected.genres.length === 0 && <span className="text-xs text-muted-foreground italic">sem gêneros</span>}
                </div>
                <div className="text-xs text-muted-foreground font-mono">Duração: {formatDuration(selected.duration_seconds)}</div>
                <div className="flex flex-col gap-2 mt-auto">
                  <Button variant="outline" size="sm" onClick={() => togglePlay(selected)}>
                    {playingId === selected.id ? <><Pause className="w-3.5 h-3.5 mr-1" /> Pausar</> : <><Play className="w-3.5 h-3.5 mr-1" /> Preview</>}
                  </Button>
                  {onPick && (
                    <Button onClick={pick} disabled={picking}>
                      {picking ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Carregando…</> : <>Usar este BGM</>}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(selected)} className="text-destructive hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-xs text-muted-foreground px-6">
                <Music className="w-10 h-10 mb-3 opacity-40" />
                Selecione uma faixa para ver detalhes.
              </div>
            )}
          </div>
        </div>

        {/* Pending upload sheet */}
        {pending && (
          <div className="absolute inset-0 bg-background/95 backdrop-blur flex items-center justify-center p-6">
            <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-2"><Upload className="w-4 h-4 text-primary" /> Novo BGM</h4>
                <button onClick={() => setPending(null)} disabled={uploading} className="p-1 rounded hover:bg-muted"><X className="w-3.5 h-3.5" /></button>
              </div>
              <p className="text-[11px] font-mono text-muted-foreground truncate">{pending.file.name} • {(pending.file.size / 1024 / 1024).toFixed(1)} MB</p>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Nome</label>
                <Input value={pending.name} onChange={e => setPending(p => p ? { ...p, name: e.target.value } : p)} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Gêneros (separados por vírgula)</label>
                <Input
                  value={pending.genresText}
                  onChange={e => setPending(p => p ? { ...p, genresText: e.target.value } : p)}
                  placeholder="ex.: heavy metal, doom, melancólico"
                  className="mt-1 h-8 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setPending(null)} disabled={uploading}>Cancelar</Button>
                <Button size="sm" onClick={confirmUpload} disabled={uploading}>
                  {uploading ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Enviando…</> : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        )}

        <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir "{confirmDelete?.name}"?</AlertDialogTitle>
              <AlertDialogDescription>O arquivo será removido permanentemente da biblioteca.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => confirmDelete && doDelete(confirmDelete)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}