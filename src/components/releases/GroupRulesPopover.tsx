import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Layers, Plus, Trash2 } from 'lucide-react';
import { GROUP_FIELD_LABELS, GroupField, GroupRule } from '@/lib/releases-grouping';

const FIELDS = Object.keys(GROUP_FIELD_LABELS) as GroupField[];

export function GroupRulesPopover({
  rules,
  onChange,
}: {
  rules: GroupRule[];
  onChange: (next: GroupRule[]) => void;
}) {
  const update = (idx: number, patch: Partial<GroupRule>) => {
    onChange(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const remove = (idx: number) => onChange(rules.filter((_, i) => i !== idx));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };
  const add = () => {
    const used = new Set(rules.map(r => r.field));
    const next = FIELDS.find(f => !used.has(f)) || 'country';
    onChange([...rules, { field: next, dir: 'asc' }]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={rules.length ? 'secondary' : 'outline'} size="sm" className="gap-1.5 h-8">
          <Layers className="h-3.5 w-3.5" />
          Group {rules.length > 0 && <span className="text-muted-foreground">({rules.length})</span>}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px]" align="end">
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium">Agrupar por</p>
            {rules.length > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => onChange([])}>
                Limpar
              </Button>
            )}
          </div>
          {rules.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">Nenhum agrupamento. Adicione um nível abaixo para criar pilhas colapsáveis.</p>
          )}
          {rules.map((r, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <div className="flex flex-col">
                <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-30" onClick={() => move(idx, -1)} disabled={idx === 0} title="Subir nível">
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-30" onClick={() => move(idx, 1)} disabled={idx === rules.length - 1} title="Descer nível">
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
              <Select value={r.field} onValueChange={v => update(idx, { field: v as GroupField })}>
                <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELDS.map(f => (
                    <SelectItem key={f} value={f}>{GROUP_FIELD_LABELS[f]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={r.dir} onValueChange={v => update(idx, { dir: v as 'asc' | 'desc' })}>
                <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">A → Z</SelectItem>
                  <SelectItem value="desc">Z → A</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(idx)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive/80" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-full gap-1.5 mt-2" onClick={add}>
            <Plus className="h-3.5 w-3.5" /> Adicionar nível de agrupamento
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
