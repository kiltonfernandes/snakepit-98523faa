import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDown, ArrowUp, Cpu, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_MODEL_CHAIN, loadModelChain, resetModelChain, saveModelChain, type ModelEntry } from '@/lib/ai/model-chain';

export function ModelChainManager() {
  const [chain, setChain] = useState<ModelEntry[]>([]);
  const [newId, setNewId] = useState('');
  const [newDeadline, setNewDeadline] = useState(5000);

  useEffect(() => { setChain(loadModelChain()); }, []);

  const persist = (next: ModelEntry[]) => {
    setChain(next);
    saveModelChain(next);
  };

  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= chain.length) return;
    const next = [...chain];
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  };

  const remove = (i: number) => {
    if (chain.length <= 1) { toast.error('Mantenha pelo menos 1 modelo na cadeia.'); return; }
    persist(chain.filter((_, idx) => idx !== i));
  };

  const updateDeadline = (i: number, value: number) => {
    const next = [...chain];
    next[i] = { ...next[i], deadlineMs: Math.max(500, Math.floor(value) || 0) };
    persist(next);
  };

  const add = () => {
    const id = newId.trim();
    if (!id) { toast.error('Informe o ID do modelo (ex: openai/gpt-5).'); return; }
    if (chain.some(e => e.id === id)) { toast.error('Esse modelo já está na cadeia.'); return; }
    persist([...chain, { id, deadlineMs: Math.max(500, newDeadline) }]);
    setNewId('');
    setNewDeadline(5000);
  };

  const reset = () => {
    setChain(resetModelChain());
    toast.success('Cadeia restaurada para o padrão.');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Cpu className="h-4 w-4" /> Cadeia de modelos OpenRouter
        </CardTitle>
        <CardDescription>
          Ordem de tentativa nas chamadas de IA. Cada modelo tem um deadline (ms) para a primeira resposta;
          se estourar, cai para o próximo. O último deve ser o modelo pago confiável.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {chain.map((entry, i) => (
            <div key={entry.id} className="flex items-center gap-2 rounded-md border bg-muted/20 p-2">
              <span className="w-6 text-center text-xs font-mono text-muted-foreground">{i + 1}</span>
              <span className="flex-1 truncate font-mono text-xs">{entry.id}</span>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={entry.deadlineMs}
                  onChange={(e) => updateDeadline(i, Number(e.target.value))}
                  className="h-7 w-24 text-xs font-mono"
                  min={500}
                  step={500}
                />
                <span className="text-[10px] text-muted-foreground">ms</span>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === chain.length - 1}>
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(i)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t pt-3">
          <Input
            placeholder="provider/model-id (ex: openai/gpt-5-mini)"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            className="h-8 text-xs font-mono"
          />
          <Input
            type="number"
            value={newDeadline}
            onChange={(e) => setNewDeadline(Number(e.target.value))}
            className="h-8 w-24 text-xs font-mono"
            min={500}
            step={500}
          />
          <Button size="sm" onClick={add} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-muted-foreground">
            Padrão: {DEFAULT_MODEL_CHAIN.length} modelos. Alterações são salvas automaticamente.
          </span>
          <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={reset}>
            <RotateCcw className="h-3 w-3" /> Restaurar padrão
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}