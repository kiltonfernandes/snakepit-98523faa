/**
 * Tabela de Episódios Avulsos.
 *
 * Lista todos os pautas com `is_standalone = true`. Permite filtrar por tipo de
 * bloco, status e busca livre; abrir um modal grande para edição; e remover
 * (com confirmação). Compartilha o mesmo padrão visual das outras tabelas da
 * plataforma (Insumos, Conteúdo, Management).
 */
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Pencil, Trash2, Search, Calendar as CalendarIcon, ExternalLink, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { Pauta, EpisodeMaterial, StandaloneTopic, StandaloneTopicType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge } from '@/components/StatusBadge';
import { STANDALONE_TOPIC_META } from '@/lib/standalone-prompts';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { MarkdownView } from '@/components/shared/MarkdownView';
import { ReleaseLinkBar } from '@/components/shared/ReleaseLinkBar';
import { sanitizeMarkdownOutput } from '@/lib/ai/markdown-sanitize';

const TYPE_FILTERS: { value: 'all' | StandaloneTopicType; label: string }[] = [
  { value: 'all', label: 'Todos os blocos' },
  { value: 'anniversary', label: '🎂 Aniversário' },
  { value: 'review', label: '💿 Review' },
  { value: 'news', label: '📰 Notícia' },
  { value: 'interview', label: '🎙️ Entrevista' },
];

interface EditingState {
  pauta: Pauta;
  material: EpisodeMaterial | undefined;
}

