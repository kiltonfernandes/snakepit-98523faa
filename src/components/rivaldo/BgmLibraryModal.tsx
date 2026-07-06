import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Upload, Play, Pause, Trash2, Music, X, Loader2, CheckCircle2, FileAudio, Pencil, Check } from 'lucide-react';
import { listBgm, uploadBgm, deleteBgm, updateBgm, getBgmSignedUrl, downloadBgmAsFile, type BgmTrack } from '@/lib/bgm-library';
import { useToast } from '@/hooks/use-toast';
import { useApp } from '@/contexts/AppContext';

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
  const { releases } = useApp();
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
  const [pending, setPending] = useState<Array<{ file: File; name: string; genresText: string }> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; genresText: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

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
      if (activeGenres.size > 0) {
        const tokens = Array.from(activeGenres).map(s => s.toLowerCase());
        const hit = tokens.some(tok => t.genres.some(g => g.toLowerCase().includes(tok)));
        if (!hit) return false;
      }
      if (!q) return true;
      if (t.name.toLowerCase().includes(q)) return true;
      if (t.genres.some(g => g.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [tracks, query, activeGenres]);

  const selected = useMemo(() => tracks.find(t => t.id === selectedId) ?? null, [tracks, selectedId]);

  const relatedReleases = useMemo(() => {
    if (!selected || selected.genres.length === 0) return [];
    const splitTokens = (s: string) => s.split(/[\/,&]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
    const wanted = new Set<string>();
    for (const g of selected.genres) for (const tok of splitTokens(g)) wanted.add(tok);
    if (wanted.size === 0) return [];
    const wantedArr = Array.from(wanted);
    const scored: Array<{ r: any; score: number; approx?: boolean }> = [];
    for (const r of releases) {
      const gs = (r.genres || []) as string[];
      if (!gs.length) continue;
      let score = 0;
      for (const g of gs) {
        const toks = splitTokens(g);
        for (const t of toks) if (wanted.has(t)) score++;
      }
      if (score > 0) scored.push({ r, score });
    }
    scored.sort((a, b) => b.score - a.score);
    if (scored.length >= 5) return scored.slice(0, 5).map(s => ({ ...s.r, _approx: false }));

    // Fallback: partial/substring matches between wanted tokens and release genre tokens.
    const exactIds = new Set(scored.map(s => s.r.id));
    const approx: Array<{ r: any; score: number }> = [];
    for (const r of releases) {
      if (exactIds.has(r.id)) continue;
      const gs = (r.genres || []) as string[];
      if (!gs.length) continue;
      let score = 0;
      for (const g of gs) {
        for (const t of splitTokens(g)) {
          for (const w of wantedArr) {
            if (t === w) continue;
            if (t.includes(w) || w.includes(t)) { score++; break; }
          }
        }
      }
      if (score > 0) approx.push({ r, score });
    }
    approx.sort((a, b) => b.score - a.score);
    const out = [
      ...scored.map(s => ({ ...s.r, _approx: false })),
      ...approx.map(s => ({ ...s.r, _approx: true })),
    ];
    return out.slice(0, 5);
  }, [selected, releases]);

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

  const onDropFiles = useCallback((files: File[] | FileList) => {
    const arr = Array.from(files).filter(f => f.type.includes('audio') || f.name.toLowerCase().endsWith('.mp3'));
    if (arr.length === 0) {
      toast({ title: 'Nenhum arquivo de áudio', description: 'Envie arquivos .mp3 ou de áudio.', variant: 'destructive' });
      return;
    }
    setPending(prev => {
      const next = arr.map(file => ({ file, name: file.name.replace(/\.[^.]+$/, ''), genresText: '' }));
      return prev ? [...prev, ...next] : next;
    });
  }, [toast]);

  const confirmUpload = useCallback(async () => {
    if (!pending || pending.length === 0) return;
    setUploading(true);
    setUploadProgress({ done: 0, total: pending.length });
    let lastId: string | null = null;
    let okCount = 0;
    const errors: string[] = [];
    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      try {
        const genres = item.genresText.split(',').map(g => g.trim()).filter(Boolean);
        const track = await uploadBgm({ file: item.file, name: item.name, genres });
        lastId = track.id;
        okCount++;
      } catch (e: any) {
        errors.push(`${item.name}: ${e?.message ?? String(e)}`);
      }
      setUploadProgress({ done: i + 1, total: pending.length });
    }
    setUploading(false);
    setUploadProgress(null);
    setPending(null);
    await refresh();
    if (lastId) setSelectedId(lastId);
    if (errors.length === 0) toast({ title: `${okCount} BGM(s) adicionado(s)` });
    else toast({ title: `${okCount} ok, ${errors.length} falharam`, description: errors.join(' • ').slice(0, 300), variant: 'destructive' });
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

  const startEdit = useCallback((t: BgmTrack) => {
    setEditing({ id: t.id, name: t.name, genresText: t.genres.join(', ') });
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const genres = editing.genresText.split(',').map(g => g.trim()).filter(Boolean);
      await updateBgm(editing.id, { name: editing.name.trim(), genres });
      toast({ title: 'BGM atualizado' });
      setEditing(null);
      await refresh();
    } catch (e: any) {
      toast({ title: 'Falha ao salvar', description: e?.message ?? String(e), variant: 'destructive' });
    } finally { setSavingEdit(false); }
  }, [editing, refresh, toast]);

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
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) onDropFiles(e.dataTransfer.files); }}
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
                  <input type="file" multiple accept=".mp3,audio/mpeg,audio/*" className="hidden" onChange={e => { if (e.target.files?.length) onDropFiles(e.target.files); e.currentTarget.value = ''; }} />
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
                        className={`group flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${isSel ? 'bg-primary/10' : 'hover:bg-muted/40'}`}
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
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); startEdit(t); }} title="Editar" className="p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(t); }} title="Excluir" className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                        {isSel && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* RIGHT: preview / actions */}
          <div className="flex flex-col bg-muted/10 min-h-0">
            {selected ? (
              <div className="flex flex-col h-full min-h-0">
                <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-mono">Selecionado</p>
                  <h3 className="text-lg font-bold leading-tight mt-1 break-words">{selected.name}</h3>
                </div>
                <div className="flex flex-wrap gap-1">
                  {selected.genres.map(g => <Badge key={g} className="text-[10px]">{g}</Badge>)}
                  {selected.genres.length === 0 && <span className="text-xs text-muted-foreground italic">sem gêneros</span>}
                </div>
                <div className="text-xs text-muted-foreground font-mono">Duração: {formatDuration(selected.duration_seconds)}</div>
                <div className="border-t border-border pt-3">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-2">Use este BGM para os lançamentos</p>
                  {relatedReleases.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground/70 italic">Nenhum lançamento com gêneros compatíveis.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {relatedReleases.map((r: any) => (
                        <li key={r.id} className={`rounded-md border px-2 py-1.5 ${r._approx ? 'border-dashed border-border/60 bg-background/20' : 'border-border bg-background/40'}`}>
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-medium truncate flex-1">{r.artist}</p>
                            {r._approx && <span className="text-[8px] uppercase tracking-wider font-mono text-muted-foreground/70 shrink-0">~aprox</span>}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">{r.album}</p>
                          {(r.genres || []).length > 0 && (
                            <p className="text-[9px] text-muted-foreground/70 font-mono truncate mt-0.5">{(r.genres || []).slice(0, 2).join(' • ')}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                </div>
                <div className="flex flex-col gap-2 p-5 pt-3 border-t border-border bg-muted/20 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => togglePlay(selected)}>
                    {playingId === selected.id ? <><Pause className="w-3.5 h-3.5 mr-1" /> Pausar</> : <><Play className="w-3.5 h-3.5 mr-1" /> Preview</>}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => startEdit(selected)}>
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
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

        {/* Pending upload sheet (multi) */}
        {pending && pending.length > 0 && (
          <div className="absolute inset-0 bg-background/95 backdrop-blur flex items-center justify-center p-6">
            <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-xl space-y-3 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" /> {pending.length} arquivo(s) para enviar
                </h4>
                <button onClick={() => !uploading && setPending(null)} disabled={uploading} className="p-1 rounded hover:bg-muted"><X className="w-3.5 h-3.5" /></button>
              </div>
              <label className="text-[11px] text-muted-foreground cursor-pointer inline-flex items-center gap-1 hover:text-foreground self-start">
                <input type="file" multiple accept=".mp3,audio/mpeg,audio/*" className="hidden" onChange={e => { if (e.target.files?.length) onDropFiles(e.target.files); e.currentTarget.value = ''; }} />
                <Upload className="w-3 h-3" /> adicionar mais
              </label>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {pending.map((item, idx) => (
                  <div key={idx} className="rounded-md border border-border bg-background/40 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[11px] font-mono text-muted-foreground truncate flex-1">{item.file.name} • {(item.file.size / 1024 / 1024).toFixed(1)} MB</p>
                      <button disabled={uploading} onClick={() => setPending(p => p ? p.filter((_, i) => i !== idx) : p)} className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive shrink-0"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input value={item.name} disabled={uploading} onChange={e => setPending(p => p ? p.map((x, i) => i === idx ? { ...x, name: e.target.value } : x) : p)} placeholder="Nome" className="h-8 text-sm" />
                      <Input value={item.genresText} disabled={uploading} onChange={e => setPending(p => p ? p.map((x, i) => i === idx ? { ...x, genresText: e.target.value } : x) : p)} placeholder="Gêneros (vírgula)" className="h-8 text-sm" />
                    </div>
                  </div>
                ))}
              </div>
              {uploadProgress && (
                <p className="text-[11px] font-mono text-muted-foreground text-center">Enviando {uploadProgress.done}/{uploadProgress.total}…</p>
              )}
              <div className="flex justify-end gap-2 pt-1 border-t border-border">
                <Button variant="ghost" size="sm" onClick={() => setPending(null)} disabled={uploading}>Cancelar</Button>
                <Button size="sm" onClick={confirmUpload} disabled={uploading}>
                  {uploading ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Enviando…</> : `Enviar ${pending.length}`}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Edit sheet */}
        {editing && (
          <div className="absolute inset-0 bg-background/95 backdrop-blur flex items-center justify-center p-6">
            <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-2"><Pencil className="w-4 h-4 text-primary" /> Editar BGM</h4>
                <button onClick={() => setEditing(null)} disabled={savingEdit} className="p-1 rounded hover:bg-muted"><X className="w-3.5 h-3.5" /></button>
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Nome</label>
                <Input value={editing.name} onChange={e => setEditing(p => p ? { ...p, name: e.target.value } : p)} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Gêneros (separados por vírgula)</label>
                <Input value={editing.genresText} onChange={e => setEditing(p => p ? { ...p, genresText: e.target.value } : p)} placeholder="ex.: heavy metal, doom" className="mt-1 h-8 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={savingEdit}>Cancelar</Button>
                <Button size="sm" onClick={saveEdit} disabled={savingEdit}>
                  {savingEdit ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Salvando…</> : <><Check className="w-3.5 h-3.5 mr-1" /> Salvar</>}
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