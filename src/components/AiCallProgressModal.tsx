import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAiCallProgress } from '@/contexts/AiCallProgressContext';
import { Loader2, CheckCircle2, XCircle, Circle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const STAGE_LABEL: Record<string, string> = {
  connecting: 'Conectando…',
  trying: 'Tentando modelos gratuitos…',
  streaming: 'Recebendo resposta…',
  populating: 'Preenchendo o campo…',
  done: 'Concluído',
  error: 'Falha na chamada',
};

export function AiCallProgressModal() {
  const { state, close } = useAiCallProgress();
  return (
    <Dialog open={state.open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {state.stage === 'done'
              ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              : state.stage === 'error'
                ? <XCircle className="h-5 w-5 text-destructive" />
                : <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            {state.label || 'Chamada IA'}
          </DialogTitle>
          <DialogDescription>{STAGE_LABEL[state.stage] || state.stage}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-3 space-y-1.5 max-h-56 overflow-auto">
            {state.attempts.length === 0 && (
              <div className="text-xs text-muted-foreground">Preparando cadeia de modelos…</div>
            )}
            {state.attempts.map((a) => (
              <div key={a.model} className="flex items-center gap-2 text-xs font-mono">
                {a.status === 'selected'
                  ? <Zap className="h-3.5 w-3.5 text-emerald-500" />
                  : a.status === 'failed'
                    ? <XCircle className="h-3.5 w-3.5 text-destructive/70" />
                    : <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                <span className={cn('truncate', a.status === 'failed' && 'line-through text-muted-foreground')}>{a.model}</span>
                {a.reason && <span className="text-[10px] uppercase text-muted-foreground">({a.reason})</span>}
              </div>
            ))}
          </div>

          {state.currentModel && state.stage === 'streaming' && (
            <div className="text-xs text-muted-foreground">
              Modelo ativo: <span className="font-mono">{state.currentModel}</span> · {state.bytes.toLocaleString('pt-BR')} bytes
            </div>
          )}
          {state.error && (
            <div className="text-xs text-destructive">{state.error}</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}