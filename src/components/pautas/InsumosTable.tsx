import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { StatusBadge } from '@/components/StatusBadge';
import { DirectionEditor, buildSectionSearchQuery } from '@/components/pautas/DirectionEditor';
import { Pauta, Release, DaySlot } from '@/lib/types';
import { DAY_SLOTS } from '@/lib/constants';

interface Props {
  pautas: Pauta[];
  releases: Release[];
  weekStart: string;
  getPautaSlot: (p: Pauta) => DaySlot;
  updateRawInput: (pautaId: string, key: string, value: any) => void;
  directionBinding: (
    p: Pauta,
    commentKey: string,
    mandatoryKey: string,
  ) => {
    value: { direction: string; mandatory: string };
    onChange: (v: { direction: string; mandatory: string }) => void;
  };
}

const DAY_LABEL: Record<DaySlot, string> = {
  monday: 'Seg', tuesday: 'Ter', wednesday: 'Qua', thursday: 'Qui',
  friday: 'Sex', saturday: 'Sáb', sunday: 'Dom',
};

/**
 * Compact tabular view of all daily inputs for the selected week.
 * One row per day; cells edit-in-place; "Direção" opens the existing modal.
 * Sunday is intentionally excluded (compilation slot, no manual inputs).
 */
export function InsumosTable({ pautas, releases, getPautaSlot, updateRawInput, directionBinding }: Props) {
  const rows = useMemo(() => {
    const slots: DaySlot[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return slots
      .map(slot => ({ slot, pauta: pautas.find(p => getPautaSlot(p) === slot) }))
      .filter((r): r is { slot: DaySlot; pauta: Pauta } => !!r.pauta);
  }, [pautas, getPautaSlot]);

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/40 sticky top-0">
          <TableRow>
            <TableHead className="w-[60px]">Dia</TableHead>
            <TableHead className="w-[110px]">Status</TableHead>
            <TableHead>Aniversário</TableHead>
            <TableHead>Notícia (link)</TableHead>
            <TableHead className="w-[170px]">Review Rafa</TableHead>
            <TableHead className="w-[170px]">Review Kilton</TableHead>
            <TableHead className="w-[260px]">Mencionado</TableHead>
            <TableHead className="w-[140px] text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ slot, pauta }) => {
            const inputs = (pauta.raw_inputs_json || {}) as Record<string, any>;
            const isWeekday = slot !== 'saturday';
            const rafa = releases.find(r => r.id === inputs.review_rafa_id);
            const kilton = releases.find(r => r.id === inputs.review_kilton_id);
            return (
              <TableRow key={pauta.id} className="align-top">
                <TableCell className="font-medium text-xs pt-3">
                  <div className="flex flex-col">
                    <span>{DAY_LABEL[slot]}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(pauta.publication_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="pt-3"><StatusBadge status={pauta.status} /></TableCell>

                <TableCell>
                  <div className="space-y-1">
                    <Input
                      className="h-8 text-xs"
                      placeholder="Aniversário do dia"
                      value={inputs.anniversary || ''}
                      onChange={e => updateRawInput(pauta.id, 'anniversary', e.target.value)}
                    />
                    <DirectionEditor
                      sectionLabel="Aniversário"
                      {...directionBinding(pauta, 'comment_anniversary', 'mandatory_anniversary')}
                      searchQuery={buildSectionSearchQuery('anniversary', { anniversary: inputs.anniversary })}
                    />
                  </div>
                </TableCell>

                <TableCell>
                  {isWeekday ? (
                    <div className="space-y-1">
                      <Input
                        className="h-8 text-xs"
                        placeholder="https://..."
                        value={inputs.news_link || ''}
                        onChange={e => updateRawInput(pauta.id, 'news_link', e.target.value)}
                      />
                      <DirectionEditor
                        sectionLabel="Notícias"
                        {...directionBinding(pauta, 'comment_news', 'mandatory_news')}
                        searchQuery={buildSectionSearchQuery('news', { newsLink: inputs.news_link })}
                      />
                    </div>
                  ) : <span className="text-[10px] text-muted-foreground">—</span>}
                </TableCell>

                <TableCell>
                  {isWeekday ? (
                    <ReviewCell
                      releases={releases}
                      currentId={inputs.review_rafa_id}
                      onPick={(id) => updateRawInput(pauta.id, 'review_rafa_id', id)}
                      direction={directionBinding(pauta, 'comment_review_rafa', 'mandatory_review_rafa')}
                      releaseLabel={rafa ? `${rafa.artist} — ${rafa.album}` : null}
                      sectionLabel="Review Rafa"
                      searchQuery={buildSectionSearchQuery('review_rafa', { releaseArtist: rafa?.artist, releaseAlbum: rafa?.album })}
                    />
                  ) : <span className="text-[10px] text-muted-foreground">—</span>}
                </TableCell>

                <TableCell>
                  {isWeekday ? (
                    <ReviewCell
                      releases={releases}
                      currentId={inputs.review_kilton_id}
                      onPick={(id) => updateRawInput(pauta.id, 'review_kilton_id', id)}
                      direction={directionBinding(pauta, 'comment_review_kilton', 'mandatory_review_kilton')}
                      releaseLabel={kilton ? `${kilton.artist} — ${kilton.album}` : null}
                      sectionLabel="Review Kilton"
                      searchQuery={buildSectionSearchQuery('review_kilton', { releaseArtist: kilton?.artist, releaseAlbum: kilton?.album })}
                    />
                  ) : <span className="text-[10px] text-muted-foreground">—</span>}
                </TableCell>

                <TableCell>
                  <Textarea
                    className="min-h-[60px] text-xs resize-none"
                    placeholder="Itens mencionados no episódio..."
                    value={inputs.mentioned_in_episode || ''}
                    onChange={e => updateRawInput(pauta.id, 'mentioned_in_episode', e.target.value)}
                  />
                </TableCell>

                <TableCell className="text-right">
                  {slot === 'saturday' && (
                    <Badge variant="outline" className="text-[10px]">Compilação</Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">
                Nenhuma pauta para esta semana.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ReviewCell({
  releases, currentId, onPick, direction, releaseLabel, sectionLabel, searchQuery,
}: {
  releases: Release[];
  currentId: string | undefined;
  onPick: (id: string) => void;
  direction: { value: { direction: string; mandatory: string }; onChange: (v: { direction: string; mandatory: string }) => void };
  releaseLabel: string | null;
  sectionLabel: string;
  searchQuery: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return releases.slice(0, 30);
    return releases.filter(r => `${r.artist} ${r.album}`.toLowerCase().includes(needle)).slice(0, 30);
  }, [releases, q]);

  return (
    <div className="space-y-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 w-full justify-start text-[11px] truncate">
            {releaseLabel || 'Selecionar disco…'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <Input className="h-8 text-xs mb-2" placeholder="Buscar artista ou disco" value={q} onChange={e => setQ(e.target.value)} />
          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {filtered.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => { onPick(r.id); setOpen(false); }}
                className="w-full text-left px-2 py-1 rounded text-[11px] hover:bg-muted truncate"
                title={`${r.artist} — ${r.album}`}
              >
                <span className="font-medium">{r.artist}</span> — <span className="text-muted-foreground">{r.album}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-[11px] text-muted-foreground py-2 text-center">Sem resultados</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <DirectionEditor
        sectionLabel={sectionLabel}
        value={direction.value}
        onChange={direction.onChange}
        searchQuery={searchQuery}
      />
    </div>
  );
}