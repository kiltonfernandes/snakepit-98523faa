import { useEffect, useState } from 'react';
import { Sparkles, FlaskConical } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { loadAgenticFlag, saveAgenticFlag } from '@/lib/rivaldo-agent';

/**
 * Toggle no header do Rivaldo para alternar entre o motor clássico 3.2
 * (OFF, default) e o motor Agentic V1 (ON). Enquanto a Onda 4 não estiver
 * pronta, a flag persiste mas o pipeline ignora — vira "coming soon".
 */
export function AgenticToggle() {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadAgenticFlag().then((v) => { setEnabled(v); setReady(true); });
  }, []);

  if (!ready) return null;

  const handleChange = async (next: boolean) => {
    setEnabled(next);
    try { await saveAgenticFlag(next); } catch { /* silent — flag é opcional */ }
  };

  return (
    <div className="flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5">
      <FlaskConical className="w-3.5 h-3.5 text-primary" />
      <Label htmlFor="rivaldo-agentic" className="text-xs font-medium cursor-pointer">
        Agentic V1 <span className="text-muted-foreground">(beta)</span>
      </Label>
      <Switch id="rivaldo-agentic" checked={enabled} onCheckedChange={handleChange} />
      {enabled && <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />}
    </div>
  );
}