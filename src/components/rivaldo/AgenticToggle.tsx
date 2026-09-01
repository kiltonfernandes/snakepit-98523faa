import { useEffect, useState } from 'react';
import { Sparkles, FlaskConical, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { loadAgenticFlag, saveAgenticFlag } from '@/lib/rivaldo-agent';
import { useRivaldo } from '@/contexts/RivaldoContext';

/**
 * Toggle + status pill do Rivaldo Agentic V1.
 *
 * A IA do Rivaldo começa desligada. "Agentic V1 habilitado" = flag ON. "Agentic executado" só aparece após
 * requestId real + plano validado + pelo menos 1 operação aplicada.
 * Em fallback, o pill mostra "Concluído com processador legado".
 */
export function AgenticToggle() {
  const { agenticStatus, agenticOutcome } = useRivaldo();
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    loadAgenticFlag()
      .then((v) => { setEnabled(v); setReady(true); })
      .catch(() => { setEnabled(false); setReady(true); });
  }, []);

  if (!ready) return null;

  const handleChange = async (next: boolean) => {
    setEnabled(next); setSaveError(null);
    try { await saveAgenticFlag(next); }
    catch (err) { setSaveError(err instanceof Error ? err.message : 'falha ao salvar'); setEnabled(!next); }
  };

  const pill = renderStatusPill(enabled, agenticStatus, agenticOutcome);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5">
        <FlaskConical className="w-3.5 h-3.5 text-primary" />
        <Label htmlFor="rivaldo-agentic" className="text-xs font-medium cursor-pointer">
          IA do Rivaldo <span className="text-muted-foreground">(desligada por padrão)</span>
        </Label>
        <Switch id="rivaldo-agentic" checked={enabled} onCheckedChange={handleChange} />
        {enabled && agenticStatus === 'enabled_idle' && <Sparkles className="w-3.5 h-3.5 text-primary" />}
      </div>
      {pill}
      {saveError && <span className="text-xs text-destructive">flag: {saveError}</span>}
    </div>
  );
}

function renderStatusPill(enabled: boolean, status: string, outcome: ReturnType<typeof useRivaldo>['agenticOutcome']) {
  if (!enabled) return null;
  if (status === 'agentic_success' && outcome?.mode === 'agentic') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 px-2.5 py-1 text-[11px] text-emerald-400">
        <CheckCircle2 className="w-3 h-3" /> Agentic executado · {outcome.acceptedOperations} ops · req {outcome.requestId.slice(0, 10)}…
      </span>
    );
  }
  if (status === 'legacy_fallback' && outcome?.mode === 'fallback') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/40 px-2.5 py-1 text-[11px] text-amber-400" title={outcome.message}>
        <AlertTriangle className="w-3 h-3" /> Concluído com processador legado · {outcome.failedStage}
      </span>
    );
  }
  if (status === 'analyzing' || status === 'planning' || status === 'validating' || status === 'executing') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-primary/10 border border-primary/30 px-2.5 py-1 text-[11px] text-primary">
        <Loader2 className="w-3 h-3 animate-spin" /> {status}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-muted/40 border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground">
      Habilitado — aguardando episódio
    </span>
  );
}
