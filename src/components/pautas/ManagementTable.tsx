import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Check, Circle, ExternalLink } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { Pauta, EpisodeMaterial, DaySlot } from '@/lib/types';
import { getSectionsForDay } from '@/lib/constants';
import { cn } from '@/lib/utils';

const DAY_LABEL: Record<DaySlot, string> = {
  monday: 'Seg', tuesday: 'Ter', wednesday: 'Qua', thursday: 'Qui',
  friday: 'Sex', saturday: 'Sáb', sunday: 'Dom',
};
const SLOT_ORDER: DaySlot[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function isMaterialSaved(m: EpisodeMaterial | undefined): boolean {
  if (!m) return false;
  return !!(m.repository_url || m.repository_file_id);
}

interface Props {
  pautas: Pauta[];
  materials: EpisodeMaterial[];
  getPautaSlot: (p: Pauta) => DaySlot;
  updateMaterial: (id: string, m: Partial<EpisodeMaterial>) => void;
  computeStatus: (pauta: Pauta, mat: EpisodeMaterial | undefined) => Pauta['status'];
}

/**
 * Tabular Management view: per-day progress at a glance with inline editing
 * for spotify/repository links.
 */
export function ManagementTable({ pautas, materials, getPautaSlot, updateMaterial, computeStatus }: Props) {
  const rows = useMemo(() => {
    return SLOT_ORDER
      .map(slot => {
        const pauta = pautas.find(p => getPautaSlot(p) === slot);
        if (!pauta) return null;
        const mat = materials.find(m => m.slot_key === slot);
        return { slot, pauta, mat };
      })
      .filter((r): r is { slot: DaySlot; pauta: Pauta; mat: EpisodeMaterial | undefined } => !!r);
  }, [pautas, materials, getPautaSlot]);

  return (
    <div className="rounded-md border border-border bg-card overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/40 sticky top-0">
          <TableRow>
            <TableHead className="w-[60px]">Dia</TableHead>
            <TableHead className="w-[110px]">Status</TableHead>
            <TableHead className="w-[180px]">Progresso</TableHead>
            <TableHead>Indicadores</TableHead>
            <TableHead className="w-[260px]">Spotify</TableHead>
            <TableHead className="w-[220px]">Repositório</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ slot, pauta, mat }) => {
            const sections = getSectionsForDay(slot);
            const data = (pauta.sections_json || {}) as Record<string, string>;
            const allSectionsFilled = sections.every(s => data[s.key]?.trim());
            const indicators = {
              pauta: allSectionsFilled,
              title: mat?.selected_title_index != null,
              description: !!mat?.description_html,
              cover: !!(mat?.cover_url || mat?.cover_source_url || mat?.cover_saved_at),
              saved: isMaterialSaved(mat),
              scheduling: !!mat?.spotify_link,
            };
            const done = Object.values(indicators).filter(Boolean).length;
            const total = 6;
            const pct = Math.round((done / total) * 100);
            return (
              <TableRow key={pauta.id} className="align-middle">
                <TableCell className="font-medium text-xs">
                  <div className="flex flex-col">
                    <span>{DAY_LABEL[slot]}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(pauta.publication_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={computeStatus(pauta, mat)} />
                </TableCell>
                <TableCell>
                  <div className="space-y-1.5 w-[160px]">
                    <div className="flex items-center justify-between text-[10px]">
                      <span>{done}/{total}</span>
                      <span className={cn('h-2 w-2 rounded-full', done === total ? 'bg-emerald-500' : done >= 3 ? 'bg-yellow-500' : 'bg-orange-500')} />
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2 text-[10px]">
                    {([
                      { key: 'pauta', label: 'Pauta', done: indicators.pauta },
                      { key: 'title', label: 'Título', done: indicators.title },
                      { key: 'desc', label: 'Desc.', done: indicators.description },
                      { key: 'cover', label: 'Capa', done: indicators.cover },
                      { key: 'saved', label: 'Salvo', done: indicators.saved },
                      { key: 'sched', label: 'Agend.', done: indicators.scheduling },
                    ] as const).map(item => (
                      <span key={item.key} className="flex items-center gap-0.5">
                        {item.done
                          ? <Check className="h-3 w-3 text-emerald-400" />
                          : <Circle className="h-3 w-3 text-muted-foreground/40" />
                        }
                        {item.label}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Input
                      className="h-7 text-[11px]"
                      placeholder="https://open.spotify.com/episode/..."
                      value={mat?.spotify_link || ''}
                      onChange={e => { if (mat) updateMaterial(mat.id, { spotify_link: e.target.value || null }); }}
                      disabled={!mat}
                    />
                    {mat?.spotify_link && (
                      <a href={mat.spotify_link} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Input
                      className="h-7 text-[11px]"
                      placeholder="Link das gravações…"
                      value={mat?.repository_url || ''}
                      onChange={e => { if (mat) updateMaterial(mat.id, { repository_url: e.target.value || null }); }}
                      disabled={!mat}
                    />
                    {mat?.repository_url && (
                      <a href={mat.repository_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Nenhuma pauta para esta semana.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}