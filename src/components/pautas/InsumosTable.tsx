import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Maximize2, Disc3 } from 'lucide-react';
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

const DAY_LABEL_FULL: Record<DaySlot, string> = {
  monday: 'Segunda', tuesday: 'Terça', wednesday: 'Quarta', thursday: 'Quinta',
  friday: 'Sexta', saturday: 'Sábado', sunday: 'Domingo',
};

// Saturday picker window: D+2 to D+10 (matches existing logic in Pautas.tsx)
function getEligibleSaturdayReleases(releases: Release[], publicationDate: string): Release[] {
  const pub = new Date(publicationDate + 'T12:00:00');
  const min = new Date(pub); min.setDate(min.getDate() + 2);
  const max = new Date(pub); max.setDate(max.getDate() + 10);
  const minStr = min.toISOString().split('T')[0];
  const maxStr = max.toISOString().split('T')[0];
  return releases.filter(r => r.release_date >= minStr && r.release_date <= maxStr);
}

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

  const [expanded, setExpanded] = useState<{ pauta: Pauta; slot: DaySlot } | null>(null);

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
            <TableHead className="w-[220px]">Mencionado / Lançamentos</TableHead>
            <TableHead className="w-[110px] text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ slot, pauta }) => {
            const inputs = (pauta.raw_inputs_json || {}) as Record<string, any>;
            const isWeekday = slot !== 'saturday';
            const rafa = releases.find(r => r.id === inputs.review_rafa_id);
            const kilton = releases.find(r => r.id === inputs.review_kilton_id);
            const selectedReleaseIds: string[] = inputs.selected_release_ids || [];
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
                  {slot === 'saturday' ? (
                    <SaturdayReleasesCell
                      pauta={pauta}
                      releases={releases}
                      selectedIds={selectedReleaseIds}
                      updateRawInput={updateRawInput}
                      direction={directionBinding(pauta, 'comment_next_week_releases', 'mandatory_next_week_releases')}
                    />
                  ) : (
                    <Textarea
                      className="min-h-[60px] text-xs resize-none"
                      placeholder="Itens mencionados no episódio..."
                      value={inputs.mentioned_in_episode || ''}
                      onChange={e => updateRawInput(pauta.id, 'mentioned_in_episode', e.target.value)}
                    />
                  )}
                </TableCell>

                <TableCell className="text-right">
                  <div className="flex flex-col items-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-[11px]"
                      onClick={() => setExpanded({ pauta, slot })}
                      title="Expandir linha em modal"
                    >
                      <Maximize2 className="h-3 w-3" /> Expandir
                    </Button>
                    {slot === 'saturday' && (
                      <Badge variant="outline" className="text-[10px]">Compilação</Badge>
                    )}
                  </div>
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

      <Dialog open={!!expanded} onOpenChange={(o) => !o && setExpanded(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {expanded && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {DAY_LABEL_FULL[expanded.slot]} ·{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    {new Date(expanded.pauta.publication_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </span>
                  <StatusBadge status={expanded.pauta.status} />
                </DialogTitle>
              </DialogHeader>
              <ExpandedRowEditor
                pauta={expanded.pauta}
                slot={expanded.slot}
                releases={releases}
                updateRawInput={updateRawInput}
                directionBinding={directionBinding}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Saturday cell (compact picker for table view) ---------------- */
function SaturdayReleasesCell({
  pauta, releases, selectedIds, updateRawInput, direction,
}: {
  pauta: Pauta;
  releases: Release[];
  selectedIds: string[];
  updateRawInput: (id: string, key: string, value: any) => void;
  direction: { value: { direction: string; mandatory: string }; onChange: (v: { direction: string; mandatory: string }) => void };
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const eligible = useMemo(() => getEligibleSaturdayReleases(releases, pauta.publication_date), [releases, pauta.publication_date]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return eligible;
    return eligible.filter(r => `${r.artist} ${r.album}`.toLowerCase().includes(needle));
  }, [eligible, q]);

  const toggle = (id: string) => {
    const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id];
    updateRawInput(pauta.id, 'selected_release_ids', next);
  };

  return (
    <div className="space-y-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 w-full justify-start text-[11px] gap-1.5">
            <Disc3 className="h-3 w-3" />
            {selectedIds.length > 0 ? `${selectedIds.length} lançamento(s)` : 'Lançamentos da semana…'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          <Input className="h-8 text-xs mb-2" placeholder="Buscar artista ou álbum" value={q} onChange={e => setQ(e.target.value)} />
          <ScrollArea className="h-72">
            <div className="space-y-0.5 pr-2">
              {filtered.map(r => {
                const checked = selectedIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggle(r.id)}
                    className={`w-full text-left p-1.5 rounded text-[11px] border transition-colors ${checked ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/30'}`}
                    title={`${r.artist} — ${r.album}`}
                  >
                    <span className="font-medium">{r.artist}</span> — <span className="text-muted-foreground">{r.album}</span>
                    <span className="text-muted-foreground ml-1">({r.release_date})</span>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-[11px] text-muted-foreground py-2 text-center">Sem resultados na janela D+2 a D+10</p>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
      <DirectionEditor
        sectionLabel="Lançamentos da Semana"
        value={direction.value}
        onChange={direction.onChange}
        searchQuery={`lançamentos heavy metal semana ${pauta.publication_date}`}
      />
    </div>
  );
}

/* ---------------- Expanded modal editor ---------------- */
function ExpandedRowEditor({
  pauta, slot, releases, updateRawInput, directionBinding,
}: {
  pauta: Pauta;
  slot: DaySlot;
  releases: Release[];
  updateRawInput: (id: string, key: string, value: any) => void;
  directionBinding: Props['directionBinding'];
}) {
  const inputs = (pauta.raw_inputs_json || {}) as Record<string, any>;
  const isWeekday = slot !== 'saturday';
  const rafa = releases.find(r => r.id === inputs.review_rafa_id);
  const kilton = releases.find(r => r.id === inputs.review_kilton_id);
  const selectedReleaseIds: string[] = inputs.selected_release_ids || [];

  return (
    <div className="space-y-5 pt-2">
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Aniversário do dia</Label>
        <Input
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

      {isWeekday && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notícia (link)</Label>
            <Input
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Review Rafa</Label>
              <ReviewCell
                releases={releases}
                currentId={inputs.review_rafa_id}
                onPick={(id) => updateRawInput(pauta.id, 'review_rafa_id', id)}
                direction={directionBinding(pauta, 'comment_review_rafa', 'mandatory_review_rafa')}
                releaseLabel={rafa ? `${rafa.artist} — ${rafa.album}` : null}
                sectionLabel="Review Rafa"
                searchQuery={buildSectionSearchQuery('review_rafa', { releaseArtist: rafa?.artist, releaseAlbum: rafa?.album })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Review Kilton</Label>
              <ReviewCell
                releases={releases}
                currentId={inputs.review_kilton_id}
                onPick={(id) => updateRawInput(pauta.id, 'review_kilton_id', id)}
                direction={directionBinding(pauta, 'comment_review_kilton', 'mandatory_review_kilton')}
                releaseLabel={kilton ? `${kilton.artist} — ${kilton.album}` : null}
                sectionLabel="Review Kilton"
                searchQuery={buildSectionSearchQuery('review_kilton', { releaseArtist: kilton?.artist, releaseAlbum: kilton?.album })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Mencionado no episódio</Label>
            <Textarea
              className="min-h-[100px]"
              placeholder="Itens mencionados no episódio..."
              value={inputs.mentioned_in_episode || ''}
              onChange={e => updateRawInput(pauta.id, 'mentioned_in_episode', e.target.value)}
            />
          </div>
        </>
      )}

      {slot === 'saturday' && (
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Lançamentos da Semana (D+2 a D+10)</Label>
          <SaturdayReleasesCell
            pauta={pauta}
            releases={releases}
            selectedIds={selectedReleaseIds}
            updateRawInput={updateRawInput}
            direction={directionBinding(pauta, 'comment_next_week_releases', 'mandatory_next_week_releases')}
          />
          {selectedReleaseIds.length > 0 && (
            <div className="rounded border border-border bg-muted/30 p-2 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Selecionados ({selectedReleaseIds.length})</p>
              <ul className="space-y-0.5">
                {selectedReleaseIds.map(id => {
                  const r = releases.find(x => x.id === id);
                  if (!r) return null;
                  return <li key={id} className="text-xs"><span className="font-medium">{r.artist}</span> — <span className="text-muted-foreground">{r.album}</span></li>;
                })}
              </ul>
            </div>
          )}
        </div>
      )}
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