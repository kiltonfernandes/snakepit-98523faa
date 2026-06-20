/**
 * Nova Pauta Wizard — fluxo guiado para criar episódios avulsos.
 *
 * Etapas:
 *  0. Escolher tópicos (multiselect: aniversário, review, notícia, entrevista)
 *  1..N. Uma etapa por tópico (input + prompt + copiar + colar)
 *  N+1. Título (3 opções)
 *  N+2. Descrição (HTML simples)
 *  N+3. Capa (URL ou direção visual)
 *  N+4. Revisão + salvar
 *
 * O wizard cria (ou reaproveita) uma "semana sintética" mensal com id
 * `standalone-YYYY-MM` para satisfazer o NOT NULL de `pautas.week_id` sem
 * poluir o carrossel semanal — a página de Pautas filtra esses IDs.
 */
import { useEffect, useMemo, useReducer, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Plus, Copy, Check, Trash2, ChevronLeft, ChevronRight, Loader2,
  Calendar as CalendarIcon, X, Search, Download, RefreshCw, ExternalLink,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { renderQueryTemplate, hasQueryTemplateOverride, type QueryTemplateKey } from '@/lib/google-query-templates';
import { useApp } from '@/contexts/AppContext';
import { useAiCallProgress } from '@/contexts/AiCallProgressContext';
import { streamGeneratePauta } from '@/lib/ai/openrouter-client';
import { Release, Pauta, EpisodeMaterial, StandaloneTopic, StandaloneTopicType, TitleOption, DaySlot } from '@/lib/types';
import {
  STANDALONE_TOPIC_META,
  getStandaloneTopicPrompt,
  getStandaloneTitlePrompt,
  getStandaloneDescriptionPrompt,
  getStandaloneCoverPrompt,
  buildReleaseBlock,
} from '@/lib/standalone-prompts';
import { generateCoverImage } from '@/lib/cover-generator';
import { Sparkles, Settings2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { usePromptTemplates, PromptTemplate, getComponentPrompt } from '@/lib/prompt-templates';
import { PromptTemplatesManager } from './PromptTemplatesManager';
import { MarkdownView } from '@/components/shared/MarkdownView';
import { ReleaseLinkBar } from '@/components/shared/ReleaseLinkBar';
import { sanitizeMarkdownOutput } from '@/lib/ai/markdown-sanitize';

const DRAFT_KEY = 'nova_pauta_draft_v1';
const TOPIC_ORDER: StandaloneTopicType[] = ['anniversary', 'review', 'news', 'interview'];

// ─── Wizard state ───────────────────────────────────────────────────────────

interface WizardState {
  step: number;
  selectedTypes: StandaloneTopicType[];
  topics: StandaloneTopic[];
  publicationDate: string; // YYYY-MM-DD
  titleResponse: string;
  titleOptions: TitleOption[];
  selectedTitleIndex: number | null;
  descriptionResponse: string;
  descriptionHtml: string;
  coverUrl: string;
  coverSourceUrl: string;
}

const initialState = (): WizardState => ({
  step: 0,
  selectedTypes: [],
  topics: [],
  publicationDate: new Date().toISOString().slice(0, 10),
  titleResponse: '',
  titleOptions: [],
  selectedTitleIndex: null,
  descriptionResponse: '',
  descriptionHtml: '',
  coverUrl: '',
  coverSourceUrl: '',
});

type Action =
  | { kind: 'reset' }
  | { kind: 'hydrate'; state: WizardState }
  | { kind: 'setStep'; step: number }
  | { kind: 'toggleType'; type: StandaloneTopicType }
  | { kind: 'patchTopic'; id: string; patch: Partial<StandaloneTopic> }
  | { kind: 'setField'; field: keyof WizardState; value: any };

function reducer(state: WizardState, action: Action): WizardState {
  switch (action.kind) {
    case 'reset': return initialState();
    case 'hydrate': return action.state;
    case 'setStep': return { ...state, step: Math.max(0, action.step) };
    case 'toggleType': {
      const has = state.selectedTypes.includes(action.type);
      const selectedTypes = has
        ? state.selectedTypes.filter(t => t !== action.type)
        : [...state.selectedTypes, action.type];
      // Keep topics in stable order matching selection list
      const orderedTypes = TOPIC_ORDER.filter(t => selectedTypes.includes(t));
      const existing = new Map(state.topics.map(t => [t.type, t]));
      const topics: StandaloneTopic[] = orderedTypes.map(t =>
        existing.get(t) ?? {
          id: crypto.randomUUID(),
          type: t,
          release_id: null,
          url: '',
          notes: '',
          prompt_text: '',
          response_text: '',
          parsed_text: null,
          parse_warnings: [],
          target_words: 500,
        },
      );
      return { ...state, selectedTypes: orderedTypes, topics };
    }
    case 'patchTopic':
      return {
        ...state,
        topics: state.topics.map(t => (t.id === action.id ? { ...t, ...action.patch } : t)),
      };
    case 'setField':
      return { ...state, [action.field]: action.value } as WizardState;
    default: return state;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function standaloneWeekIdFor(dateStr: string): string {
  return `standalone-${dateStr.slice(0, 7)}`; // YYYY-MM
}

function standaloneWeekStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

function parseTitleOptionsFromText(raw: string): TitleOption[] {
  const STYLES: TitleOption['style'][] = ['clickbait', 'curiosidade', 'impacto'];
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const cleaned = lines.map(l => l.replace(/^[-*•\d.\)\s]+/, '').replace(/^["'`]|["'`]$/g, '').trim()).filter(Boolean);
  return cleaned.slice(0, 3).map((text, i) => ({ text, style: STYLES[i] ?? 'impacto' }));
}

function plainTextResponseFor(t: StandaloneTopic): string {
  // For topics we just take the pasted response as the editorial content.
  // (No snakepit contract parsing here — the wizard prompts are free-form.)
  return (t.parsed_text || t.response_text || '').trim();
}

function aggregatedContent(topics: StandaloneTopic[], releases: Release[] = []): string {
  return topics.map(t => {
    const meta = STANDALONE_TOPIC_META[t.type];
    const body = plainTextResponseFor(t);
    const ref = t.release_id ? releases.find(r => r.id === t.release_id) : null;
    const refBlock = ref
      ? `\n[Release vinculado]\n${buildReleaseBlock(ref)}\n`
      : t.url
        ? `\n[Link de origem] ${t.url}\n`
        : '';
    return `## ${meta.label}${refBlock}\n${body || '(sem conteúdo gerado)'}`;
  }).join('\n\n');
}

function descriptionHtmlFromResponse(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/<\w+/.test(trimmed)) return trimmed; // already HTML
  // Convert paragraphs/bullets minimally.
  return trimmed.split(/\n\s*\n/).map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');
}

/** Counts words in plain editorial text (strips markdown punctuation). */
function countWords(text: string): number {
  if (!text) return 0;
  const clean = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~\-\[\]\(\)!]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 0;
  return clean.split(' ').filter(Boolean).length;
}

/** Returns true when the word count is inside ±15% of target. */
function isWithinTarget(words: number, target: number): boolean {
  if (!target) return true;
  const min = Math.round(target * 0.85);
  const max = Math.round(target * 1.15);
  return words >= min && words <= max;
}

/**
 * After a draft is generated, if it's outside ±15% of the target, fires a
 * single follow-up call asking the model to rewrite to the exact target.
 */
async function enforceLengthOnce(opts: {
  text: string;
  targetWords: number;
  basePrompt: string;
  bannedTerms: string[];
  temperature?: number;
  progress?: any;
  onChunk: (full: string) => void;
}): Promise<string> {
  const current = countWords(opts.text);
  if (isWithinTarget(current, opts.targetWords)) return opts.text;
  const direction = current < opts.targetWords ? 'EXPANDIR' : 'CONDENSAR';
  const fixPrompt = [
    `Reescreva a pauta abaixo para ter EXATAMENTE ~${opts.targetWords} palavras (faixa aceitável: ${Math.round(opts.targetWords * 0.9)}–${Math.round(opts.targetWords * 1.1)}).`,
    `A versão atual tem ${current} palavras — você deve ${direction}.`,
    'Mantenha o mesmo tom, estrutura, cabeçalhos e blocos fixos (SEGWAY, links, listas).',
    'Devolva APENAS a pauta reescrita em Markdown puro, sem comentários nem meta-informação.',
    '',
    '---',
    'CONTEXTO ORIGINAL DO PROMPT (para você não perder a voz/regras):',
    opts.basePrompt,
    '',
    '---',
    'PAUTA ATUAL (a ser reescrita):',
    opts.text,
  ].join('\n');
  try {
    const fixed = await streamGeneratePauta({
      prompt: fixPrompt,
      bannedTerms: opts.bannedTerms,
      temperature: opts.temperature,
      webSearch: false,
      label: `Ajustando extensão (~${opts.targetWords} palavras)`,
      progress: opts.progress,
      onChunk: opts.onChunk,
    });
    const finalCount = countWords(fixed);
    if (!isWithinTarget(finalCount, opts.targetWords)) {
      toast.warning(`Pauta gerada com ${finalCount} palavras (alvo ${opts.targetWords}). Considere ajustar manualmente.`);
    } else {
      toast.success(`Pauta ajustada para ${finalCount} palavras.`);
    }
    return fixed;
  } catch (e) {
    toast.warning(`Não foi possível ajustar extensão (${current}/${opts.targetWords} palavras).`);
    return opts.text;
  }
}

// Build a granular Google query per topic type, using release + notes + URL.
function buildGoogleQuery(topic: StandaloneTopic, release: Release | null | undefined, customQuery?: string | null): string {
  const notes = (topic.notes || '').trim();
  const url = (topic.url || '').trim();
  let host = '';
  try { if (url) host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
  const slug = url ? url.split('/').filter(Boolean).slice(-1)[0]?.replace(/[-_]+/g, ' ').replace(/\.\w+$/, '') : '';
  const type = topic.type;

  const renderWith = (tpl: string, vars: Record<string, string>) => {
    const out = tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, n) => (vars[n] ?? ''));
    return out.replace(/\s+/g, ' ').trim();
  };

  if (release) {
    const year = release.release_date?.slice(0, 4) || '';
    const vars = {
      artist: release.artist,
      album: release.album,
      year,
      notes,
    } as Record<string, string>;
    // Priority: user override in Settings → per-template google_query → built-in default.
    const key = `standalone.${type}.with_release` as QueryTemplateKey;
    if (hasQueryTemplateOverride(key)) return renderQueryTemplate(key, vars);
    if (customQuery && customQuery.trim()) return renderWith(customQuery, vars);
    return renderQueryTemplate(key, vars);
  }

  // No release: require some context (slug or notes for most types).
  if (!slug && !notes && !host) return '';
  const vars = { slug: slug || '', notes, host } as Record<string, string>;
  const key = `standalone.${type}.url` as QueryTemplateKey;
  if (hasQueryTemplateOverride(key)) return renderQueryTemplate(key, vars);
  if (customQuery && customQuery.trim()) return renderWith(customQuery, vars);
  return renderQueryTemplate(key, vars);
}

function buildGoogleImagesQuery(topic: StandaloneTopic, release: Release | null | undefined, customQuery?: string | null): string {
  const notes = (topic.notes || '').trim();
  const url = (topic.url || '').trim();
  let host = '';
  try { if (url) host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
  const slug = url ? url.split('/').filter(Boolean).slice(-1)[0]?.replace(/[-_]+/g, ' ').replace(/\.\w+$/, '') : '';
  const renderWith = (tpl: string, vars: Record<string, string>) => {
    const out = tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, n) => (vars[n] ?? ''));
    return out.replace(/\s+/g, ' ').trim();
  };
  const vars: Record<string, string> = release
    ? { artist: release.artist, album: release.album, year: release.release_date?.slice(0, 4) || '', notes, slug, host }
    : { artist: '', album: '', year: '', notes, slug, host };
  if (customQuery && customQuery.trim()) return renderWith(customQuery, vars);
  // Fallback default
  if (release) return `"${release.artist}" "${release.album}" album cover high resolution`;
  if (slug || notes) return `${[slug, notes].filter(Boolean).join(' ')} album cover high resolution`.trim();
  return '';
}

// ─── Inline Add Release form ────────────────────────────────────────────────

function AddReleaseInline({ onCreated, onCancel }: { onCreated: (r: Release) => void; onCancel: () => void }) {
  const { addRelease, releases } = useApp();
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [releaseDate, setReleaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [country, setCountry] = useState('');
  const [genre, setGenre] = useState('');
  const submit = () => {
    if (!artist.trim() || !album.trim()) {
      toast.error('Artista e álbum são obrigatórios');
      return;
    }
    addRelease({
      artist: artist.trim(),
      album: album.trim(),
      release_date: releaseDate,
      country: country.trim() || null,
      genres: genre.trim() ? [genre.trim()] : [],
      rating: null,
      comments: null,
    } as any);
    // The release will be inserted into context; find the freshly added one by artist+album+date
    setTimeout(() => {
      const created = [...releases].reverse().find(r => r.artist === artist.trim() && r.album === album.trim());
      if (created) onCreated(created);
      else onCancel(); // fallback: close form, user picks via search
    }, 50);
  };
  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <div className="text-xs font-semibold text-muted-foreground">+ Novo lançamento</div>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Artista" value={artist} onChange={(e) => setArtist(e.target.value)} />
        <Input placeholder="Álbum" value={album} onChange={(e) => setAlbum(e.target.value)} />
        <Input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
        <Input placeholder="País (opcional)" value={country} onChange={(e) => setCountry(e.target.value)} />
        <Input placeholder="Gênero (opcional)" value={genre} onChange={(e) => setGenre(e.target.value)} className="col-span-2" />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={submit}>Adicionar</Button>
      </div>
    </div>
  );
}

// ─── Release picker (search + select) ───────────────────────────────────────

function ReleasePicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { releases } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const selected = releases.find(r => r.id === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return releases.slice(0, 40);
    return releases.filter(r =>
      r.artist.toLowerCase().includes(q) || r.album.toLowerCase().includes(q),
    ).slice(0, 40);
  }, [releases, query]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="flex-1 justify-start font-normal">
              {selected ? (
                <span className="truncate"><b>{selected.artist}</b> — {selected.album}</span>
              ) : (
                <span className="text-muted-foreground">Buscar disco em releases…</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[480px] p-0" align="start">
            <div className="border-b border-border p-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Buscar por artista ou álbum..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-8 pl-7"
                />
              </div>
            </div>
            <ScrollArea className="max-h-80">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">Nenhum release encontrado.</div>
              ) : (
                <div className="divide-y divide-border">
                  {filtered.map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => { onChange(r.id); setOpen(false); }}
                      className={cn(
                        "block w-full px-3 py-2 text-left text-sm hover:bg-muted",
                        r.id === value && "bg-muted",
                      )}
                    >
                      <div className="font-medium">{r.artist} — {r.album}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.release_date} {r.country ? `· ${r.country}` : ''} {r.genres?.length ? `· ${r.genres[0]}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>
        <Button variant="outline" size="icon" title="Novo lançamento" onClick={() => setShowAddForm(s => !s)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {showAddForm && (
        <AddReleaseInline
          onCreated={(r) => { onChange(r.id); setShowAddForm(false); }}
          onCancel={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}

// ─── Copy + paste reusable card ─────────────────────────────────────────────

function CopyButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled || !text}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success('Prompt copiado');
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
      Copiar prompt
    </Button>
  );
}

// Generic copy/export toolbar for any block of text (prompts, parsed responses, audit dumps).
function downloadTextFile(filename: string, text: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

function CopyExportRow({
  text, filename, label = 'Copiar', exportLabel = 'Exportar', disabled,
}: {
  text: string;
  filename: string;
  label?: string;
  exportLabel?: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const empty = !text?.trim();
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || empty}
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          toast.success(`${label} — copiado`);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
        {label}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || empty}
        onClick={() => { downloadTextFile(filename, text); toast.success(`Exportado: ${filename}`); }}
      >
        <Download className="mr-1 h-3.5 w-3.5" />
        {exportLabel}
      </Button>
    </div>
  );
}

// Build the full audit text — every prompt + parsed response for the episode.
function buildAuditText(
  state: WizardState,
  releases: Release[] = [],
  settings: Partial<import('@/lib/types').AppSettings> | null = null,
): string {
  const lines: string[] = [];
  lines.push(`# Auditoria — Episódio Avulso`);
  lines.push(`Data de publicação: ${state.publicationDate}`);
  lines.push(`Blocos: ${state.topics.length}`);
  lines.push('');
  state.topics.forEach((t, i) => {
    const meta = STANDALONE_TOPIC_META[t.type];
    lines.push(`────────────────────────────────────────`);
    lines.push(`## Bloco ${i + 1} — ${meta.icon} ${meta.label}`);
    if (t.url) lines.push(`URL: ${t.url}`);
    if (t.release_id) lines.push(`Release ID: ${t.release_id}`);
    const ref = t.release_id ? releases.find(r => r.id === t.release_id) : null;
    if (ref) {
      lines.push(`Release vinculado:`);
      lines.push(buildReleaseBlock(ref));
    }
    if (t.notes) lines.push(`Notas: ${t.notes}`);
    lines.push('');
    lines.push(`### Prompt`);
    lines.push(t.prompt_text || '(vazio)');
    lines.push('');
    lines.push(`### Resposta registrada`);
    lines.push(t.response_text || '(vazio)');
    lines.push('');
  });
  // Material prompts
  const aggregated = aggregatedContent(state.topics, releases);
  lines.push(`────────────────────────────────────────`);
  lines.push(`## Título`);
  lines.push(`### Prompt`);
  lines.push(getStandaloneTitlePrompt(aggregated, settings));
  lines.push('');
  lines.push(`### Opções coladas`);
  lines.push(state.titleResponse || '(vazio)');
  lines.push('');
  lines.push(`Selecionado: ${state.selectedTitleIndex != null ? state.titleOptions[state.selectedTitleIndex]?.text : '(nenhum)'}`);
  lines.push('');
  const title = state.selectedTitleIndex != null ? state.titleOptions[state.selectedTitleIndex]?.text || '' : '';
  lines.push(`────────────────────────────────────────`);
  lines.push(`## Descrição`);
  lines.push(`### Prompt`);
  lines.push(getStandaloneDescriptionPrompt(title, aggregated, settings));
  lines.push('');
  lines.push(`### HTML registrado`);
  lines.push(state.descriptionHtml || '(vazio)');
  lines.push('');
  lines.push(`────────────────────────────────────────`);
  lines.push(`## Capa`);
  lines.push(`### Prompt visual`);
  lines.push(getStandaloneCoverPrompt(aggregated, settings));
  lines.push('');
  lines.push(`URL: ${state.coverUrl || '(vazia)'}`);
  return lines.join('\n');
}

// ─── Topic step ─────────────────────────────────────────────────────────────

function TopicStep({
  topic, dispatch, state,
}: { topic: StandaloneTopic; dispatch: React.Dispatch<Action>; state: WizardState }) {
  const meta = STANDALONE_TOPIC_META[topic.type];
  const { releases, settings } = useApp();
  const selectedRelease = topic.release_id ? releases.find(r => r.id === topic.release_id) : null;
  const { allTemplates, refresh } = usePromptTemplates();
  // Show templates for this topic type + generic 'custom' ones.
  const allChoices: PromptTemplate[] = useMemo(
    () => allTemplates.filter(t => t.topic_type === topic.type || t.topic_type === 'custom'),
    [allTemplates, topic.type],
  );
  const [managerOpen, setManagerOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateIdState] = useState<string>(topic.template_id || '');
  const setSelectedTemplateId = (id: string) => {
    setSelectedTemplateIdState(id);
    dispatch({ kind: 'patchTopic', id: topic.id, patch: { template_id: id || null } });
  };
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [autoSearching, setAutoSearching] = useState(false);
  const [generatingPauta, setGeneratingPauta] = useState(false);
  const aiProgressTopic = useAiCallProgress();

  // "Gerar tudo" toggle — persisted across sessions.
  const [generateAll, setGenerateAll] = useState<boolean>(() => {
    try { return localStorage.getItem('pauta_wizard_gerar_tudo') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('pauta_wizard_gerar_tudo', generateAll ? '1' : '0'); } catch {}
  }, [generateAll]);

  // Auto-select default template for this type once loaded.
  useEffect(() => {
    if (selectedTemplateId) return;
    const def = allChoices.find(t => t.is_default && t.topic_type === topic.type)
      ?? allChoices.find(t => t.topic_type === topic.type)
      ?? allChoices[0];
    if (def) setSelectedTemplateId(def.id);
  }, [allChoices, selectedTemplateId, topic.type]);

  const selectedTemplate = allChoices.find(t => t.id === selectedTemplateId) || null;

  // Build the prompt from default + current inputs (only when prompt is empty / autogenerated)
  const inputLabel = meta.inputKind === 'release'
    ? selectedRelease
      ? `${selectedRelease.artist} — ${selectedRelease.album} (${selectedRelease.release_date}${selectedRelease.country ? `, ${selectedRelease.country}` : ''})`
      : ''
    : topic.url || '';

  // Track auto-generated prompt locally so we only overwrite when the user
  // hasn't manually edited the prompt.
  const [lastAuto, setLastAuto] = useState<string>('');
  useEffect(() => {
    const fresh = getStandaloneTopicPrompt(topic.type, {
      input: inputLabel,
      notes: topic.notes,
      release: selectedRelease,
      platform: settings,
      targetWords: topic.target_words ?? 500,
    }, getComponentPrompt(selectedTemplate, 'pauta_completa') || selectedTemplate?.template_text);
    if (!topic.prompt_text || topic.prompt_text === lastAuto) {
      setLastAuto(fresh);
      dispatch({ kind: 'patchTopic', id: topic.id, patch: { prompt_text: fresh } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputLabel, topic.notes, topic.type, topic.target_words, selectedRelease?.id, settings.banned_terms_text, settings.brand_tone_temperature, selectedTemplateId]);

  const regeneratePrompt = () => {
    const notes = (topic.notes || '').trim();
    if (!notes) {
      toast.error('Sem notas para anexar — preencha a Direção editorial / notas');
      return;
    }
    const current = topic.prompt_text || '';
    const marker = '## Direção editorial adicional';
    const appendBlock = `\n\n${marker}\n${notes}\n`;
    // Replace previous appended block if present, otherwise append.
    const idx = current.indexOf(marker);
    const next = idx >= 0
      ? current.slice(0, idx).replace(/\s+$/, '') + appendBlock
      : current.replace(/\s+$/, '') + appendBlock;
    dispatch({ kind: 'patchTopic', id: topic.id, patch: { prompt_text: next } });
    toast.success('Notas anexadas ao final do prompt');
  };

  const googleQuery = buildGoogleQuery(topic, selectedRelease, selectedTemplate?.google_query);
  const googleImagesQuery = buildGoogleImagesQuery(topic, selectedRelease, selectedTemplate?.google_images_query);
  const openGoogle = () => {
    if (!googleQuery) {
      toast.error('Preencha o input para gerar a query');
      return;
    }
    const url = `https://www.google.com/search?q=${encodeURIComponent(googleQuery)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const runAutoSearch = async () => {
    if (!googleQuery) {
      toast.error('Preencha o input para gerar a query');
      return;
    }
    setAutoSearching(true);
    aiProgressTopic.start('Pesquisa automática (web)');
    aiProgressTopic.pushAttempt({ model: 'deepseek/deepseek-v4-flash', status: 'trying' });
    aiProgressTopic.setStage('streaming');
    try {
      const { data, error } = await supabase.functions.invoke('web-research', {
        body: { query: googleQuery, context: topic.notes || '' },
      });
      if (error) throw error;
      const notes = (data as any)?.notes as string | undefined;
      if (!notes) throw new Error('Resposta vazia da IA');
      aiProgressTopic.pushAttempt({ model: 'deepseek/deepseek-v4-flash', status: 'selected' });
      aiProgressTopic.setStage('populating');
      const prev = (topic.notes || '').trim();
      const merged = prev
        ? `${prev}\n\n---\n## Pesquisa automática (DeepSeek + web search)\n${notes}`
        : `## Pesquisa automática (DeepSeek + web search)\n${notes}`;
      dispatch({ kind: 'patchTopic', id: topic.id, patch: { notes: merged } });
      aiProgressTopic.finish(null);
      toast.success('Pesquisa concluída — notas atualizadas');
      setSearchModalOpen(false);
    } catch (e: any) {
      aiProgressTopic.finish(e?.message || 'Falha na pesquisa');
      toast.error(e?.message || 'Falha na pesquisa automática');
    } finally {
      setAutoSearching(false);
    }
  };
  const openGoogleImages = () => {
    if (!googleImagesQuery) {
      toast.error('Preencha o input para gerar a query de imagens');
      return;
    }
    const url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(googleImagesQuery)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const onPaste = (val: string) => {
    const clean = sanitizeMarkdownOutput(val);
    dispatch({
      kind: 'patchTopic',
      id: topic.id,
      patch: { response_text: clean, parsed_text: clean.trim() },
    });
  };

  const generatePautaWithAI = async () => {
    const prompt = (topic.prompt_text || '').trim();
    if (!prompt) {
      toast.error('Prompt vazio — preencha antes de gerar.');
      return;
    }
    setGeneratingPauta(true);
    onPaste('');
    try {
      const target = topic.target_words ?? 0;
      const bannedTerms = settings.banned_terms_text ? settings.banned_terms_text.split('\n').filter(Boolean) : [];
      const temperature = typeof settings.brand_tone_temperature === 'number' ? settings.brand_tone_temperature / 100 : undefined;
      let full = await streamGeneratePauta({
        prompt,
        bannedTerms,
        temperature,
        webSearch: false,
        label: 'Gerando pauta',
        progress: aiProgressTopic,
        onChunk: (full) => onPaste(full),
      });
      if (target > 0) {
        full = await enforceLengthOnce({
          text: full,
          targetWords: target,
          basePrompt: prompt,
          bannedTerms,
          temperature,
          progress: aiProgressTopic,
          onChunk: (txt) => onPaste(txt),
        });
      }
      toast.success('Pauta gerada');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao gerar pauta');
    } finally {
      setGeneratingPauta(false);
    }
  };

  // ─── Gerar tudo: pesquisa → prompt → pauta → títulos → descrição ─────────
  const runGenerateAll = async () => {
    if (!topic.prompt_text?.trim() && !googleQuery && !topic.notes?.trim()) {
      toast.error('Sem contexto suficiente para gerar tudo.');
      return;
    }
    setGeneratingPauta(true);
    aiProgressTopic.start('Gerar tudo — pipeline completa');
    try {
      // 1. Pesquisa web (best effort — não bloqueia se faltar query)
      let mergedNotes = topic.notes || '';
      if (googleQuery) {
        aiProgressTopic.setStage('streaming');
        aiProgressTopic.pushAttempt({ model: 'deepseek/deepseek-v4-flash (web search)', status: 'trying' });
        try {
          const { data, error } = await supabase.functions.invoke('web-research', {
            body: { query: googleQuery, context: topic.notes || '' },
          });
          if (error) throw error;
          const notes = (data as any)?.notes as string | undefined;
          if (notes) {
            aiProgressTopic.pushAttempt({ model: 'deepseek/deepseek-v4-flash (web search)', status: 'selected' });
            const prev = (topic.notes || '').trim();
            mergedNotes = prev
              ? `${prev}\n\n---\n## Pesquisa automática (DeepSeek + web search)\n${notes}`
              : `## Pesquisa automática (DeepSeek + web search)\n${notes}`;
            dispatch({ kind: 'patchTopic', id: topic.id, patch: { notes: mergedNotes } });
          }
        } catch (e: any) {
          aiProgressTopic.pushAttempt({ model: 'deepseek/deepseek-v4-flash (web search)', status: 'failed', reason: e?.message || 'falha' });
          // segue mesmo sem pesquisa
        }
      }

      // 2. Atualiza prompt anexando as notas (se houver)
      let promptToUse = topic.prompt_text || '';
      const notesTrim = mergedNotes.trim();
      if (notesTrim) {
        const marker = '## Direção editorial adicional';
        const appendBlock = `\n\n${marker}\n${notesTrim}\n`;
        const idx = promptToUse.indexOf(marker);
        promptToUse = idx >= 0
          ? promptToUse.slice(0, idx).replace(/\s+$/, '') + appendBlock
          : promptToUse.replace(/\s+$/, '') + appendBlock;
        dispatch({ kind: 'patchTopic', id: topic.id, patch: { prompt_text: promptToUse } });
      }

      // 3. Gerar pauta
      onPaste('');
      const bannedTerms = settings.banned_terms_text ? settings.banned_terms_text.split('\n').filter(Boolean) : [];
      const temperature = typeof settings.brand_tone_temperature === 'number' ? settings.brand_tone_temperature / 100 : undefined;
      let pautaFull = await streamGeneratePauta({
        prompt: promptToUse,
        bannedTerms,
        temperature,
        webSearch: false,
        label: 'Gerar tudo — pauta',
        progress: aiProgressTopic,
        onChunk: (full) => onPaste(full),
      });
      const target = topic.target_words ?? 0;
      if (target > 0) {
        pautaFull = await enforceLengthOnce({
          text: pautaFull,
          targetWords: target,
          basePrompt: promptToUse,
          bannedTerms,
          temperature,
          progress: aiProgressTopic,
          onChunk: (txt) => onPaste(txt),
        });
      }

      // Build aggregated content with the freshly-generated pauta for this topic.
      const updatedTopics = state.topics.map(t =>
        t.id === topic.id
          ? { ...t, notes: mergedNotes, prompt_text: promptToUse, response_text: pautaFull, parsed_text: pautaFull.trim() }
          : t
      );
      const content = aggregatedContent(updatedTopics, releases);

      // 4. Gerar títulos
      const titleOverride = getComponentPrompt(selectedTemplate, 'titulo');
      const titlePrompt = getStandaloneTitlePrompt(content, settings, titleOverride);
      dispatch({ kind: 'setField', field: 'titleResponse', value: '' });
      dispatch({ kind: 'setField', field: 'titleOptions', value: [] });
      const titleFull = await streamGeneratePauta({
        prompt: titlePrompt,
        bannedTerms,
        temperature,
        webSearch: false,
        label: 'Gerar tudo — títulos',
        progress: aiProgressTopic,
        onChunk: (full) => dispatch({ kind: 'setField', field: 'titleResponse', value: full }),
      });
      const opts = parseTitleOptionsFromText(titleFull);
      dispatch({ kind: 'setField', field: 'titleOptions', value: opts });
      if (opts.length) dispatch({ kind: 'setField', field: 'selectedTitleIndex', value: 0 });
      const chosenTitle = opts[0]?.text || '';

      // 5. Gerar descrição
      const descOverride = getComponentPrompt(selectedTemplate, 'descricao');
      const descPrompt = getStandaloneDescriptionPrompt(chosenTitle, content, settings, descOverride);
      dispatch({ kind: 'setField', field: 'descriptionResponse', value: '' });
      dispatch({ kind: 'setField', field: 'descriptionHtml', value: '' });
      const descFull = await streamGeneratePauta({
        prompt: descPrompt,
        bannedTerms,
        temperature,
        webSearch: false,
        label: 'Gerar tudo — descrição',
        progress: aiProgressTopic,
        onChunk: (full) => {
          dispatch({ kind: 'setField', field: 'descriptionResponse', value: full });
          dispatch({ kind: 'setField', field: 'descriptionHtml', value: descriptionHtmlFromResponse(full) });
        },
      });
      dispatch({ kind: 'setField', field: 'descriptionHtml', value: descriptionHtmlFromResponse(descFull) });

      aiProgressTopic.finish(null);
      toast.success('Pipeline completa: pauta + títulos + descrição gerados');
    } catch (e: any) {
      aiProgressTopic.finish(e?.message || 'Falha na pipeline');
      toast.error(e?.message || 'Falha ao gerar tudo');
    } finally {
      setGeneratingPauta(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{meta.icon}</span>
        <h3 className="text-lg font-semibold">{meta.label}</h3>
      </div>

      <ReleaseLinkBar release={selectedRelease} />

      <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Prompt do componente</Label>
          <Button size="sm" variant="ghost" onClick={() => setManagerOpen(true)}>
            <Settings2 className="mr-1 h-3.5 w-3.5" /> Gerenciar prompts
          </Button>
        </div>
        <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
          <SelectTrigger><SelectValue placeholder="Escolha um prompt…" /></SelectTrigger>
          <SelectContent>
            {allChoices.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum prompt cadastrado.</div>
            )}
            {allChoices.map(t => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}{t.is_default ? ' · padrão' : ''}{t.topic_type === 'custom' ? ' · custom' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedTemplate?.description && (
          <p className="text-[11px] text-muted-foreground">{selectedTemplate.description}</p>
        )}
      </div>

      <PromptTemplatesManager
        open={managerOpen}
        onOpenChange={setManagerOpen}
        defaultType={topic.type}
        onChanged={refresh}
      />

      <Dialog open={searchModalOpen} onOpenChange={setSearchModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pesquisar no Google</DialogTitle>
            <DialogDescription>
              Escolha como conduzir a pesquisa para este tópico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
            <span className="font-semibold">Query:</span> {googleQuery}
          </div>
          <div className="grid gap-3">
            <Button
              variant="outline"
              className="h-auto justify-start py-3 text-left"
              onClick={() => { openGoogle(); setSearchModalOpen(false); }}
              disabled={autoSearching}
            >
              <ExternalLink className="mr-2 h-4 w-4 shrink-0" />
              <span className="flex flex-col items-start gap-0.5">
                <span className="font-semibold">Busca manual</span>
                <span className="text-[11px] text-muted-foreground">Abre o Google em uma nova aba com a query montada.</span>
              </span>
            </Button>
            <Button
              variant="outline"
              className="h-auto justify-start py-3 text-left"
              onClick={runAutoSearch}
              disabled={autoSearching}
            >
              {autoSearching
                ? <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                : <Sparkles className="mr-2 h-4 w-4 shrink-0" />}
              <span className="flex flex-col items-start gap-0.5">
                <span className="font-semibold">Busca automática (IA)</span>
                <span className="text-[11px] text-muted-foreground">
                  DeepSeek V4 Flash + web search. Popula a Direção editorial / notas.
                </span>
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-2">
        <Label>{meta.inputLabel}</Label>
        {meta.inputKind === 'release' ? (
          <ReleasePicker
            value={topic.release_id || null}
            onChange={(id) => dispatch({ kind: 'patchTopic', id: topic.id, patch: { release_id: id } })}
          />
        ) : (
          <Input
            placeholder="https://..."
            value={topic.url || ''}
            onChange={(e) => dispatch({ kind: 'patchTopic', id: topic.id, patch: { url: e.target.value } })}
          />
        )}
        <p className="text-xs text-muted-foreground">{meta.inputHint}</p>
      </div>

      <div className="space-y-2">
        <Label>Direção editorial / notas</Label>
        <Textarea
          rows={3}
          placeholder="Ângulo, tom, pontos obrigatórios..."
          value={topic.notes}
          onChange={(e) => dispatch({ kind: 'patchTopic', id: topic.id, patch: { notes: e.target.value } })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`length-${topic.id}`}>Length (nº de palavras alvo)</Label>
        <div className="flex items-center gap-2">
          <Input
            id={`length-${topic.id}`}
            type="number"
            min={50}
            max={10000}
            step={50}
            className="w-32"
            value={topic.target_words ?? 500}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              dispatch({
                kind: 'patchTopic',
                id: topic.id,
                patch: { target_words: Number.isFinite(v) && v > 0 ? v : null },
              });
            }}
          />
          <span className="text-xs text-muted-foreground">
            A IA receberá uma regra para escrever ~{topic.target_words ?? 500} palavras (±15%). Se ficar fora, fazemos um ajuste automático.
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Prompt (editável)</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={regeneratePrompt}
              title="Anexa o conteúdo de Direção editorial / notas ao final do prompt"
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Atualizar prompt
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSearchModalOpen(true)}
              disabled={!googleQuery}
              title={googleQuery || 'Preencha o input para gerar a query'}
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              Pesquisar no Google
            </Button>
            <CopyExportRow
              text={topic.prompt_text}
              filename={`prompt_${topic.type}_${topic.id.slice(0, 6)}.txt`}
              label="Copiar prompt"
              exportLabel="Exportar prompt"
            />
          </div>
        </div>
        {googleQuery && (
          <p className="truncate text-[11px] text-muted-foreground" title={googleQuery}>
            <span className="font-semibold">Query Google:</span> {googleQuery}
          </p>
        )}
        <Textarea
          rows={10}
          value={topic.prompt_text}
          onChange={(e) => dispatch({ kind: 'patchTopic', id: topic.id, patch: { prompt_text: e.target.value } })}
          className="font-mono text-xs"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Cole aqui a resposta da IA</Label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs">
              <Switch checked={generateAll} onCheckedChange={setGenerateAll} />
              <span className="font-medium">Gerar tudo</span>
            </label>
            <Button
              size="sm"
              onClick={generateAll ? runGenerateAll : generatePautaWithAI}
              disabled={generatingPauta || !topic.prompt_text?.trim()}
              title={
                generateAll
                  ? 'Roda toda a pipeline: pesquisa web → pauta → títulos → descrição'
                  : 'Gera a pauta via OpenRouter (DeepSeek V4 Flash) sem web search'
              }
            >
              {generatingPauta
                ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              {generateAll ? 'Gerar tudo' : 'Gerar pauta'}
            </Button>
            <CopyExportRow
              text={topic.response_text}
              filename={`resposta_${topic.type}_${topic.id.slice(0, 6)}.txt`}
              label="Copiar resposta"
              exportLabel="Exportar resposta"
            />
          </div>
        </div>
        <Textarea
          rows={10}
          placeholder="Cole o output gerado pela sua IA..."
          value={topic.response_text}
          onChange={(e) => onPaste(e.target.value)}
        />
        {topic.response_text && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-emerald-500" />
            Resposta registrada ({topic.response_text.length} caracteres).
          </div>
        )}
        {topic.response_text && (
          <div className="space-y-2 rounded-md border border-border bg-card/30 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Pré-visualização da pauta (Markdown)
              </Label>
            </div>
            <ReleaseLinkBar release={selectedRelease} />
            <MarkdownView text={topic.response_text} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Material steps (title / description / cover) ───────────────────────────

// streamGeneratePauta is provided by @/lib/ai/openrouter-client and wired
// into the global AI progress modal.

function TitleStep({ state, dispatch }: { state: WizardState; dispatch: React.Dispatch<Action> }) {
  const { releases, settings } = useApp();
  const { allTemplates } = usePromptTemplates();
  const content = aggregatedContent(state.topics, releases);
  const firstTopic = state.topics[0];
  const tpl = firstTopic
    ? (firstTopic.template_id ? allTemplates.find(x => x.id === firstTopic.template_id) : null)
      ?? allTemplates.find(x => x.topic_type === firstTopic.type && x.is_default)
      ?? allTemplates.find(x => x.topic_type === firstTopic.type)
      ?? null
    : null;
  const override = getComponentPrompt(tpl, 'titulo');
  const prompt = getStandaloneTitlePrompt(content, settings, override);
  const [generating, setGenerating] = useState(false);
  const aiProgress = useAiCallProgress();
  const generateTitles = async () => {
    if (!prompt.trim()) {
      toast.error('Prompt vazio.');
      return;
    }
    setGenerating(true);
    dispatch({ kind: 'setField', field: 'titleResponse', value: '' });
    dispatch({ kind: 'setField', field: 'titleOptions', value: [] });
    try {
      const full = await streamGeneratePauta({
        prompt,
        bannedTerms: settings.banned_terms_text ? settings.banned_terms_text.split('\n').filter(Boolean) : [],
        temperature: typeof settings.brand_tone_temperature === 'number' ? settings.brand_tone_temperature / 100 : undefined,
        webSearch: false,
        label: 'Gerando títulos',
        progress: aiProgress,
        onChunk: (full) => {
          dispatch({ kind: 'setField', field: 'titleResponse', value: full });
        },
      });
      const opts = parseTitleOptionsFromText(full);
      dispatch({ kind: 'setField', field: 'titleOptions', value: opts });
      if (opts.length) dispatch({ kind: 'setField', field: 'selectedTitleIndex', value: 0 });
      toast.success('Títulos gerados');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao gerar títulos');
    } finally {
      setGenerating(false);
    }
  };
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">🏷️ Título do episódio</h3>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Prompt</Label>
          <CopyExportRow text={prompt} filename="prompt_titulo.txt" label="Copiar prompt" exportLabel="Exportar prompt" />
        </div>
        <Textarea rows={8} readOnly value={prompt} className="font-mono text-xs" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Cole as 3 opções de título (uma por linha)</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={generateTitles}
              disabled={generating || !prompt.trim()}
              title="Gera 3 títulos via OpenRouter (DeepSeek V4 Flash) sem web search"
            >
              {generating
                ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              Gerar títulos
            </Button>
            <CopyExportRow
              text={state.titleResponse}
              filename="resposta_titulos.txt"
              label="Copiar opções"
              exportLabel="Exportar opções"
            />
          </div>
        </div>
        <Textarea
          rows={6}
          value={state.titleResponse}
          onChange={(e) => {
            const v = e.target.value;
            const opts = parseTitleOptionsFromText(v);
            dispatch({ kind: 'setField', field: 'titleResponse', value: v });
            dispatch({ kind: 'setField', field: 'titleOptions', value: opts });
            if (state.selectedTitleIndex == null && opts.length) {
              dispatch({ kind: 'setField', field: 'selectedTitleIndex', value: 0 });
            }
          }}
          placeholder="Opção 1...\nOpção 2...\nOpção 3..."
        />
      </div>
      {state.titleOptions.length > 0 && (
        <div className="space-y-2">
          <Label>Escolha o título</Label>
          <div className="space-y-2">
            {state.titleOptions.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => dispatch({ kind: 'setField', field: 'selectedTitleIndex', value: i })}
                className={cn(
                  "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors",
                  state.selectedTitleIndex === i ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                )}
              >
                <div className={cn("mt-1 h-4 w-4 shrink-0 rounded-full border-2", state.selectedTitleIndex === i ? "border-primary bg-primary" : "border-muted-foreground")} />
                <div className="flex-1">
                  <div className="text-sm font-medium">{opt.text}</div>
                  <Badge variant="outline" className="mt-1 text-[10px] uppercase">{opt.style}</Badge>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DescriptionStep({ state, dispatch }: { state: WizardState; dispatch: React.Dispatch<Action> }) {
  const { releases, settings } = useApp();
  const { allTemplates } = usePromptTemplates();
  const title = state.selectedTitleIndex != null ? state.titleOptions[state.selectedTitleIndex]?.text || '' : '';
  const content = aggregatedContent(state.topics, releases);
  const firstTopic = state.topics[0];
  const tpl = firstTopic
    ? (firstTopic.template_id ? allTemplates.find(x => x.id === firstTopic.template_id) : null)
      ?? allTemplates.find(x => x.topic_type === firstTopic.type && x.is_default)
      ?? allTemplates.find(x => x.topic_type === firstTopic.type)
      ?? null
    : null;
  const override = getComponentPrompt(tpl, 'descricao');
  const prompt = getStandaloneDescriptionPrompt(title, content, settings, override);
  const [generating, setGenerating] = useState(false);
  const aiProgress = useAiCallProgress();
  const generateDescription = async () => {
    if (!prompt.trim()) {
      toast.error('Prompt vazio.');
      return;
    }
    setGenerating(true);
    dispatch({ kind: 'setField', field: 'descriptionResponse', value: '' });
    dispatch({ kind: 'setField', field: 'descriptionHtml', value: '' });
    try {
      const full = await streamGeneratePauta({
        prompt,
        bannedTerms: settings.banned_terms_text ? settings.banned_terms_text.split('\n').filter(Boolean) : [],
        temperature: typeof settings.brand_tone_temperature === 'number' ? settings.brand_tone_temperature / 100 : undefined,
        webSearch: false,
        label: 'Gerando descrição',
        progress: aiProgress,
        onChunk: (full) => {
          dispatch({ kind: 'setField', field: 'descriptionResponse', value: full });
          dispatch({ kind: 'setField', field: 'descriptionHtml', value: descriptionHtmlFromResponse(full) });
        },
      });
      dispatch({ kind: 'setField', field: 'descriptionHtml', value: descriptionHtmlFromResponse(full) });
      toast.success('Descrição gerada');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao gerar descrição');
    } finally {
      setGenerating(false);
    }
  };
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">📝 Descrição do episódio</h3>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Prompt</Label>
          <CopyExportRow text={prompt} filename="prompt_descricao.txt" label="Copiar prompt" exportLabel="Exportar prompt" />
        </div>
        <Textarea rows={8} readOnly value={prompt} className="font-mono text-xs" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Cole a descrição (HTML ou texto)</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={generateDescription}
              disabled={generating || !prompt.trim()}
              title="Gera a descrição via OpenRouter (DeepSeek V4 Flash) sem web search"
            >
              {generating
                ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              Gerar com IA
            </Button>
            <CopyExportRow
              text={state.descriptionHtml}
              filename="descricao.html"
              label="Copiar HTML"
              exportLabel="Exportar HTML"
            />
          </div>
        </div>
        <Textarea
          rows={10}
          value={state.descriptionResponse}
          onChange={(e) => {
            dispatch({ kind: 'setField', field: 'descriptionResponse', value: e.target.value });
            dispatch({ kind: 'setField', field: 'descriptionHtml', value: descriptionHtmlFromResponse(e.target.value) });
          }}
        />
      </div>
    </div>
  );
}

function CoverStep({ state, dispatch }: { state: WizardState; dispatch: React.Dispatch<Action> }) {
  const { releases, settings } = useApp();
  const { allTemplates } = usePromptTemplates();
  const content = aggregatedContent(state.topics, releases);
  const firstTopic = state.topics[0];
  const tpl = firstTopic
    ? (firstTopic.template_id ? allTemplates.find(x => x.id === firstTopic.template_id) : null)
      ?? allTemplates.find(x => x.topic_type === firstTopic.type && x.is_default)
      ?? allTemplates.find(x => x.topic_type === firstTopic.type)
      ?? null
    : null;
  const override = getComponentPrompt(tpl, 'capa');
  const prompt = getStandaloneCoverPrompt(content, settings, override);
  const episodeTitle = state.selectedTitleIndex != null
    ? state.titleOptions[state.selectedTitleIndex]?.text || ''
    : '';
  const [generating, setGenerating] = useState(false);
  const sourceUrl = state.coverSourceUrl || state.coverUrl;
  const isGenerated = state.coverUrl.startsWith('data:');
  const handleGenerateTemplate = () => {
    if (!sourceUrl) { toast.error('Informe uma URL de imagem primeiro.'); return; }
    if (!episodeTitle) { toast.error('Defina o título do episódio antes de gerar a capa.'); return; }
    setGenerating(true);
    generateCoverImage({
      imageUrl: sourceUrl,
      title: episodeTitle,
      onComplete: (dataUrl) => {
        dispatch({ kind: 'setField', field: 'coverSourceUrl', value: sourceUrl });
        dispatch({ kind: 'setField', field: 'coverUrl', value: dataUrl });
        setGenerating(false);
        toast.success('Capa gerada com o template Heavynauta');
      },
      onError: (err) => {
        setGenerating(false);
        toast.error(err);
      },
    });
  };
  const imageQuery = useMemo(() => {
    const parts: string[] = [];
    for (const t of state.topics) {
      const rel = t.release_id ? releases.find(r => r.id === t.release_id) : null;
      // Usa o template selecionado para este tópico (persistido em template_id);
      // fallback: default do tipo, depois qualquer um do tipo.
      const tpl =
        (t.template_id ? allTemplates.find(x => x.id === t.template_id) : null) ||
        allTemplates.find(x => x.topic_type === t.type && x.is_default) ||
        allTemplates.find(x => x.topic_type === t.type) ||
        null;
      const q = buildGoogleImagesQuery(t, rel, tpl?.google_images_query);
      if (q) parts.push(q);
    }
    if (parts.length === 0) return '';
    return parts.slice(0, 3).join(' OR ');
  }, [state.topics, releases, allTemplates]);
  const openGoogleImages = () => {
    const url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(imageQuery)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">🎨 Capa</h3>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Prompt visual (opcional)</Label>
          <CopyExportRow text={prompt} filename="prompt_capa.txt" label="Copiar prompt" exportLabel="Exportar prompt" />
        </div>
        <Textarea rows={5} readOnly value={prompt} className="font-mono text-xs" />
      </div>
      <div className="space-y-2">
        <Label>Buscar imagem no Google</Label>
        <div className="flex gap-2">
          <Input readOnly value={imageQuery} className="font-mono text-xs" />
          <Button type="button" variant="outline" onClick={openGoogleImages}>
            <Search className="h-4 w-4" /> Google Imagens
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => { navigator.clipboard.writeText(imageQuery); toast.success('Query copiada'); }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Query montada a partir dos tópicos (artista + álbum quando há release). Abre o Google Imagens em nova aba.
        </p>
      </div>
      <div className="space-y-2">
        <Label>URL da capa (imagem original)</Label>
        <Input
          placeholder="https://...jpg"
          value={isGenerated ? state.coverSourceUrl : state.coverUrl}
          onChange={(e) => {
            dispatch({ kind: 'setField', field: 'coverSourceUrl', value: e.target.value });
            // limpa capa gerada se mudar a URL fonte
            if (isGenerated) dispatch({ kind: 'setField', field: 'coverUrl', value: e.target.value });
            else dispatch({ kind: 'setField', field: 'coverUrl', value: e.target.value });
          }}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="default"
            disabled={generating || !sourceUrl || !episodeTitle}
            onClick={handleGenerateTemplate}
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isGenerated ? 'Regerar capa com template' : 'Gerar capa com template Heavynauta'}
          </Button>
          {!episodeTitle && (
            <span className="text-xs text-muted-foreground">defina o título antes</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          O template aplica o overlay roxo do podcast, título do episódio e logo Heavynauta (3000×3000).
        </p>
        {state.coverUrl && (
          <div className="mt-2 space-y-1">
            <img src={state.coverUrl} alt="Preview" className="h-40 w-40 rounded border border-border object-cover" />
            <p className="text-[11px] text-muted-foreground">
              {isGenerated ? '✓ Capa com template pronta' : 'Imagem bruta — clique em "Gerar capa com template"'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main wizard ────────────────────────────────────────────────────────────

export interface NovaPautaWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (pautaId: string) => void;
  initialDate?: string;
}

export function NovaPautaWizard({ open, onClose, onCreated, initialDate }: NovaPautaWizardProps) {
  const { addPauta, addMaterial, logActivity, releases, settings } = useApp();
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [saving, setSaving] = useState(false);

  // Recover draft on open
  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as WizardState;
        if (parsed && typeof parsed === 'object') dispatch({ kind: 'hydrate', state: { ...initialState(), ...parsed } });
      }
    } catch {}
    if (initialDate) {
      dispatch({ kind: 'setField', field: 'publicationDate', value: initialDate });
    }
  }, [open, initialDate]);

  // Persist draft
  useEffect(() => {
    if (!open) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch {}
  }, [state, open]);

  // Step layout: 0 = topics select, 1..N = per-topic, N+1=title, N+2=desc, N+3=cover, N+4=review
  const N = state.topics.length;
  const TOTAL = 1 + N + 4;
  const stepKind: 'select' | 'topic' | 'title' | 'description' | 'cover' | 'review' =
    state.step === 0 ? 'select'
    : state.step <= N ? 'topic'
    : state.step === N + 1 ? 'title'
    : state.step === N + 2 ? 'description'
    : state.step === N + 3 ? 'cover'
    : 'review';
  const topicForStep = stepKind === 'topic' ? state.topics[state.step - 1] : null;

  const canAdvance = (() => {
    if (stepKind === 'select') return state.selectedTypes.length > 0;
    if (stepKind === 'topic' && topicForStep) {
      const meta = STANDALONE_TOPIC_META[topicForStep.type];
      const hasInput = meta.inputKind === 'release' ? !!topicForStep.release_id : !!topicForStep.url?.trim();
      return hasInput && !!topicForStep.response_text.trim();
    }
    if (stepKind === 'title') return state.titleOptions.length > 0 && state.selectedTitleIndex != null;
    if (stepKind === 'description') return !!state.descriptionHtml.trim();
    if (stepKind === 'cover') return true; // optional
    return true;
  })();

  const stepLabel = (() => {
    if (stepKind === 'select') return 'Conteúdo do episódio';
    if (stepKind === 'topic' && topicForStep) return `Bloco ${state.step}/${N} · ${STANDALONE_TOPIC_META[topicForStep.type].label}`;
    if (stepKind === 'title') return 'Título';
    if (stepKind === 'description') return 'Descrição';
    if (stepKind === 'cover') return 'Capa';
    return 'Revisão';
  })();

  const handleSave = async () => {
    setSaving(true);
    try {
      const weekId = standaloneWeekIdFor(state.publicationDate);
      const weekStart = standaloneWeekStart(state.publicationDate);
      // Ensure synthetic week exists
      await supabase.from('editorial_weeks' as any).upsert({
        id: weekId,
        start_date: weekStart,
        status: 'draft',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any, { onConflict: 'id' });

      const wd = new Date(state.publicationDate + 'T12:00:00').getDay();
      const slotMap: Record<number, DaySlot> = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };

      const sectionsJson: Record<string, string> = {};
      const rawInputs: Record<string, unknown> = {
        standalone: true,
        topics: state.topics.map(t => ({
          type: t.type,
          release_id: t.release_id || null,
          url: t.url || null,
          notes: t.notes,
        })),
      };
      for (const t of state.topics) {
        sectionsJson[`standalone_${t.type}`] = plainTextResponseFor(t);
      }
      const renderedText = aggregatedContent(state.topics);

      const pautaId = crypto.randomUUID();
      const newPauta: Pauta = {
        id: pautaId,
        week_id: weekId,
        publication_date: state.publicationDate,
        pauta_type: 'weekday' as any,
        status: 'pesquisa',
        raw_inputs_json: rawInputs,
        sections_json: sectionsJson as any,
        rendered_markdown: null,
        rendered_text: renderedText,
        warnings_json: [],
        discovered_links_json: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        finalized_at: null,
        is_standalone: true,
        standalone_topics: state.topics,
      } as any;

      // Add to context (also persists)
      addPauta(newPauta);
      // Also flag the standalone fields server-side (addPauta may not know them)
      await supabase.from('pautas' as any).update({
        is_standalone: true,
        standalone_topics: state.topics as any,
      }).eq('id', pautaId);

      const material: EpisodeMaterial = {
        id: crypto.randomUUID(),
        week_id: weekId,
        slot_key: slotMap[wd] || 'monday',
        episode_date: state.publicationDate,
        source_pauta_id: pautaId,
        title_options_json: state.titleOptions,
        selected_title_index: state.selectedTitleIndex,
        description_html: state.descriptionHtml || null,
        cover_url: state.coverUrl || null,
        cover_source_url: state.coverSourceUrl || state.coverUrl || null,
        spotify_link: null,
        repository_url: null,
        repository_file_id: null,
        repository_provider: null,
        repository_uploaded_at: null,
        mentioned_in_episode: null,
        cover_saved_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_standalone: true,
      } as any;
      addMaterial(material);

      logActivity('create_standalone_pauta', `Episódio avulso criado para ${state.publicationDate} (${state.topics.length} blocos)`);
      toast.success('Episódio avulso criado!');
      localStorage.removeItem(DRAFT_KEY);
      dispatch({ kind: 'reset' });
      onCreated?.(pautaId);
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(`Falha ao salvar: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    onClose();
  };
  const handleDiscard = () => {
    localStorage.removeItem(DRAFT_KEY);
    dispatch({ kind: 'reset' });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-[1200px] w-[95vw] h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle>Nova Pauta · Episódio Avulso</DialogTitle>
              <DialogDescription>{stepLabel}</DialogDescription>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Etapa {state.step + 1} de {TOTAL}</span>
              <Progress value={((state.step + 1) / TOTAL) * 100} className="w-40" />
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-6">
          <div className="mx-auto max-w-4xl">
            {stepKind === 'select' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold">O que você vai falar nesse episódio?</h3>
                  <p className="text-sm text-muted-foreground">Escolha um ou mais blocos. Cada bloco vira uma etapa do fluxo.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {TOPIC_ORDER.map(type => {
                    const m = STANDALONE_TOPIC_META[type];
                    const checked = state.selectedTypes.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => dispatch({ kind: 'toggleType', type })}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border-2 p-4 text-left transition-colors",
                          checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                        )}
                      >
                        <Checkbox checked={checked} className="mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-base font-medium">
                            <span>{m.icon}</span>
                            <span>{m.label}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{m.inputHint}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Data de publicação</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-60 justify-start font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(new Date(state.publicationDate + 'T12:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        weekStartsOn={1}
                        selected={new Date(state.publicationDate + 'T12:00:00')}
                        onSelect={(d) => d && dispatch({ kind: 'setField', field: 'publicationDate', value: d.toISOString().slice(0, 10) })}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {stepKind === 'topic' && topicForStep && (
              <TopicStep topic={topicForStep} dispatch={dispatch} state={state} />
            )}
            {stepKind === 'title' && <TitleStep state={state} dispatch={dispatch} />}
            {stepKind === 'description' && <DescriptionStep state={state} dispatch={dispatch} />}
            {stepKind === 'cover' && <CoverStep state={state} dispatch={dispatch} />}

            {stepKind === 'review' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Revisão & Auditoria</h3>
                  <CopyExportRow
                    text={buildAuditText(state, releases, settings)}
                    filename={`auditoria_avulso_${state.publicationDate}.md`}
                    label="Copiar auditoria completa"
                    exportLabel="Exportar .md"
                  />
                </div>
                <div className="rounded-md border border-border p-4 text-sm">
                  <div><b>Data:</b> {state.publicationDate}</div>
                  <div className="mt-2"><b>Blocos ({state.topics.length}):</b></div>
                  <ul className="ml-4 list-disc text-muted-foreground">
                    {state.topics.map(t => {
                      const m = STANDALONE_TOPIC_META[t.type];
                      const ok = !!t.response_text.trim();
                      return <li key={t.id}>{m.icon} {m.label} — {ok ? '✓ resposta registrada' : '⚠ vazio'}</li>;
                    })}
                  </ul>
                  <div className="mt-2">
                    <b>Título:</b> {state.selectedTitleIndex != null ? state.titleOptions[state.selectedTitleIndex]?.text : <span className="text-muted-foreground">não definido</span>}
                  </div>
                  <div><b>Descrição:</b> {state.descriptionHtml ? `${state.descriptionHtml.length} caracteres` : <span className="text-muted-foreground">vazia</span>}</div>
                  <div><b>Capa:</b> {state.coverUrl ? 'definida' : <span className="text-muted-foreground">vazia</span>}</div>
                </div>

                <div className="space-y-3">
                  {state.topics.map((t, i) => {
                    const meta = STANDALONE_TOPIC_META[t.type];
                    return (
                      <div key={t.id} className="rounded-md border border-border p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="text-sm font-semibold">
                            Bloco {i + 1} — {meta.icon} {meta.label}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">Prompt final</Label>
                              <CopyExportRow
                                text={t.prompt_text}
                                filename={`prompt_${meta.label.toLowerCase()}_${i + 1}.txt`}
                                label="Copiar"
                                exportLabel="Exportar"
                              />
                            </div>
                            <Textarea readOnly rows={6} value={t.prompt_text} className="font-mono text-[11px]" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">Texto parsed (resposta registrada)</Label>
                              <CopyExportRow
                                text={t.response_text}
                                filename={`resposta_${meta.label.toLowerCase()}_${i + 1}.txt`}
                                label="Copiar"
                                exportLabel="Exportar"
                              />
                            </div>
                            <div className="max-h-[260px] overflow-auto rounded-md border border-border bg-muted/30 p-3">
                              <MarkdownView text={t.response_text} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs text-muted-foreground">
                  Ao confirmar, o episódio será criado na aba <b>Episódios Avulsos</b> e ficará disponível no Rivaldo para gravação/upload.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border px-6 py-3">
          <div className="flex w-full items-center justify-between">
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleDiscard}>
                <Trash2 className="mr-1 h-4 w-4" /> Descartar
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={state.step === 0}
                onClick={() => dispatch({ kind: 'setStep', step: state.step - 1 })}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
              </Button>
              {stepKind === 'review' ? (
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                  Criar episódio avulso
                </Button>
              ) : (
                <Button
                  disabled={!canAdvance}
                  onClick={() => dispatch({ kind: 'setStep', step: state.step + 1 })}
                >
                  Avançar <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
