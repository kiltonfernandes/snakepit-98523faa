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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Plus, Trash2, Save, X, Lock, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  PromptTemplate,
  TOPIC_TYPE_OPTIONS,
  COMPONENT_KEYS,
  COMPONENT_LABELS,
  ComponentKey,
  ComponentsMap,
  createPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  listPromptTemplates,
} from '@/lib/prompt-templates';
import { getBuiltinTemplateText, getBuiltinComponentText } from '@/lib/standalone-prompts';
import { StandaloneTopicType } from '@/lib/types';
import { getQueryTemplate } from '@/lib/google-query-templates';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: string;
  onChanged?: () => void;
}

export function PromptTemplatesManager({ open, onOpenChange, defaultType, onChanged }: Props) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    id: string | null;
    name: string;
    topic_type: string;
    description: string;
    google_query: string;
    google_images_query: string;
    components: Record<ComponentKey, string>;
  } | null>(null);
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
    const defaultQuery = getQueryTemplate(`standalone.${initialType}.with_release`) || '';
    const components: Record<ComponentKey, string> = {
      pauta_completa: '',
      capa: '',
      titulo: '',
      descricao: '',
      segway: '',
      custom: '',
    };
    if (['anniversary', 'review', 'news', 'interview'].includes(initialType)) {
      // Pre-fill component slots with the BUILTIN markers so the editor sees what will be used.
      components.pauta_completa = '__BUILTIN__';
      components.capa = '__BUILTIN__';
      components.titulo = '__BUILTIN__';
      components.descricao = '__BUILTIN__';
    }
    setEditing({
      id: null,
      name: '',
      topic_type: initialType,
      description: '',
      google_query: defaultQuery,
      google_images_query: '"{{artist}}" "{{album}}" album cover high resolution',
      components,
    });
  };

  const startEdit = (t: PromptTemplate) => {
    setSelectedId(t.id);
    if (t.is_builtin) {
      // can't edit builtin
      setEditing(null);
      return;
    }
    const c = t.components_json || {};
    const components: Record<ComponentKey, string> = {
      pauta_completa: c.pauta_completa ?? t.template_text ?? '',
      capa:           c.capa ?? '',
      titulo:         c.titulo ?? '',
      descricao:      c.descricao ?? '',
      segway:         c.segway ?? '',
      custom:         c.custom ?? '',
    };
    setEditing({
      id: t.id,
      name: t.name,
      topic_type: t.topic_type,
      description: t.description || '',
      google_query: t.google_query || '',
      google_images_query: t.google_images_query || '',
      components,
    });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error('Nome é obrigatório.');
      return;
    }
    const hasAnyComponent = COMPONENT_KEYS.some(k => (editing.components[k] || '').trim());
    if (!hasAnyComponent) {
      toast.error('Preencha pelo menos um componente.');
      return;
    }
    try {
      const components_json: ComponentsMap = { ...editing.components };
      if (editing.id) {
        await updatePromptTemplate(editing.id, {
          name: editing.name.trim(),
          topic_type: editing.topic_type,
          template_text: editing.components.pauta_completa || '',
          components_json,
          description: editing.description,
          google_query: editing.google_query,
          google_images_query: editing.google_images_query,
        } as any);
        toast.success('Prompt atualizado');
      } else {
        await createPromptTemplate({
          name: editing.name.trim(),
          topic_type: editing.topic_type,
          template_text: editing.components.pauta_completa || '',
          components_json,
          description: editing.description,
          google_query: editing.google_query,
          google_images_query: editing.google_images_query,
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

  const move = async (templateId: string, direction: -1 | 1) => {
    const target = templates.find(t => t.id === templateId);
    if (!target) return;
    const siblings = templates
      .filter(t => t.topic_type === target.topic_type)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
    const idx = siblings.findIndex(t => t.id === templateId);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const other = siblings[swapIdx];
    // Swap sort_order values, ensuring distinct values if equal.
    const a = target.sort_order ?? 0;
    const b = other.sort_order ?? 0;
    const newA = a === b ? b + direction : b;
    const newB = a === b ? a : a;
    try {
      await Promise.all([
        updatePromptTemplate(target.id, { sort_order: newA }),
        updatePromptTemplate(other.id, { sort_order: newB }),
      ]);
      await refresh();
      onChanged?.();
    } catch (e: any) {
      toast.error('Erro ao reordenar: ' + (e?.message || e));
    }
  };

  const grouped = TOPIC_TYPE_OPTIONS.map(opt => ({
    ...opt,
    items: templates.filter(t => t.topic_type === opt.value),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Gerenciar prompts</DialogTitle>
          <DialogDescription>
            Cada template está atrelado a um <b>tipo de pauta</b> (Aniversário, Review, Notícia, Entrevista ou Outro) e contém os sub-prompts de cada <b>componente</b> (capa, título, descrição, pauta completa, segway, custom). Os "padrão" são built-in e não podem ser editados — duplique para criar variações.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[300px_1fr] gap-4 flex-1 min-h-0">
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
                      {g.items.map((t, i) => (
                        <div
                          key={t.id}
                          className={`group flex items-start gap-1 rounded-md px-1 py-1 text-sm transition-colors ${selectedId === t.id ? 'bg-primary/10' : 'hover:bg-muted'}`}
                        >
                          <div className="flex flex-col opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              disabled={i === 0}
                              onClick={(e) => { e.stopPropagation(); move(t.id, -1); }}
                              className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-30"
                              title="Mover para cima"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={i === g.items.length - 1}
                              onClick={(e) => { e.stopPropagation(); move(t.id, 1); }}
                              className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-30"
                              title="Mover para baixo"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => startEdit(t)}
                            className="flex flex-1 items-start gap-2 text-left"
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
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="space-y-3 overflow-y-auto pr-2">
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
                      placeholder="Ex.: Review (padrão)"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo de pauta</Label>
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
                  <Label>Query do Google</Label>
                  <Textarea
                    rows={2}
                    value={editing.google_query}
                    onChange={e => setEditing({ ...editing, google_query: e.target.value })}
                    placeholder='Ex.: "{{artist}}" "{{album}}" review {{year}}'
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Disparada pelo botão "Pesquisar no Google". Placeholders: <code>{'{{artist}}'}</code>, <code>{'{{album}}'}</code>, <code>{'{{year}}'}</code>, <code>{'{{notes}}'}</code>, <code>{'{{slug}}'}</code>, <code>{'{{host}}'}</code>. Vazio = usa o template global em Configurações.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Query do Google Imagens</Label>
                  <Textarea
                    rows={2}
                    value={editing.google_images_query}
                    onChange={e => setEditing({ ...editing, google_images_query: e.target.value })}
                    placeholder='Ex.: "{{artist}}" "{{album}}" album cover high resolution'
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Disparada pelo botão "Google Imagens" para buscar a capa. Mesmos placeholders da query acima. Vazio = usa fallback baseado em artista/álbum.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Componentes</Label>
                  <Accordion type="multiple" defaultValue={['pauta_completa']} className="rounded-md border">
                    {COMPONENT_KEYS.map((key) => {
                      const meta = COMPONENT_LABELS[key];
                      const value = editing.components[key] || '';
                      const isBuiltin = value.trim() === '__BUILTIN__';
                      const filled = value.trim().length > 0;
                      return (
                        <AccordionItem key={key} value={key} className="border-b last:border-b-0">
                          <AccordionTrigger className="px-3 py-2 hover:no-underline">
                            <div className="flex items-center gap-2 text-sm">
                              <span>{meta.icon}</span>
                              <span className="font-medium">{meta.label}</span>
                              {isBuiltin && <Badge variant="secondary" className="text-[9px] uppercase">built-in</Badge>}
                              {!isBuiltin && filled && <Badge variant="outline" className="text-[9px] uppercase">custom</Badge>}
                              {!filled && <span className="text-[10px] italic text-muted-foreground">— vazio —</span>}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-3 pb-3">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] text-muted-foreground">{meta.hint}</p>
                                <div className="flex gap-1">
                                  {['anniversary','review','news','interview'].includes(editing.topic_type) && ['pauta_completa','capa','titulo','descricao'].includes(key) && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        type="button"
                                        onClick={() => setEditing({
                                          ...editing,
                                          components: { ...editing.components, [key]: '__BUILTIN__' },
                                        })}
                                        title="Usar prompt built-in deste componente"
                                      >
                                        Usar built-in
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        type="button"
                                        onClick={() => {
                                          const tt = getBuiltinComponentText(editing.topic_type as StandaloneTopicType, key as any);
                                          setEditing({
                                            ...editing,
                                            components: { ...editing.components, [key]: tt },
                                          });
                                        }}
                                        title="Copia o texto do built-in para edição livre"
                                      >
                                        Duplicar built-in
                                      </Button>
                                    </>
                                  )}
                                  {filled && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      type="button"
                                      onClick={() => setEditing({
                                        ...editing,
                                        components: { ...editing.components, [key]: '' },
                                      })}
                                      title="Limpar"
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                              {isBuiltin ? (
                                <div className="rounded border border-dashed bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                                  Usando o prompt built-in do Heavynauta para este componente. Clique em <b>Duplicar built-in</b> para customizar.
                                </div>
                              ) : (
                                <Textarea
                                  rows={key === 'pauta_completa' ? 14 : 8}
                                  value={value}
                                  onChange={(e) => setEditing({
                                    ...editing,
                                    components: { ...editing.components, [key]: e.target.value },
                                  })}
                                  className="font-mono text-xs"
                                  placeholder={`Prompt do componente "${meta.label}"…`}
                                />
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                  <p className="text-[11px] text-muted-foreground">
                    Placeholders: <code>{'{{input}}'}</code>, <code>{'{{notes}}'}</code>, <code>{'{{release_block}}'}</code>, <code>{'{{platform_block}}'}</code>, <code>{'{{content}}'}</code>, <code>{'{{title}}'}</code>.
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