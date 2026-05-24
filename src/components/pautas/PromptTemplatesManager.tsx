/**
 * Modal to manage prompt templates (create / edit / delete) per component type.
 * Built-in templates are read-only.
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Plus, Trash2, Save, X, Lock } from 'lucide-react';
import { toast } from 'sonner';
import {
  PromptTemplate,
  TOPIC_TYPE_OPTIONS,
  createPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  listPromptTemplates,
} from '@/lib/prompt-templates';
import { getBuiltinTemplateText } from '@/lib/standalone-prompts';
import { StandaloneTopicType } from '@/lib/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: string;
  onChanged?: () => void;
}

export function PromptTemplatesManager({ open, onOpenChange, defaultType, onChanged }: Props) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; name: string; topic_type: string; template_text: string; description: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const all = await listPromptTemplates();
      setTemplates(all);
    } catch (e: any) {
      toast.error('Erro ao carregar prompts: ' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      refresh();
      setSelectedId(null);
      setEditing(null);
    }
  }, [open]);

  const startNew = () => {
    setSelectedId(null);
    const initialType = defaultType || 'review';
    const builtinText = ['anniversary', 'review', 'news', 'interview'].includes(initialType)
      ? getBuiltinTemplateText(initialType as StandaloneTopicType)
      : '';
    setEditing({
      id: null,
      name: '',
      topic_type: initialType,
      template_text: builtinText,
      description: '',
    });
  };

  const startEdit = (t: PromptTemplate) => {
    setSelectedId(t.id);
    if (t.is_builtin) {
      // can't edit builtin
      setEditing(null);
      return;
    }
    setEditing({
      id: t.id,
      name: t.name,
      topic_type: t.topic_type,
      template_text: t.template_text,
      description: t.description || '',
    });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.template_text.trim()) {
      toast.error('Nome e texto do prompt são obrigatórios.');
      return;
    }
    try {
      if (editing.id) {
        await updatePromptTemplate(editing.id, {
          name: editing.name.trim(),
          topic_type: editing.topic_type,
          template_text: editing.template_text,
          description: editing.description,
        });
        toast.success('Prompt atualizado');
      } else {
        await createPromptTemplate({
          name: editing.name.trim(),
          topic_type: editing.topic_type,
          template_text: editing.template_text,
          description: editing.description,
        });
        toast.success('Prompt criado');
      }
      await refresh();
      onChanged?.();
      setEditing(null);
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + (e?.message || e));
    }
  };

  const remove = async (id: string) => {
    try {
      await deletePromptTemplate(id);
      toast.success('Prompt excluído');
      await refresh();
      onChanged?.();
      if (selectedId === id) { setSelectedId(null); setEditing(null); }
    } catch (e: any) {
      toast.error('Erro ao excluir: ' + (e?.message || e));
    }
  };

  const grouped = TOPIC_TYPE_OPTIONS.map(opt => ({
    ...opt,
    items: templates.filter(t => t.topic_type === opt.value),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Gerenciar prompts</DialogTitle>
          <DialogDescription>
            Prompts ficam atrelados ao tipo de componente da pauta (Review, Notícia, Aniversário, Entrevista ou Outro). Os "padrão" são built-in e não podem ser editados — duplique para criar variações.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[300px_1fr] gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">PROMPTS</span>
              <Button size="sm" variant="outline" onClick={startNew}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Novo
              </Button>
            </div>
            <ScrollArea className="h-[60vh] rounded-md border">
              {loading ? (
                <div className="p-3 text-xs text-muted-foreground">Carregando…</div>
              ) : (
                <div className="space-y-3 p-2">
                  {grouped.map(g => (
                    <div key={g.value}>
                      <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{g.label}</div>
                      {g.items.length === 0 && (
                        <div className="px-2 py-1 text-[11px] italic text-muted-foreground">— vazio —</div>
                      )}
                      {g.items.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => startEdit(t)}
                          className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${selectedId === t.id ? 'bg-primary/10' : 'hover:bg-muted'}`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium">{t.name}</span>
                              {t.is_builtin && <Lock className="h-3 w-3 text-muted-foreground" />}
                              {t.is_default && <Badge variant="secondary" className="text-[9px] uppercase">padrão</Badge>}
                            </div>
                            {t.description && (
                              <div className="truncate text-[11px] text-muted-foreground">{t.description}</div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="space-y-3">
            {!editing ? (
              <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                {selectedId ? 'Prompt built-in (somente leitura). Crie um novo para editar.' : 'Selecione ou crie um prompt'}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Nome</Label>
                    <Input
                      value={editing.name}
                      onChange={e => setEditing({ ...editing, name: e.target.value })}
                      placeholder="Ex.: Resenha reflexiva"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo de componente</Label>
                    <Select
                      value={editing.topic_type}
                      onValueChange={v => setEditing({ ...editing, topic_type: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TOPIC_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Descrição curta</Label>
                  <Input
                    value={editing.description}
                    onChange={e => setEditing({ ...editing, description: e.target.value })}
                    placeholder="Para identificar este prompt no seletor"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Texto do prompt</Label>
                  <Textarea
                    rows={18}
                    value={editing.template_text}
                    onChange={e => setEditing({ ...editing, template_text: e.target.value })}
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Placeholders disponíveis: <code>{'{{input}}'}</code>, <code>{'{{notes}}'}</code>, <code>{'{{release_block}}'}</code>, <code>{'{{platform_block}}'}</code>
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    {editing.id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive">
                            <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir prompt?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação é permanente. Episódios já criados não serão afetados.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(editing.id!)}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      <X className="mr-1 h-3.5 w-3.5" /> Cancelar
                    </Button>
                    <Button size="sm" onClick={save}>
                      <Save className="mr-1 h-3.5 w-3.5" /> Salvar
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}