export function StandaloneEpisodesTable({ onCreateNew }: { onCreateNew: () => void }) {
  const { pautas, materials, deletePauta, updatePauta, updateMaterial } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | StandaloneTopicType>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);

  const standalonePautas = useMemo(
    () => pautas.filter(p => p.is_standalone),
    [pautas],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return standalonePautas.filter(p => {
      const topics = (p.standalone_topics || []) as StandaloneTopic[];
      if (typeFilter !== 'all' && !topics.some(t => t.type === typeFilter)) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (q) {
        const haystack = `${p.publication_date} ${topics.map(t => `${t.type} ${t.url || ''} ${t.notes}`).join(' ')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => a.publication_date.localeCompare(b.publication_date));
  }, [standalonePautas, typeFilter, statusFilter, search]);

  const materialFor = (p: Pauta) => materials.find(m => m.source_pauta_id === p.id);

  const handleDelete = (id: string) => {
    deletePauta(id);
    toast.success('Episódio avulso removido');
    setConfirmDeleteId(null);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por data, URL ou notas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TYPE_FILTERS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="pesquisa">Pesquisa</SelectItem>
            <SelectItem value="revisao">Revisão</SelectItem>
            <SelectItem value="criando_materiais">Criando materiais</SelectItem>
            <SelectItem value="pronto_gravar">Pronto para gravar</SelectItem>
            <SelectItem value="pronto_agendar">Pronto para agendar</SelectItem>
            <SelectItem value="agendado">Agendado</SelectItem>
            <SelectItem value="publicado">Publicado</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-muted-foreground">
          {filtered.length} episódio{filtered.length === 1 ? '' : 's'}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhum episódio avulso ainda.</p>
          <Button className="mt-3" onClick={onCreateNew}>+ Nova Pauta</Button>
        </div>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Data</TableHead>
                <TableHead>Blocos</TableHead>
                <TableHead className="w-36">Status</TableHead>
                <TableHead className="w-44">Completude</TableHead>
                <TableHead className="w-28 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => {
                const topics = (p.standalone_topics || []) as StandaloneTopic[];
                const mat = materialFor(p);
                const hasTitle = mat?.selected_title_index != null;
                const hasDesc = !!mat?.description_html;
                const hasCover = !!mat?.cover_url;
                const hasUpload = !!(mat?.repository_url || mat?.repository_file_id);
                return (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => setEditing({ pauta: p, material: mat })}
                  >
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                        {format(new Date(p.publication_date + 'T12:00:00'), 'dd MMM yyyy', { locale: ptBR })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {topics.map(t => (
                          <Badge key={t.id} variant="secondary" className="font-normal">
                            {STANDALONE_TOPIC_META[t.type].icon} {STANDALONE_TOPIC_META[t.type].label}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={p.status as any} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1 text-[10px]">
                        <Indicator on={topics.every(t => !!t.response_text?.trim())} label="P" title="Pauta" />
                        <Indicator on={hasTitle} label="T" title="Título" />
                        <Indicator on={hasDesc} label="D" title="Descrição" />
                        <Indicator on={hasCover} label="C" title="Capa" />
                        <Indicator on={hasUpload} label="↑" title="Upload" />
                      </div>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (!mat) {
                            toast.info('Material ainda não disponível. Recarregue a página.');
                            return;
                          }
                          navigate(`/calendar?material=${mat.id}`);
                        }}
                        title="Visualizar (Pacote do episódio)"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditing({ pauta: p, material: mat })} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setConfirmDeleteId(p.id)} title="Excluir">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={(v) => !v && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir episódio avulso?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove a pauta e o material associado. Não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit modal */}
      {editing && (
        <StandaloneEpisodeEditor
          state={editing}
          onClose={() => setEditing(null)}
          onSavePauta={(patch) => updatePauta(editing.pauta.id, patch)}
          onSaveMaterial={(patch) => editing.material && updateMaterial(editing.material.id, patch)}
        />
      )}
    </div>
  );
}

function Indicator({ on, label, title }: { on: boolean; label: string; title: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold",
        on ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

// ─── Editor modal (large) ───────────────────────────────────────────────────

function StandaloneEpisodeEditor({
  state, onClose, onSavePauta, onSaveMaterial,
}: {
  state: EditingState;
  onClose: () => void;
  onSavePauta: (p: Partial<Pauta>) => void;
  onSaveMaterial: (m: Partial<EpisodeMaterial>) => void;
}) {
  const { pauta, material } = state;
  const { releases } = useApp();
  const topics = (pauta.standalone_topics || []) as StandaloneTopic[];
  const [editedTopics, setEditedTopics] = useState<StandaloneTopic[]>(topics);
  const [pubDate, setPubDate] = useState(pauta.publication_date);
  const [descHtml, setDescHtml] = useState(material?.description_html || '');
  const [coverUrl, setCoverUrl] = useState(material?.cover_url || '');
  const [spotify, setSpotify] = useState(material?.spotify_link || '');
  const titleIndex = material?.selected_title_index;
  const selectedTitle = titleIndex != null ? material?.title_options_json?.[titleIndex]?.text : '';

  const save = () => {
    onSavePauta({
      publication_date: pubDate,
      standalone_topics: editedTopics,
      sections_json: Object.fromEntries(
        editedTopics.map(t => [`standalone_${t.type}`, (t.parsed_text || t.response_text || '').trim()]),
      ) as any,
      rendered_text: editedTopics.map(t => `## ${STANDALONE_TOPIC_META[t.type].label}\n${t.response_text || ''}`).join('\n\n'),
    });
    if (material) {
      onSaveMaterial({
        episode_date: pubDate,
        description_html: descHtml,
        cover_url: coverUrl || null,
        spotify_link: spotify || null,
      });
    }
    toast.success('Alterações salvas');
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[1200px] w-[95vw] h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Editar episódio avulso · {pauta.publication_date}</DialogTitle>
          <DialogDescription>
            {selectedTitle ? <span><b>Título:</b> {selectedTitle}</span> : <span className="text-muted-foreground">Sem título escolhido.</span>}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-6">
          <div className="mx-auto max-w-4xl space-y-6">
            <div className="space-y-2 rounded-md border border-border p-4">
              <Label className="text-xs">Data de publicação</Label>
              <Input
                type="date"
                value={pubDate}
                onChange={(e) => setPubDate(e.target.value)}
                className="w-48"
              />
            </div>
            {editedTopics.map((t, i) => (
              <div key={t.id} className="space-y-3 rounded-md border border-border p-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{STANDALONE_TOPIC_META[t.type].icon}</span>
                  <h4 className="font-semibold">{STANDALONE_TOPIC_META[t.type].label}</h4>
                </div>
                {STANDALONE_TOPIC_META[t.type].inputKind === 'url' && (
                  <div className="space-y-1">
                    <Label className="text-xs">URL</Label>
                    <Input
                      value={t.url || ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditedTopics(prev => prev.map((x, idx) => idx === i ? { ...x, url: v } : x));
                      }}
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Notas / direção</Label>
                  <Textarea
                    rows={2}
                    value={t.notes}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEditedTopics(prev => prev.map((x, idx) => idx === i ? { ...x, notes: v } : x));
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Resposta da IA</Label>
                  <Textarea
                    rows={6}
                    value={t.response_text}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEditedTopics(prev => prev.map((x, idx) => idx === i ? { ...x, response_text: v, parsed_text: v.trim() } : x));
                    }}
                  />
                </div>
              </div>
            ))}

            <div className="space-y-2">
              <Label>Descrição (HTML)</Label>
              <Textarea rows={6} value={descHtml} onChange={(e) => setDescHtml(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>URL da capa</Label>
                <Input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} />
                {coverUrl && <img src={coverUrl} alt="" className="mt-2 h-32 w-32 rounded border border-border object-cover" />}
              </div>
              <div className="space-y-2">
                <Label>Link Spotify (quando agendado)</Label>
                <Input value={spotify} onChange={(e) => setSpotify(e.target.value)} />
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border px-6 py-3">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={save}>Salvar alterações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
