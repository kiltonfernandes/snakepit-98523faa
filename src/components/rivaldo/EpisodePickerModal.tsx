import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, ChevronRight, Search, FileText, Layers, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EpisodeOption {
  value: string;
  label: string;
  date: string;
  week_id: string;
  materialId: string;
  repositoryUrl?: string | null;
  isStandalone: boolean;
}

export interface EpisodeWeekGroup {
  weekLabel: string;
  weekId: string;
  items: EpisodeOption[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (value: string) => void;
  selected: string;
  /** All groups already computed by Rivaldo. Standalones live in the synthetic '__standalone__' bucket. */
  groups: EpisodeWeekGroup[];
}

const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function monthKey(dateStr: string): { key: string; label: string; sort: string } {
  const d = new Date(`${dateStr}T12:00:00`);
  const y = d.getFullYear();
  const m = d.getMonth();
  return { key: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${MONTH_LABELS[m]} ${y}`, sort: `${y}-${String(m + 1).padStart(2, '0')}` };
}

export function EpisodePickerModal({ open, onClose, onSelect, selected, groups }: Props) {
  const [tab, setTab] = useState<'avulso' | 'serie'>('avulso');
  const [query, setQuery] = useState('');
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set());

  // Avulsos: flat list grouped by month
  const avulsosByMonth = useMemo(() => {
    const items: EpisodeOption[] = [];
    for (const g of groups) {
      for (const it of g.items) if (it.isStandalone) items.push(it);
    }
    const q = query.trim().toLowerCase();
    const filtered = q ? items.filter(i => i.label.toLowerCase().includes(q) || i.value.toLowerCase().includes(q)) : items;
    const map = new Map<string, { label: string; sort: string; items: EpisodeOption[] }>();
    for (const it of filtered) {
      const mk = monthKey(it.date);
      if (!map.has(mk.key)) map.set(mk.key, { label: mk.label, sort: mk.sort, items: [] });
      map.get(mk.key)!.items.push(it);
    }
    const arr = Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
    arr.sort((a, b) => a.sort.localeCompare(b.sort));
    for (const g of arr) g.items.sort((a, b) => a.date.localeCompare(b.date));
    return arr;
  }, [groups, query]);

  // Séries: each editorial week with non-standalone items
  const seriesWeeks = useMemo(() => {
    const series = groups.filter(g => g.weekId !== '__standalone__' && g.items.length > 0);
    const q = query.trim().toLowerCase();
    if (!q) return series;
    return series
      .map(g => ({ ...g, items: g.items.filter(i => i.label.toLowerCase().includes(q) || i.value.toLowerCase().includes(q)) }))
      .filter(g => g.items.length > 0);
  }, [groups, query]);

  const toggleMonth = (k: string) => setOpenMonths(prev => {
    const next = new Set(prev);
    next.has(k) ? next.delete(k) : next.add(k);
    return next;
  });
  const toggleWeek = (k: string) => setOpenWeeks(prev => {
    const next = new Set(prev);
    next.has(k) ? next.delete(k) : next.add(k);
    return next;
  });

  const pick = (value: string) => {
    onSelect(value);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="text-base">Selecionar episódio</DialogTitle>
          <DialogDescription className="text-xs">Escolha uma pauta avulsa ou um episódio de uma série semanal.</DialogDescription>
        </DialogHeader>

        <div className="px-5 pt-3 pb-2 space-y-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'avulso' | 'serie')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="avulso" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Avulso
              </TabsTrigger>
              <TabsTrigger value="serie" className="gap-1.5">
                <Layers className="h-3.5 w-3.5" /> Série (semanal)
              </TabsTrigger>
            </TabsList>
          </Tabs>
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
          {tab === 'avulso' ? (
            avulsosByMonth.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nenhum episódio avulso encontrado.</p>
            ) : (
              <div className="space-y-2">
                {avulsosByMonth.map((m) => {
                  const isOpen = openMonths.has(m.key) || !!query;
                  return (
                    <div key={m.key} className="rounded-md border border-border">
                      <button
                        type="button"
                        onClick={() => toggleMonth(m.key)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-muted/40"
                      >
                        <span className="flex items-center gap-2">
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          {m.label}
                        </span>
                        <span className="text-xs text-muted-foreground">{m.items.length}</span>
                      </button>
                      {isOpen && (
                        <ul className="border-t border-border divide-y divide-border">
                          {m.items.map((it) => (
                            <EpisodeRow key={it.materialId} item={it} selected={selected === it.value} onPick={pick} />
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            seriesWeeks.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma série (semana) encontrada.</p>
            ) : (
              <div className="space-y-2">
                {seriesWeeks.map((w) => {
                  const isOpen = openWeeks.has(w.weekId) || !!query;
                  return (
                    <div key={w.weekId} className="rounded-md border border-border">
                      <button
                        type="button"
                        onClick={() => toggleWeek(w.weekId)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-muted/40"
                      >
                        <span className="flex items-center gap-2">
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          {w.weekLabel}
                        </span>
                        <span className="text-xs text-muted-foreground">{w.items.length} ep.</span>
                      </button>
                      {isOpen && (
                        <ul className="border-t border-border divide-y divide-border">
                          {w.items.map((it) => (
                            <EpisodeRow key={it.materialId} item={it} selected={selected === it.value} onPick={pick} />
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </ScrollArea>

        <div className="border-t border-border px-5 py-2 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EpisodeRow({ item, selected, onPick }: { item: EpisodeOption; selected: boolean; onPick: (v: string) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(item.value)}
        className={cn(
          'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40 transition-colors',
          selected && 'bg-primary/10 text-primary',
        )}
      >
        <span className="truncate font-mono text-xs">{item.label}</span>
        {selected && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
      </button>
    </li>
  );
}