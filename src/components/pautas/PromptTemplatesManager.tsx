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
import { Plus, Trash2, Save, X, Lock, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  PromptTemplate,
  TOPIC_TYPE_OPTIONS,
  STAGE_OPTIONS,
  createPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  listPromptTemplates,
} from '@/lib/prompt-templates';
import { getBuiltinTemplateText, getBuiltinStageText } from '@/lib/standalone-prompts';
import { StandaloneTopicType } from '@/lib/types';
import { getQueryTemplate } from '@/lib/google-query-templates';

// Soft per-type tints to make the columns easy to scan.
const TYPE_ACCENT: Record<string, { bar: string; chip: string }> = {
  anniversary: { bar: 'bg-pink-500/70',   chip: 'bg-pink-500/10 text-pink-300 border-pink-500/30' },
  review:      { bar: 'bg-violet-500/70', chip: 'bg-violet-500/10 text-violet-300 border-violet-500/30' },
  news:        { bar: 'bg-amber-500/70',  chip: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  interview:   { bar: 'bg-sky-500/70',    chip: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
  custom:      { bar: 'bg-emerald-500/70',chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: string;
  onChanged?: () => void;
}

export function PromptTemplatesManager({ open, onOpenChange, defaultType, onChanged }: Props) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; name: string; topic_type: string; stage: 'content' | 'title' | 'description' | 'cover'; template_text: string; description: string; google_query: string; google_images_query: string } | null>(null);
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

  const startNew = (presetType?: string, presetStage?: 'content' | 'title' | 'description' | 'cover') => {
    setSelectedId(null);
    const initialType = presetType || defaultType || 'review';
    const initialStage = presetStage || 'content';
    const isStandaloneType = ['anniversary', 'review', 'news', 'interview'].includes(initialType);
    const builtinText = initialStage === 'content'
      ? (isStandaloneType ? getBuiltinTemplateText(initialType as StandaloneTopicType) : '')
      : getBuiltinStageText(initialStage, initialType as StandaloneTopicType);
    const defaultQuery = initialStage === 'content'
      ? (getQueryTemplate(`standalone.${initialType}.with_release`) || '')
      : '';
    setEditing({
      id: null,
      name: '',
      topic_type: initialType,
      stage: initialStage,
      template_text: builtinText,
      description: '',
      google_query: defaultQuery,
      google_images_query: initialStage === 'content' ? '"{{artist}}" "{{album}}" album cover high resolution' : '',
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
      stage: (t.stage || 'content') as any,
      template_text: t.template_text,
      description: t.description || '',
      google_query: t.google_query || '',
      google_images_query: t.google_images_query || '',
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
          stage: editing.stage,
          template_text: editing.template_text,
          description: editing.description,
          google_query: editing.google_query,
          google_images_query: editing.google_images_query,
        });
        toast.success('Prompt atualizado');
      } else {
        await createPromptTemplate({
          name: editing.name.trim(),
          topic_type: editing.topic_type,
          stage: editing.stage,
          template_text: editing.template_text,
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
      .filter(t => t.topic_type === target.topic_type && (t.stage || 'content') === (target.stage || 'content'))
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

  // Group: type -> stage -> items
  const groupedByType = TOPIC_TYPE_OPTIONS.map(opt => ({
    ...opt,
    stages: STAGE_OPTIONS.map(s => ({
      ...s,
      items: templates.filter(t => t.topic_type === opt.value && (t.stage || 'content') === s.value),
    })),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Gerenciar prompts</DialogTitle>
          <DialogDescription>
            Cada tipo de pauta tem seus próprios prompts de Conteúdo, Título, Descrição e Capa. Os "padrão" são built-in (cadeado) — duplique para criar variações.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[340px_1fr] gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">PROMPTS</span>
              <Button size="sm" variant="outline" onClick={() => startNew()}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Novo
              </Button>
            </div>
            <ScrollArea className="h-[65vh] rounded-md border">
              {loading ? (
                <div className="p-3 text-xs text-muted-foreground">Carregando…</div>
              ) : (
                <div className="space-y-4 p-2">
                  {groupedByType.map(g => {
                    const accent = TYPE_ACCENT[g.value] || TYPE_ACCENT.custom;
                    return (
                    <div key={g.value} className="overflow-hidden rounded-md border border-border/40">
                      <div className={`flex items-center gap-2 px-2 py-1.5 ${accent.chip} border-b`}>
                        <span className={`h-2 w-2 rounded-full ${accent.bar}`} />
                        <span className="text-[11px] font-bold uppercase tracking-wide">{g.label}</span>
                      </div>
                      <div className="space-y-2 bg-background/40 p-1.5">
                      {g.stages.map(s => (
                        <div key={s.value} className="space-y-1">
                          <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              <span>{s.icon}</span><span>{s.label}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => startNew(g.value, s.value)}
                              className="rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                              title={`Novo prompt de ${s.label} para ${g.label}`}
                            >
                              + novo
                            </button>
                          </div>
                          {s.items.length === 0 && (
                            <div className="px-2 py-1 text-[11px] italic text-muted-foreground/70">— vazio —</div>
                          )}
                          {s.items.map((t, i) => (
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
                              disabled={i === s.items.length - 1}
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
                    </div>
                    );
                  })}
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
                <div className="grid grid-cols-3 gap-2">
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
                  <div className="space-y-1">
                    <Label>Estágio</Label>
                    <Select
                      value={editing.stage}
                      onValueChange={v => setEditing({ ...editing, stage: v as any })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STAGE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.icon} {o.label}</SelectItem>)}
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
                {editing.stage === 'content' && (
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
                )}
                {editing.stage === 'content' && (
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
                )}
                <div className="space-y-1">
                  <Label>Texto do prompt</Label>
                  <Textarea
                    rows={18}
                    value={editing.template_text}
                    onChange={e => setEditing({ ...editing, template_text: e.target.value })}
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {editing.stage === 'content' ? (
                      <>Placeholders disponíveis: <code>{'{{input}}'}</code>, <code>{'{{notes}}'}</code>, <code>{'{{release_block}}'}</code>, <code>{'{{platform_block}}'}</code></>
                    ) : editing.stage === 'description' ? (
                      <>Placeholders disponíveis: <code>{'{{title}}'}</code>, <code>{'{{content}}'}</code>, <code>{'{{platform_block}}'}</code></>
                    ) : (
                      <>Placeholders disponíveis: <code>{'{{content}}'}</code>, <code>{'{{platform_block}}'}</code></>
                    )}
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