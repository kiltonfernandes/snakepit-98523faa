import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Eye, Sparkles, Copy } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { Pauta, PautaSections, DaySlot } from '@/lib/types';
import { getSectionsForDay } from '@/lib/constants';

const DAY_LABEL: Record<DaySlot, string> = {
  monday: 'Seg', tuesday: 'Ter', wednesday: 'Qua', thursday: 'Qui',
  friday: 'Sex', saturday: 'Sáb', sunday: 'Dom',
};
const SLOT_ORDER: DaySlot[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

interface Props {
  pautas: Pauta[];
  getPautaSlot: (p: Pauta) => DaySlot;
  onSectionChange: (pautaId: string, key: keyof PautaSections, value: string) => void;
  onPreview: (p: Pauta) => void;
  onOpenPrompt: (p: Pauta, sectionKey?: string) => void;
  onCopyPrompt: (p: Pauta) => void;
}

/**
 * Tabular view of generated content. One row per day; one column per section.
 * Sections that don't apply to the day's slot are rendered as a soft dash.
 */
export function ContentTable({ pautas, getPautaSlot, onSectionChange, onPreview, onOpenPrompt, onCopyPrompt }: Props) {
  const rows = useMemo(() => {
    return SLOT_ORDER
      .map(slot => ({ slot, pauta: pautas.find(p => getPautaSlot(p) === slot) }))
      .filter((r): r is { slot: DaySlot; pauta: Pauta } => !!r.pauta);
  }, [pautas, getPautaSlot]);

  // Union of all section keys that ever appear in the week.
  const allSectionKeys = useMemo(() => {
    const keys: { key: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const { slot } of rows) {
      for (const s of getSectionsForDay(slot)) {
        if (!seen.has(s.key)) { seen.add(s.key); keys.push({ key: s.key, label: s.label }); }
      }
    }
    return keys;
  }, [rows]);

  return (
    <div className="rounded-md border border-border bg-card overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/40 sticky top-0">
          <TableRow>
            <TableHead className="w-[60px]">Dia</TableHead>
            <TableHead className="w-[110px]">Status</TableHead>
            {allSectionKeys.map(s => (
              <TableHead key={s.key} className="min-w-[260px]">{s.label}</TableHead>
            ))}
            <TableHead className="w-[110px] text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ slot, pauta }) => {
            const sections = getSectionsForDay(slot);
            const sectionKeys = new Set(sections.map(s => s.key));
            const data = (pauta.sections_json || {}) as Record<string, string>;
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
                {allSectionKeys.map(s => (
                  <TableCell key={s.key}>
                    {sectionKeys.has(s.key) ? (
                      <div className="space-y-1">
                        <Textarea
                          className="min-h-[80px] text-xs resize-y"
                          placeholder={`${s.label}…`}
                          value={data[s.key] || ''}
                          onChange={e => onSectionChange(pauta.id, s.key as keyof PautaSections, e.target.value)}
                        />
                        <Button
                          variant="ghost" size="sm"
                          className="h-6 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() => onOpenPrompt(pauta, s.key)}
                          title={`Gerar ${s.label}`}
                        >
                          <Sparkles className="h-3 w-3" /> Gerar
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">—</span>
                    )}
                  </TableCell>
                ))}
                <TableCell className="text-right pt-3">
                  <div className="inline-flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Visualizar pauta" onClick={() => onPreview(pauta)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Prompt completo" onClick={() => onOpenPrompt(pauta)}>
                      <Sparkles className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Copiar prompt" onClick={() => onCopyPrompt(pauta)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={3 + allSectionKeys.length} className="text-center text-xs text-muted-foreground py-6">Nenhuma pauta para esta semana.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}