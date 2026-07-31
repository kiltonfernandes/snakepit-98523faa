import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RivaldoPreprodEpisode, RivaldoPreprodWeekGroup } from '@/lib/rivaldo-episodes';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (episode: RivaldoPreprodEpisode) => void;
  selectedId: string | null;
  groups: RivaldoPreprodWeekGroup[];
  loading?: boolean;
  error?: string | null;
}

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function EpisodePickerModal({ open, onClose, onSelect, selectedId, groups, loading = false, error = null }: Props) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const filteredGroups = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.searchText.includes(normalizedQuery)),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  const pick = (episode: RivaldoPreprodEpisode) => {
    onSelect(episode);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="text-base">Selecionar episódio</DialogTitle>
          <DialogDescription className="text-xs">Todas as entradas da Pré-produção, agrupadas por semana.</DialogDescription>
        </DialogHeader>

        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome do episódio..."
              className="pl-8 h-9 text-sm"
              autoFocus
            />
          </div>
        </div>

        <ScrollArea className="flex-1 px-5 pb-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando Pré-produção...
            </div>
          ) : error ? (
            <p className="py-10 text-center text-sm text-destructive">{error}</p>
          ) : filteredGroups.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma entrada encontrada.</p>
          ) : (
            <div className="space-y-4">
              {filteredGroups.map((week) => (
                <section key={week.weekId} className="overflow-hidden rounded-md border border-border">
                  <div className="flex items-center justify-between bg-muted/40 px-3 py-2">
                    <h3 className="text-sm font-medium">{week.weekLabel}</h3>
                    <span className="text-xs text-muted-foreground">{week.items.length}</span>
                  </div>
                  <ul className="divide-y divide-border border-t border-border">
                    {week.items.map((item) => (
                      <EpisodeRow key={item.id} item={item} selected={selectedId === item.id} onPick={pick} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="border-t border-border px-5 py-2 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EpisodeRow({ item, selected, onPick }: { item: RivaldoPreprodEpisode; selected: boolean; onPick: (episode: RivaldoPreprodEpisode) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(item)}
        className={cn(
          'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40 transition-colors',
          selected && 'bg-primary/10 text-primary',
        )}
      >
        <span className="min-w-0">
          <span className="block truncate font-mono text-xs">{item.label}</span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {item.date.split('-').reverse().join('/')}
          </span>
        </span>
        {selected && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
      </button>
    </li>
  );
}
