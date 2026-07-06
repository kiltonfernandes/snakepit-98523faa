/**
 * Modal que lista os releases marcados como `shortlist = true`.
 * Permite buscar, abrir no Metal Archives, remover da shortlist e
 * disparar a criação de uma nova pauta (review) pré-preenchida.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Star, Search, ExternalLink, Sparkles, Disc, CheckCircle2 } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { resolveAllLinks } from '@/lib/dynamic-links';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreatePautaFromRelease?: (releaseId: string) => void;
}

export function ShortlistDialog({ open, onClose, onCreatePautaFromRelease }: Props) {
  const { releases, updateRelease } = useApp();
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const [pautaByRelease, setPautaByRelease] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from('preprod_pautas')
        .select('id, release_id')
        .not('release_id', 'is', null);
      if (cancelled || error || !data) return;
      const map: Record<string, string> = {};
      for (const row of data as Array<{ id: string; release_id: string | null }>) {
        if (row.release_id && !map[row.release_id]) map[row.release_id] = row.id;
      }
      setPautaByRelease(map);
    })();
    const channel = supabase
      .channel('shortlist-preprod-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'preprod_pautas' }, () => {
        (supabase as any)
          .from('preprod_pautas')
          .select('id, release_id')
          .not('release_id', 'is', null)
          .then(({ data }: { data: Array<{ id: string; release_id: string | null }> | null }) => {
            if (cancelled || !data) return;
            const map: Record<string, string> = {};
            for (const row of data) {
              if (row.release_id && !map[row.release_id]) map[row.release_id] = row.id;
            }
            setPautaByRelease(map);
          });
      })
      .subscribe();
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [open]);

  const shortlisted = useMemo(() => {
    const term = q.trim().toLowerCase();
    return releases
      .filter(r => r.shortlist)
      .filter(r => !term || `${r.artist} ${r.album} ${(r.genres || []).join(' ')}`.toLowerCase().includes(term))
      .sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''));
  }, [releases, q]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl w-[95vw] h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-4 w-4 fill-current text-primary" /> Shortlist
          </DialogTitle>
          <DialogDescription>
            {shortlisted.length} lançamento{shortlisted.length === 1 ? '' : 's'} marcado{shortlisted.length === 1 ? '' : 's'} para pauta.
          </DialogDescription>
        </DialogHeader>

        <div className="border-b border-border px-6 py-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por artista, álbum ou gênero..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-7 h-9"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="divide-y divide-border">
            {shortlisted.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nenhum lançamento na shortlist. Use o botão ⭐ na aba Lançamentos para adicionar.
              </div>
            ) : shortlisted.map((r) => {
              const links = resolveAllLinks(r);
              const ma = links.metal_archives || r.metal_archives_url;
              const existingPautaId = pautaByRelease[r.id];
              return (
                <div key={r.id} className={`flex items-start gap-3 px-6 py-3 hover:bg-muted/30 ${existingPautaId ? 'border-l-4 border-l-emerald-500 bg-emerald-500/5' : ''}`}>
                  <Disc className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{r.artist} — {r.album}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(r.genres || []).slice(0, 4).map(g => (
                        <Badge key={g} variant="secondary" className="font-normal text-[10px]">{g}</Badge>
                      ))}
                      {r.country && <Badge variant="outline" className="font-normal text-[10px]">{r.country}</Badge>}
                      {typeof r.rating === 'number' && (
                        <span className="text-[10px] text-primary">{'★'.repeat(r.rating)}{'☆'.repeat(Math.max(0, 5 - r.rating))}</span>
                      )}
                      {existingPautaId && (
                        <Badge className="font-semibold text-[10px] bg-emerald-500 text-white hover:bg-emerald-600 border-transparent">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> PAUTA CRIADA
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {ma && (
                      <Button asChild size="icon" variant="ghost" title="Abrir no Metal Archives">
                        <a href={ma} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Remover da shortlist"
                      onClick={() => {
                        updateRelease(r.id, { shortlist: false });
                        toast.success('Removido da shortlist');
                      }}
                    >
                      <Star className="h-3.5 w-3.5 fill-current text-primary" />
                    </Button>
                    {existingPautaId ? (
                      <Button
                        size="sm"
                        className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-400/50"
                        onClick={() => {
                          navigate(`/pre-producao?preprod=${existingPautaId}`);
                          onClose();
                        }}
                        title="Abrir pauta já criada"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Ver pauta
                      </Button>
                    ) : onCreatePautaFromRelease && (
                      <Button
                        size="sm"
                        variant="default"
                        className="gap-1.5"
                        onClick={() => { onCreatePautaFromRelease(r.id); onClose(); }}
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Criar pauta
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}