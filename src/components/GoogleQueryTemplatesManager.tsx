/**
 * Modal to edit Google search query templates per section/topic type.
 * Persists into `app_settings.google_query_templates_json`.
 */
import { useEffect, useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RotateCcw, Save, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/contexts/AppContext';
import { QUERY_TEMPLATES } from '@/lib/google-query-templates';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GoogleQueryTemplatesManager({ open, onOpenChange }: Props) {
  const { settings, updateSettings } = useApp();
  const initial = useMemo(() => settings.google_query_templates_json || {}, [settings.google_query_templates_json]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      const next: Record<string, string> = {};
      for (const t of QUERY_TEMPLATES) {
        next[t.key] = (initial[t.key] ?? t.default) as string;
      }
      setDrafts(next);
    }
  }, [open, initial]);

  const grouped = useMemo(() => {
    const map: Record<string, typeof QUERY_TEMPLATES> = {};
    for (const t of QUERY_TEMPLATES) {
      (map[t.group] = map[t.group] || ([] as any)).push(t);
    }
    return map;
  }, []);

  const save = () => {
    // Only persist values that differ from defaults to keep the JSON clean.
    const out: Record<string, string> = {};
    for (const t of QUERY_TEMPLATES) {
      const v = (drafts[t.key] ?? '').trim();
      if (v && v !== t.default) out[t.key] = v;
    }
    updateSettings({ google_query_templates_json: out });
    toast.success('Templates de pesquisa atualizados');
    onOpenChange(false);
  };

  const resetOne = (key: string, def: string) => {
    setDrafts(prev => ({ ...prev, [key]: def }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" /> Queries de Pesquisa Google
          </DialogTitle>
          <DialogDescription>
            Edite os templates de busca usados pelo botão "Pesquisar no Google" em cada
            tipo de pauta. Use placeholders entre <code>{'{{ }}'}</code>.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 py-2">
            {Object.entries(grouped).map(([group, items]) => (
              <section key={group} className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </h3>
                <div className="space-y-4">
                  {items.map(t => (
                    <div key={t.key} className="space-y-1.5 rounded-md border border-border/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-sm font-medium">{t.label}</Label>
                        <div className="flex items-center gap-2">
                          {t.placeholders.map(p => (
                            <Badge key={p} variant="secondary" className="font-mono text-[10px]">
                              {`{{${p}}}`}
                            </Badge>
                          ))}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 text-xs"
                            onClick={() => resetOne(t.key, t.default)}
                            title="Restaurar padrão"
                          >
                            <RotateCcw className="h-3 w-3" /> Padrão
                          </Button>
                        </div>
                      </div>
                      <Textarea
                        rows={2}
                        value={drafts[t.key] ?? ''}
                        onChange={(e) => setDrafts(prev => ({ ...prev, [t.key]: e.target.value }))}
                        className="font-mono text-xs"
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} className="gap-2">
            <Save className="h-4 w-4" /> Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}