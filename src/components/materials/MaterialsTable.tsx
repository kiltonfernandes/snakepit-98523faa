import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Image as ImageIcon, FileText, Music, FolderOpen } from 'lucide-react';
import { EpisodeMaterial, DaySlot } from '@/lib/types';
import { cn } from '@/lib/utils';

const DAY_LABEL: Record<DaySlot, string> = {
  monday: 'Seg', tuesday: 'Ter', wednesday: 'Qua', thursday: 'Qui',
  friday: 'Sex', saturday: 'Sáb', sunday: 'Dom',
};

const SLOT_ORDER: DaySlot[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

interface Props {
  materials: EpisodeMaterial[];
  updateMaterial: (id: string, m: Partial<EpisodeMaterial>) => void;
}

/**
 * Tabular overview of all per-day materials in the selected week:
 * one row per day, with quick visual readouts of completeness and inline
 * editing for the most common fields (Spotify link, selected title).
 */
export function MaterialsTable({ materials, updateMaterial }: Props) {
  const rows = useMemo(() => {
    return SLOT_ORDER
      .map(slot => materials.find(m => m.slot_key === slot))
      .filter((m): m is EpisodeMaterial => !!m);
  }, [materials]);

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/40 sticky top-0">
          <TableRow>
            <TableHead className="w-[60px]">Dia</TableHead>
            <TableHead className="w-[64px]">Capa</TableHead>
            <TableHead>Título selecionado</TableHead>
            <TableHead className="w-[80px] text-center">Descrição</TableHead>
            <TableHead className="w-[260px]">Spotify</TableHead>
            <TableHead className="w-[120px] text-center">Repositório</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(m => {
            const slot = m.slot_key as DaySlot;
            const titles = m.title_options_json || [];
            const selected = m.selected_title_index != null ? titles[m.selected_title_index] : null;
            const hasDescription = !!(m.description_html && m.description_html.trim().length > 0);
            const hasCover = !!m.cover_url;
            const hasRepo = !!m.repository_url;
            return (
              <TableRow key={m.id} className="align-middle">
                <TableCell className="font-medium text-xs">
                  <div className="flex flex-col">
                    <span>{DAY_LABEL[slot]}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(m.episode_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {hasCover ? (
                    <img src={m.cover_url!} alt="" className="h-10 w-10 rounded object-cover border border-border" />
                  ) : (
                    <div className="h-10 w-10 rounded border border-dashed border-border flex items-center justify-center text-muted-foreground">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {selected?.text ? (
                    <span className="line-clamp-2">{selected.text}</span>
                  ) : titles.length > 0 ? (
                    <span className="text-muted-foreground italic">{titles.length} opções, nada selecionado</span>
                  ) : (
                    <span className="text-muted-foreground italic">Sem títulos</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={hasDescription ? 'default' : 'outline'} className="text-[10px]">
                    <FileText className="h-3 w-3 mr-1" />{hasDescription ? 'OK' : '—'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Music className="h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="h-7 text-[11px]"
                      placeholder="https://open.spotify.com/..."
                      value={m.spotify_link || ''}
                      onChange={e => updateMaterial(m.id, { spotify_link: e.target.value })}
                    />
                    {m.spotify_link && (
                      <a href={m.spotify_link} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  {hasRepo ? (
                    <a href={m.repository_url!} target="_blank" rel="noopener noreferrer" title="Abrir no repositório">
                      <Badge variant="default" className={cn('text-[10px] gap-1')}>
                        <FolderOpen className="h-3 w-3" />Enviado
                      </Badge>
                    </a>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">—</Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                Nenhum material para esta semana.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}