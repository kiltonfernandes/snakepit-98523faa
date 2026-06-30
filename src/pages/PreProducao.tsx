import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Hammer, ChevronLeft, ChevronRight, Plus, Newspaper, Star, Trash2, Loader2, Search, Disc, X, ExternalLink, ArrowRight, Globe, Sparkles, ArrowLeft, Copy, Image as ImageIcon, Download, Check, Package } from 'lucide-react';
import {
  addDays, addMonths, addQuarters, addYears, addWeeks,
  startOfDay, startOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear,
  format, isSameDay, isSameMonth, isToday, getQuarter,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useApp } from '@/contexts/AppContext';
import { ShortlistDialog } from '@/components/pautas/ShortlistDialog';
import { resolveAllLinks } from '@/lib/dynamic-links';
import { Textarea } from '@/components/ui/textarea';
import { renderQueryTemplate } from '@/lib/google-query-templates';
import {
  buildKiltonReviewPrompt,
  buildLengthAdjustPrompt,
  countWords,
  SENTIMENT_LABEL,
  buildTitlesPrompt,
  parseTitlesJson,
  buildDescriptionPrompt,
  sanitizeDescriptionHtml,
  composeFinalDescriptionHtml,
  type ReviewSentiment,
  type GeneratedTitle,
  type TitleStyle,
} from '@/lib/preprod-prompts';
import { generateCoverImage } from '@/lib/cover-generator';
import { streamGeneratePauta } from '@/lib/ai/openrouter-client';
import { useAiCallProgress } from '@/contexts/AiCallProgressContext';
import { MarkdownView } from '@/components/shared/MarkdownView';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  PREPROD_KIND_LABEL,
  getPreprodLabel,
  getPreprodStatusClass,
  getPreprodStatusLabel,
  inferPreprodStatus,
  inferPreprodStep,
  normalizePreprodPauta,
  preprodDate,
  type PreprodKind,
  type PreprodPauta,
} from '@/lib/preprod-calendar';

type View = 'year' | 'quarter' | 'month' | 'week' | 'day';

const VIEW_LABELS: Record<View, string> = {
  year: 'Anual',
  quarter: 'Trimestral',
  month: 'Mensal',
  week: 'Semanal',
  day: 'Diário',
};

const WEEKDAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export default function PreProducao() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState<Date>(startOfDay(new Date()));
  const [newPautaDate, setNewPautaDate] = useState<Date | null>(null);
  const [editingPauta, setEditingPauta] = useState<PreprodPauta | null>(null);
  const [preprodPautas, setPreprodPautas] = useState<PreprodPauta[]>([]);
  const [loadingPautas, setLoadingPautas] = useState(false);

  const loadPreprodPautas = useCallback(async () => {
    setLoadingPautas(true);
    const { data, error } = await supabase
      .from('preprod_pautas')
      .select('*')
      .order('publication_date', { ascending: true })
      .order('created_at', { ascending: true });
    setLoadingPautas(false);
    if (error) {
      toast.error('Falha ao carregar pré-produção: ' + error.message);
      return;
    }
    setPreprodPautas(((data || []) as any[]).map(normalizePreprodPauta));
  }, []);

  const upsertPreprodPauta = useCallback((row: any) => {
    const normalized = normalizePreprodPauta(row);
    setPreprodPautas((prev) => {
      const idx = prev.findIndex((p) => p.id === normalized.id);
      if (idx === -1) return [...prev, normalized].sort((a, b) => `${a.publication_date}${a.created_at}`.localeCompare(`${b.publication_date}${b.created_at}`));
      const next = [...prev];
      next[idx] = normalized;
      return next;
    });
  }, []);

  useEffect(() => { void loadPreprodPautas(); }, [loadPreprodPautas]);

  useEffect(() => {
    const channel = supabase
      .channel('preprod-pautas-calendar-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'preprod_pautas' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as any)?.id;
          if (id) setPreprodPautas((prev) => prev.filter((p) => p.id !== id));
          return;
        }
        if (payload.new) upsertPreprodPauta(payload.new);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [upsertPreprodPauta]);

  useEffect(() => {
    const id = searchParams.get('preprod');
    if (!id || preprodPautas.length === 0) return;
    const found = preprodPautas.find((p) => p.id === id);
    if (!found) return;
    setEditingPauta(found);
    setAnchor(new Date(`${preprodDate(found.publication_date)}T12:00:00`));
    const next = new URLSearchParams(searchParams);
    next.delete('preprod');
    setSearchParams(next, { replace: true });
  }, [preprodPautas, searchParams, setSearchParams]);

  const pautasByDate = useMemo(() => {
    return preprodPautas.reduce<Record<string, PreprodPauta[]>>((acc, item) => {
      const key = preprodDate(item.publication_date);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [preprodPautas]);

  const closeDialog = () => {
    setNewPautaDate(null);
    setEditingPauta(null);
  };

  const refreshAndClose = async () => {
    await loadPreprodPautas();
    closeDialog();
  };

  const title = useMemo(() => {
    switch (view) {
      case 'year': return format(anchor, 'yyyy', { locale: ptBR });
      case 'quarter': return `Q${getQuarter(anchor)} ${format(anchor, 'yyyy', { locale: ptBR })}`;
      case 'month': return format(anchor, "MMMM 'de' yyyy", { locale: ptBR });
      case 'week': {
        const ws = startOfWeek(anchor, { weekStartsOn: 1 });
        const we = addDays(ws, 6);
        return `${format(ws, 'dd MMM', { locale: ptBR })} – ${format(we, 'dd MMM yyyy', { locale: ptBR })}`;
      }
      case 'day': return format(anchor, "EEEE, dd 'de' MMMM yyyy", { locale: ptBR });
    }
  }, [view, anchor]);

  const step = (dir: 1 | -1) => {
    setAnchor(prev => {
      switch (view) {
        case 'year': return addYears(prev, dir);
        case 'quarter': return addQuarters(prev, dir);
        case 'month': return addMonths(prev, dir);
        case 'week': return addWeeks(prev, dir);
        case 'day': return addDays(prev, dir);
      }
    });
  };

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Hammer className="h-6 w-6 text-primary" />
            Pré-produção
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Calendário editorial — visão anual, trimestral, mensal, semanal e diária.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              {(Object.keys(VIEW_LABELS) as View[]).map(v => (
                <TabsTrigger key={v} value={v}>{VIEW_LABELS[v]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button size="sm" className="gap-2" onClick={() => setNewPautaDate(anchor)}>
            <Plus className="h-4 w-4" />
            Nova pauta
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => step(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => step(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" className="ml-2" onClick={() => setAnchor(startOfDay(new Date()))}>Hoje</Button>
        </div>
        <div className="text-sm font-semibold capitalize">{title}</div>
        <div className="w-[120px]" />
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        {loadingPautas && <div className="mb-3 text-xs text-muted-foreground">Carregando pautas salvas…</div>}
        {view === 'year' && <YearGrid anchor={anchor} itemsByDate={pautasByDate} onPickMonth={(d) => { setAnchor(d); setView('month'); }} />}
        {view === 'quarter' && <QuarterGrid anchor={anchor} itemsByDate={pautasByDate} onPickMonth={(d) => { setAnchor(d); setView('month'); }} />}
        {view === 'month' && <MonthGrid anchor={anchor} itemsByDate={pautasByDate} onOpen={setEditingPauta} onPickDay={(d) => { setAnchor(d); setView('day'); }} onAdd={setNewPautaDate} />}
        {view === 'week' && <WeekGrid anchor={anchor} itemsByDate={pautasByDate} onOpen={setEditingPauta} onPickDay={(d) => { setAnchor(d); setView('day'); }} onAdd={setNewPautaDate} />}
        {view === 'day' && <DayView anchor={anchor} itemsByDate={pautasByDate} onOpen={setEditingPauta} onAdd={setNewPautaDate} />}
      </div>

      <NewPautaDialog
        date={newPautaDate}
        item={editingPauta}
        onClose={() => { void refreshAndClose(); }}
        onChanged={loadPreprodPautas}
        onSaved={upsertPreprodPauta}
      />
    </motion.div>
  );
}

// ---------- Year ----------
function YearGrid({ anchor, itemsByDate, onPickMonth }: { anchor: Date; itemsByDate: Record<string, PreprodPauta[]>; onPickMonth: (d: Date) => void }) {
  const yearStart = startOfYear(anchor);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(yearStart, i));
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {months.map((m) => {
        const count = countItemsInMonth(m, itemsByDate);
        return (
          <button
            key={m.toISOString()}
            onClick={() => onPickMonth(m)}
            className="text-left rounded-md border border-border p-3 hover:bg-accent transition"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs font-semibold capitalize">{format(m, 'MMMM', { locale: ptBR })}</div>
              {count > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{count}</Badge>}
            </div>
            <MiniMonth month={m} itemsByDate={itemsByDate} />
          </button>
        );
      })}
    </div>
  );
}

function QuarterGrid({ anchor, itemsByDate, onPickMonth }: { anchor: Date; itemsByDate: Record<string, PreprodPauta[]>; onPickMonth: (d: Date) => void }) {
  const qs = startOfQuarter(anchor);
  const months = [qs, addMonths(qs, 1), addMonths(qs, 2)];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {months.map((m) => {
        const count = countItemsInMonth(m, itemsByDate);
        return (
          <button
            key={m.toISOString()}
            onClick={() => onPickMonth(m)}
            className="text-left rounded-md border border-border p-3 hover:bg-accent transition"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs font-semibold capitalize">{format(m, 'MMMM yyyy', { locale: ptBR })}</div>
              {count > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{count}</Badge>}
            </div>
            <MiniMonth month={m} itemsByDate={itemsByDate} />
          </button>
        );
      })}
    </div>
  );
}

function MiniMonth({ month, itemsByDate = {} }: { month: Date; itemsByDate?: Record<string, PreprodPauta[]> }) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-7 gap-0.5 text-[10px]">
      {WEEKDAYS_SHORT.map(d => <div key={d} className="text-center text-muted-foreground">{d[0]}</div>)}
      {days.map((d) => {
        const hasItems = (itemsByDate[preprodDate(d)] || []).length > 0;
        return (
          <div
            key={d.toISOString()}
            className={cn(
              'relative text-center py-0.5 rounded',
              !isSameMonth(d, month) && 'text-muted-foreground/40',
              isToday(d) && 'bg-primary text-primary-foreground font-semibold',
            )}
          >
            {format(d, 'd')}
            {hasItems && <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" />}
          </div>
        );
      })}
    </div>
  );
}

function countItemsInMonth(month: Date, itemsByDate: Record<string, PreprodPauta[]>) {
  return Object.entries(itemsByDate).reduce((total, [dateKey, items]) => {
    const d = new Date(`${dateKey}T12:00:00`);
    return isSameMonth(d, month) ? total + items.length : total;
  }, 0);
}

function PreprodCalendarItem({ item, onOpen }: { item: PreprodPauta; onOpen: (item: PreprodPauta) => void }) {
  const status = inferPreprodStatus(item);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(item); }}
      className="w-full rounded-md border border-border bg-muted/50 px-2 py-1.5 text-left hover:border-primary/50 hover:bg-muted transition"
      title="Abrir pauta salva"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={cn('h-2 w-2 rounded-full shrink-0', getPreprodStatusClass(status))} />
        <span className="truncate text-[10px] font-semibold text-foreground">{getPreprodLabel(item)}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-muted-foreground">
        <span>{PREPROD_KIND_LABEL[String(item.kind || '')] || 'Pauta'}</span>
        <span>·</span>
        <span>{getPreprodStatusLabel(status)}</span>
      </div>
    </button>
  );
}

// ---------- Month ----------
function MonthGrid({ anchor, itemsByDate, onOpen, onPickDay, onAdd }: { anchor: Date; itemsByDate: Record<string, PreprodPauta[]>; onOpen: (item: PreprodPauta) => void; onPickDay: (d: Date) => void; onAdd: (d: Date) => void }) {
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEKDAYS_SHORT.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const items = itemsByDate[preprodDate(d)] || [];
          return (
          <div
            key={d.toISOString()}
            className={cn(
              'group relative min-h-[132px] rounded-md border border-border p-2 text-left text-xs hover:bg-accent transition flex flex-col cursor-pointer',
              !isSameMonth(d, anchor) && 'opacity-40',
              isToday(d) && 'border-primary',
            )}
            onClick={() => onPickDay(d)}
          >
            <span className={cn('font-semibold', isToday(d) && 'text-primary')}>{format(d, 'd')}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAdd(d); }}
              className="absolute top-1 right-1 h-5 w-5 rounded-md bg-primary/10 text-primary opacity-0 group-hover:opacity-100 hover:bg-primary hover:text-primary-foreground transition flex items-center justify-center"
              title="Nova pauta neste dia"
            >
              <Plus className="h-3 w-3" />
            </button>
            <div className="mt-2 space-y-1 overflow-hidden">
              {items.slice(0, 3).map((item) => <PreprodCalendarItem key={item.id} item={item} onOpen={onOpen} />)}
              {items.length > 3 && <div className="text-[9px] text-muted-foreground">+{items.length - 3} pautas</div>}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Week ----------
function WeekGrid({ anchor, itemsByDate, onOpen, onPickDay, onAdd }: { anchor: Date; itemsByDate: Record<string, PreprodPauta[]>; onOpen: (item: PreprodPauta) => void; onPickDay: (d: Date) => void; onAdd: (d: Date) => void }) {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => {
        const items = itemsByDate[preprodDate(d)] || [];
        return (
        <div
          key={d.toISOString()}
          onClick={() => onPickDay(d)}
          className={cn(
            'group relative min-h-[180px] rounded-md border border-border p-3 text-left hover:bg-accent transition flex flex-col cursor-pointer',
            isToday(d) && 'border-primary',
          )}
        >
          <span className="text-[10px] uppercase text-muted-foreground">{format(d, 'EEE', { locale: ptBR })}</span>
          <span className={cn('text-2xl font-bold', isToday(d) && 'text-primary')}>{format(d, 'd')}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAdd(d); }}
            className="absolute top-2 right-2 h-6 w-6 rounded-md bg-primary/10 text-primary opacity-0 group-hover:opacity-100 hover:bg-primary hover:text-primary-foreground transition flex items-center justify-center"
            title="Nova pauta neste dia"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <div className="mt-3 space-y-1.5 overflow-hidden">
            {items.map((item) => <PreprodCalendarItem key={item.id} item={item} onOpen={onOpen} />)}
            {items.length === 0 && <div className="text-[10px] text-muted-foreground">Sem pautas.</div>}
          </div>
        </div>
        );
      })}
    </div>
  );
}

// ---------- Day ----------
function DayView({ anchor, itemsByDate, onOpen, onAdd }: { anchor: Date; itemsByDate: Record<string, PreprodPauta[]>; onOpen: (item: PreprodPauta) => void; onAdd: (d: Date) => void }) {
  const items = itemsByDate[preprodDate(anchor)] || [];
  return (
    <div className="min-h-[400px] text-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="text-5xl font-bold text-foreground mb-2">{format(anchor, 'dd')}</div>
          <div className="capitalize text-muted-foreground">{format(anchor, "EEEE, MMMM yyyy", { locale: ptBR })}</div>
        </div>
        <Button size="sm" variant="outline" className="gap-2" onClick={() => onAdd(anchor)}>
          <Plus className="h-3.5 w-3.5" />
          Nova pauta neste dia
        </Button>
      </div>
      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Sem pautas salvas.</div>
        ) : (
          items.map((item) => <PreprodCalendarItem key={item.id} item={item} onOpen={onOpen} />)
        )}
      </div>
    </div>
  );
}

// ---------- New Pauta Dialog ----------
type Step = 'kind' | 'release' | 'research' | 'insumo' | 'config' | 'result' | 'titles' | 'description' | 'cover' | 'package';

const TITLE_STYLE_LABEL: Record<TitleStyle, string> = {
  clickbait: 'Clickbait',
  curiosidade: 'Curiosidade',
  impacto: 'Impacto',
};

function NewPautaDialog({
  date,
  item,
  onClose,
  onChanged,
  onSaved,
}: {
  date: Date | null;
  item: PreprodPauta | null;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  onSaved?: (row: PreprodPauta) => void;
}) {
  const navigate = useNavigate();
  const { releases, settings } = useApp();
  const progress = useAiCallProgress();
  const effectiveDate = item ? new Date(`${preprodDate(item.publication_date)}T12:00:00`) : date;
  const [pautaId, setPautaId] = useState<string | null>(null);
  const [kind, setKind] = useState<PreprodKind | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [shortlistOpen, setShortlistOpen] = useState(false);
  const [step, setStep] = useState<Step>('kind');
  const [researchQuery, setResearchQuery] = useState('');
  const [insumo, setInsumo] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [lengthWords, setLengthWords] = useState<string>('500');
  const lengthWordsNum = parseInt(lengthWords, 10) || 500;
  const [sentiment, setSentiment] = useState<ReviewSentiment>('neutral');
  const [result, setResult] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  // Títulos / descrição / capa
  const [titles, setTitles] = useState<GeneratedTitle[]>([]);
  const [selectedTitle, setSelectedTitle] = useState<string>('');
  const [titlesLoading, setTitlesLoading] = useState(false);
  const [titleLabelOn, setTitleLabelOn] = useState<boolean>(false);
  const [mentioned, setMentioned] = useState<string>('');
  const [descriptionHtml, setDescriptionHtml] = useState<string>('');
  const [descLoading, setDescLoading] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string>('');
  const [coverDataUrl, setCoverDataUrl] = useState<string>('');
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [persistedData, setPersistedData] = useState<Record<string, any>>({});
  const latestDataRef = useRef<Record<string, any>>({});
  const saveSeqRef = useRef(0);

  // Create the draft row in DB the moment the dialog opens
  useEffect(() => {
    if (!date && !item) {
      setPautaId(null);
      setKind(null);
      setReleaseId(null);
      setQuery('');
      setStep('kind');
      setResearchQuery('');
      setInsumo('');
      setLengthWords('500');
      setSentiment('neutral');
      setResult('');
      setManualMode(false);
      setGenerating(false);
      setTitles([]); setSelectedTitle(''); setMentioned('');
      setDescriptionHtml(''); setCoverImageUrl(''); setCoverDataUrl('');
      setTitleLabelOn(false);
      setPersistedData({});
      latestDataRef.current = {};
      return;
    }

    if (item) {
      const data = item.data || {};
      setPautaId(item.id);
      setKind((item.kind as PreprodKind | null) || null);
      setReleaseId(data.release_id || null);
      setQuery('');
      setResearchQuery(data.research_query || '');
      setInsumo(data.insumo || '');
      setLengthWords(String(data.length_words || '500'));
      setSentiment((data.sentiment as ReviewSentiment) || 'neutral');
      setResult(data.result_markdown || '');
      setManualMode(data.mode === 'manual');
      setGenerating(false);
      setTitles(Array.isArray(data.titles) ? data.titles : []);
      setSelectedTitle(data.selected_title || '');
      setMentioned(data.mentioned || '');
      setDescriptionHtml(data.description_html || '');
      setCoverImageUrl(data.cover_source_url || '');
      setCoverDataUrl(data.cover_url || '');
      setTitleLabelOn(!!data.title_label_on);
      setStep(inferPreprodStep(data, item.kind) as Step);
      setPersistedData(data);
      latestDataRef.current = data;
      setCreating(false);
      return;
    }

    let cancelled = false;
    setCreating(true);
    (async () => {
      const { data, error } = await supabase
        .from('preprod_pautas')
        .insert({
          publication_date: preprodDate(date!),
          status: 'draft',
          data: {},
        })
        .select('*')
        .single();
      if (cancelled) return;
      setCreating(false);
      if (error || !data) {
        toast.error('Falha ao criar rascunho: ' + (error?.message ?? 'erro desconhecido'));
        onClose();
        return;
      }
      setPautaId(data.id);
      setPersistedData({});
      latestDataRef.current = {};
      onSaved?.(normalizePreprodPauta(data));
      void onChanged();
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date?.toISOString(), item?.id]);

  const pickKind = async (k: PreprodKind) => {
    if (!pautaId) return;
    setKind(k);
    setStep('release');
    const nextData = { ...latestDataRef.current, step: 'release' };
    setPersistedData(nextData);
    latestDataRef.current = nextData;
    const { data, error } = await supabase
      .from('preprod_pautas')
      .update({ kind: k, data: nextData as any, status: inferPreprodStatus({ status: 'draft', data: nextData }) })
      .eq('id', pautaId)
      .select('*')
      .single();
    if (error) toast.error('Falha ao salvar tipo: ' + error.message);
    else {
      onSaved?.(data ? normalizePreprodPauta(data) : ({ ...(item || {}), id: pautaId, publication_date: preprodDate(effectiveDate!), kind: k, status: inferPreprodStatus({ status: 'draft', data: nextData }), data: nextData, created_at: item?.created_at || new Date().toISOString(), updated_at: new Date().toISOString() } as PreprodPauta));
      void onChanged();
    }
  };

  const pickRelease = async (id: string) => {
    if (!pautaId) return;
    setReleaseId(id);
    const r = releases.find(x => x.id === id);
    const nextData = {
      ...latestDataRef.current,
      release_id: id,
      artist: r?.artist,
      album: r?.album,
      step: 'research',
    };
    setPersistedData(nextData);
    latestDataRef.current = nextData;
    const { data, error } = await supabase
      .from('preprod_pautas')
      .update({ data: nextData as any, status: inferPreprodStatus({ status: 'draft', data: nextData }) })
      .eq('id', pautaId)
      .select('*')
      .single();
    if (error) toast.error('Falha ao salvar disco: ' + error.message);
    else {
      onSaved?.(data ? normalizePreprodPauta(data) : ({ ...(item || {}), id: pautaId, publication_date: preprodDate(effectiveDate!), kind, status: inferPreprodStatus({ status: 'draft', data: nextData }), data: nextData, created_at: item?.created_at || new Date().toISOString(), updated_at: new Date().toISOString() } as PreprodPauta));
      void onChanged();
    }
  };

  const filteredReleases = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [] as typeof releases;
    return releases
      .filter(r => `${r.artist} ${r.album} ${(r.genres || []).join(' ')}`.toLowerCase().includes(term))
      .slice(0, 25);
  }, [releases, query]);

  const selectedRelease = releaseId ? releases.find(r => r.id === releaseId) : null;

  // Build the default research query whenever we enter the research step
  useEffect(() => {
    if (step !== 'research') return;
    if (researchQuery.trim()) return;
    const r = selectedRelease;
    const year = r?.release_date ? String(r.release_date).slice(0, 4) : '';
    const key = kind === 'news' ? 'standalone.news.with_release' : 'standalone.review.with_release';
    const q = renderQueryTemplate(key, {
      artist: r?.artist || '',
      album: r?.album || '',
      year,
      notes: '',
    });
    setResearchQuery(q);
  }, [step, selectedRelease, kind, researchQuery]);

  const persistData = async (patch: Record<string, any>, explicitStatus?: string) => {
    if (!pautaId) return;
    const nextStep = (patch.step || step) as Step;
    const seq = ++saveSeqRef.current;
    const base: Record<string, any> = {
      release_id: releaseId ?? latestDataRef.current.release_id,
      artist: selectedRelease?.artist ?? latestDataRef.current.artist,
      album: selectedRelease?.album ?? latestDataRef.current.album,
      research_query: researchQuery,
      insumo,
      length_words: lengthWords,
      sentiment,
      result_markdown: result,
      titles,
      selected_title: selectedTitle,
      title_label_on: titleLabelOn,
      mentioned,
      description_html: descriptionHtml,
      cover_source_url: coverImageUrl,
      cover_url: coverDataUrl,
      step: nextStep,
    };
    const rawNextData = { ...latestDataRef.current, ...base, ...patch };
    const nextData = Object.fromEntries(Object.entries(rawNextData).filter(([, value]) => value !== undefined));
    setPersistedData(nextData);
    latestDataRef.current = nextData;
    const status = explicitStatus || inferPreprodStatus({ status: 'draft', data: nextData });
    const { data, error } = await supabase
      .from('preprod_pautas')
      .update({ data: nextData as any, status })
      .eq('id', pautaId)
      .select('*')
      .single();
    if (error) toast.error('Falha ao salvar: ' + error.message);
    else {
      if (data) onSaved?.(normalizePreprodPauta(data));
      if (seq === saveSeqRef.current) void onChanged();
    }
  };

  useEffect(() => {
    if (!pautaId) return;
    const patch: Record<string, any> = {
      research_query: researchQuery,
      insumo,
      length_words: lengthWords,
      sentiment,
      result_markdown: result,
      titles,
      selected_title: selectedTitle,
      title_label_on: titleLabelOn,
      mentioned,
      description_html: descriptionHtml,
      cover_source_url: coverImageUrl,
      cover_url: coverDataUrl,
      step,
    };
    if (releaseId) patch.release_id = releaseId;
    if (selectedRelease?.artist) patch.artist = selectedRelease.artist;
    if (selectedRelease?.album) patch.album = selectedRelease.album;

    const isDirty = Object.entries(patch).some(([key, value]) => (
      JSON.stringify(latestDataRef.current[key] ?? null) !== JSON.stringify(value ?? null)
    ));
    if (!isDirty) return;

    const timer = window.setTimeout(() => {
      void persistData(patch);
    }, 650);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pautaId, releaseId, selectedRelease?.artist, selectedRelease?.album, researchQuery, insumo, lengthWords, sentiment, result, titles, selectedTitle, titleLabelOn, mentioned, descriptionHtml, coverImageUrl, coverDataUrl, step]);

  const openManualSearch = () => {
    const url = `https://www.google.com/search?q=${encodeURIComponent(researchQuery)}`;
    window.open(url, '_blank', 'noopener');
    setStep('insumo');
    persistData({ research_query: researchQuery, research_mode: 'manual', step: 'insumo' });
  };

  const goToStep = (nextStep: Step, patch: Record<string, any> = {}) => {
    setStep(nextStep);
    void persistData({ ...patch, step: nextStep });
  };

  const runAiSearch = async () => {
    setAiLoading(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-research`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ query: researchQuery }),
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.error || `Erro ${resp.status}`);
      }
      const { notes } = await resp.json();
      setInsumo(notes || '');
      setStep('insumo');
      await persistData({ insumo: notes || '', research_mode: 'ai', research_query: researchQuery, step: 'insumo' });
      toast.success('Pesquisa IA concluída.');
    } catch (e: any) {
      toast.error('Falha na busca IA: ' + (e?.message || 'erro'));
    } finally {
      setAiLoading(false);
    }
  };

  const discard = async () => {
    if (pautaId) {
      const { error } = await supabase.from('preprod_pautas').delete().eq('id', pautaId);
      if (error) toast.error('Falha ao descartar: ' + error.message);
      else toast.success('Rascunho descartado.');
    }
    setConfirmDiscard(false);
    onClose();
  };

  const runGenerateAll = async () => {
    if (kind !== 'review') {
      toast.info('Fluxo automático disponível apenas para Review por enquanto.');
      return;
    }
    const release = selectedRelease || null;
    if (!release) { toast.error('Selecione um disco antes.'); return; }
    if (!insumo.trim()) { toast.error('Preencha o insumo da pesquisa.'); return; }
    setManualMode(false);
    setGenerating(true);
    setStep('result');
    setResult('');
    progress.start('Gerando review Kilton');
    const banned = (settings?.banned_terms_text || '')
      .split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    const temperature = typeof settings?.brand_tone_temperature === 'number'
      ? Math.max(0, Math.min(1, settings.brand_tone_temperature / 100))
      : 0.7;
    try {
      const prompt = buildKiltonReviewPrompt(
        { release, insumo, lengthWords: lengthWordsNum, sentiment },
        settings,
      );
      let text = await streamGeneratePauta({
        prompt,
        bannedTerms: banned,
        temperature,
        system: 'Você é o redator-chefe do podcast Heavynauta. Saída em Markdown puro.',
        label: 'Review Kilton',
        progress,
        silentLifecycle: true,
        onChunk: (full) => setResult(full),
      });
      // Length adjustment loop — single retry if outside ±15%.
      // Se o campo length estiver vazio, faz bypass desse passo.
      const actual = countWords(text);
      const lengthProvided = lengthWords.trim() !== '';
      const lo = Math.floor(lengthWordsNum * 0.85);
      const hi = Math.ceil(lengthWordsNum * 1.15);
      if (lengthProvided && (actual < lo || actual > hi)) {
        progress.pushAttempt({ model: `▶ Ajuste de tamanho (${actual} → ~${lengthWordsNum})`, status: 'trying' });
        const adjusted = await streamGeneratePauta({
          prompt: buildLengthAdjustPrompt(text, lengthWordsNum),
          bannedTerms: banned,
          temperature: 0.4,
          system: 'Você ajusta o tamanho de textos editoriais sem perder estrutura.',
          label: 'Ajuste de tamanho',
          progress,
          silentLifecycle: true,
          onChunk: (full) => setResult(full),
        });
        text = adjusted || text;
      }
      await persistData({
        length_words: lengthWordsNum,
        sentiment,
        mode: 'generate_all',
        result_markdown: text,
        word_count: countWords(text),
        step: 'result',
      });
      progress.finish(null);
      toast.success(`Pauta gerada (${countWords(text)} palavras).`);
    } catch (e: any) {
      progress.finish(e?.message || 'erro');
      toast.error('Falha ao gerar: ' + (e?.message || 'erro'));
    } finally {
      setGenerating(false);
    }
  };

  // ── Títulos ────────────────────────────────────────────────────────────
  const runGenerateTitles = async () => {
    if (!result.trim()) { toast.error('Gere a pauta primeiro.'); return; }
    setTitlesLoading(true);
    progress.start('Gerando títulos');
    try {
      const banned = (settings?.banned_terms_text || '')
        .split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      const raw = await streamGeneratePauta({
        prompt: buildTitlesPrompt({ release: selectedRelease || null, pautaMarkdown: result, insumo }),
        bannedTerms: banned,
        temperature: 0.85,
        system: 'Você gera 3 opções de título seguindo um contrato JSON estrito.',
        label: 'Títulos',
        progress,
        silentLifecycle: true,
        onChunk: () => {},
      });
      const parsed = parseTitlesJson(raw);
      if (parsed.length === 0) {
        toast.error('Não consegui interpretar as opções de título. Tente regenerar.');
      } else {
        setTitles(parsed);
        await persistData({ titles: parsed, step: 'titles' });
      }
      progress.finish(null);
    } catch (e: any) {
      progress.finish(e?.message || 'erro');
      toast.error('Falha ao gerar títulos: ' + (e?.message || 'erro'));
    } finally {
      setTitlesLoading(false);
    }
  };

  const pickTitle = async (text: string) => {
    const finalText = applyTitleLabel(text);
    setSelectedTitle(finalText);
    await persistData({ selected_title: finalText, titles, title_label_on: titleLabelOn, step: 'titles' });
  };

  const titleLabelPrefix = selectedRelease
    ? `Resenha: ${selectedRelease.artist} - ${selectedRelease.album} `
    : '';
  const applyTitleLabel = (text: string) =>
    titleLabelOn && titleLabelPrefix ? `${titleLabelPrefix}${text}` : text;

  // ── Descrição ──────────────────────────────────────────────────────────
  const runGenerateDescription = async () => {
    if (!selectedTitle.trim()) { toast.error('Escolha um título primeiro.'); return; }
    setDescLoading(true);
    progress.start('Gerando descrição');
    try {
      const banned = (settings?.banned_terms_text || '')
        .split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      let acc = '';
      const raw = await streamGeneratePauta({
        prompt: buildDescriptionPrompt({
          selectedTitle,
          pautaMarkdown: result,
          mentioned,
          release: selectedRelease || null,
        }),
        bannedTerms: banned,
        temperature: 0.6,
        system: 'Você gera APENAS a descrição editorial HTML do episódio. Sem markdown. Sem bloco institucional. Sem CTAs.',
        label: 'Descrição',
        progress,
        silentLifecycle: true,
        onChunk: (full) => { acc = full; },
      });
      const editorial = sanitizeDescriptionHtml(raw || acc);
      const composed = composeFinalDescriptionHtml(editorial);
      setDescriptionHtml(composed);
      await persistData({
        selected_title: selectedTitle,
        mentioned,
        description_html: composed,
        step: 'description',
      });
      progress.finish(null);
      toast.success('Descrição gerada.');
    } catch (e: any) {
      progress.finish(e?.message || 'erro');
      toast.error('Falha ao gerar descrição: ' + (e?.message || 'erro'));
    } finally {
      setDescLoading(false);
    }
  };

  // ── Capa ───────────────────────────────────────────────────────────────
  const runGenerateCover = () => {
    if (!coverImageUrl.trim()) { toast.error('Cole a URL de uma imagem.'); return; }
    const title = selectedTitle || (selectedRelease ? `${selectedRelease.artist} — ${selectedRelease.album}` : '');
    setCoverGenerating(true);
    generateCoverImage({
      imageUrl: coverImageUrl,
      title,
      onComplete: async (dataUrl) => {
        setCoverDataUrl(dataUrl);
        setCoverGenerating(false);
        await persistData({ cover_url: dataUrl, cover_source_url: coverImageUrl, step: 'cover' });
        toast.success('Capa gerada!');
      },
      onError: (err) => {
        setCoverGenerating(false);
        toast.error(err);
      },
    });
  };

  const downloadCover = () => {
    if (!coverDataUrl) return;
    const a = document.createElement('a');
    a.href = coverDataUrl;
    a.download = `capa-${(selectedTitle || 'episodio').slice(0, 60).replace(/[^\w-]+/g, '-')}.png`;
    a.click();
  };

  const copy = async (text: string, msg = 'Copiado.') => {
    await navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  const closeKeepingDraft = async () => {
    console.log('[DBG] closeKeepingDraft start pautaId=', pautaId, 'step=', step);
    if (pautaId) {
      try { await persistData({ step }); } catch (e) { console.log('[DBG] persist threw', e); }
    }
    console.log('[DBG] closeKeepingDraft calling onClose');
    onClose();
    console.log('[DBG] closeKeepingDraft after onClose');
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) void closeKeepingDraft(); // closing keeps the draft saved
  };

  return (
    <>
      <Dialog open={!!effectiveDate} onOpenChange={handleOpenChange}>
        <DialogContent className={cn(step === 'package' ? 'max-w-5xl' : 'max-w-2xl', 'max-h-[92vh] overflow-y-auto')}>
          <DialogHeader>
            <DialogTitle>{item ? 'Editar pauta' : 'Nova pauta'}</DialogTitle>
            <DialogDescription className="capitalize">
              {effectiveDate ? format(effectiveDate, "EEEE, dd 'de' MMMM yyyy", { locale: ptBR }) : ''}
              {creating && <span className="ml-2 inline-flex items-center gap-1 text-xs"><Loader2 className="h-3 w-3 animate-spin" /> salvando rascunho…</span>}
            </DialogDescription>
          </DialogHeader>

          {step === 'kind' && (
            <div className="py-6">
              <p className="text-sm text-muted-foreground mb-4">Que tipo de pauta você quer criar?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={!pautaId}
                  onClick={() => pickKind('review')}
                  className="group rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition p-6 text-left flex flex-col items-start gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition">
                    <Star className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="font-semibold text-base">Review</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Resenha de um álbum / lançamento.</div>
                  </div>
                </button>
                <button
                  type="button"
                  disabled={!pautaId}
                  onClick={() => pickKind('news')}
                  className="group rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition p-6 text-left flex flex-col items-start gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition">
                    <Newspaper className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="font-semibold text-base">Notícia</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Cobertura de uma notícia do cenário.</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {step === 'release' && kind && (
            <div className="py-2 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  {kind === 'review' ? <Star className="h-4 w-4 text-primary" /> : <Newspaper className="h-4 w-4 text-primary" />}
                  <span className="font-medium">{kind === 'review' ? 'Review' : 'Notícia'}</span>
                  <button onClick={() => pickKind(kind === 'review' ? 'news' : 'review')} className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2">
                    trocar para {kind === 'review' ? 'Notícia' : 'Review'}
                  </button>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShortlistOpen(true)}>
                  <Star className="h-3.5 w-3.5" /> Shortlist
                </Button>
              </div>

              {selectedRelease ? (
                <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 flex items-start gap-3">
                  <Disc className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{selectedRelease.artist} — {selectedRelease.album}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(selectedRelease.genres || []).slice(0, 4).map(g => (
                        <Badge key={g} variant="secondary" className="font-normal text-[10px]">{g}</Badge>
                      ))}
                      {selectedRelease.country && <Badge variant="outline" className="font-normal text-[10px]">{selectedRelease.country}</Badge>}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" title="Trocar disco" onClick={() => { setReleaseId(null); setQuery(''); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      autoFocus
                      placeholder="Buscar disco por artista, álbum ou gênero..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="pl-7 h-9"
                    />
                  </div>

                  {query.trim() && (
                    <ScrollArea className="h-[260px] rounded-md border border-border">
                      {filteredReleases.length === 0 ? (
                        <div className="p-6 text-center text-xs text-muted-foreground">
                          Nenhum lançamento encontrado.
                        </div>
                      ) : (
                        <ul className="divide-y divide-border">
                          {filteredReleases.map(r => {
                            const ma = resolveAllLinks(r).metal_archives || r.metal_archives_url;
                            return (
                              <li key={r.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40">
                                <button
                                  type="button"
                                  onClick={() => pickRelease(r.id)}
                                  className="flex-1 text-left min-w-0"
                                >
                                  <div className="text-sm font-medium truncate">{r.artist} — {r.album}</div>
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {(r.genres || []).slice(0, 3).map(g => (
                                      <span key={g} className="text-[10px] text-muted-foreground">{g}</span>
                                    ))}
                                  </div>
                                </button>
                                {ma && (
                                  <a href={ma} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary" title="Metal Archives">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </ScrollArea>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-muted-foreground">Não encontrou? Cadastre um novo lançamento.</span>
                    <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => navigate('/releases?new=1')}>
                      <Plus className="h-3.5 w-3.5" /> Adicionar lançamento
                    </Button>
                  </div>
                </>
              )}

              {selectedRelease && (
                <div className="flex justify-end pt-2">
                  <Button size="sm" className="gap-2" onClick={() => goToStep('research')}>
                    Seguir <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === 'research' && (
            <div className="py-2 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Pesquisa</div>
                <button onClick={() => goToStep('release')} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> voltar
                </button>
              </div>
              <div>
                <label className="text-[11px] uppercase text-muted-foreground">Query</label>
                <Textarea
                  value={researchQuery}
                  onChange={(e) => setResearchQuery(e.target.value)}
                  rows={3}
                  className="mt-1 text-xs font-mono"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={!researchQuery.trim() || aiLoading}
                  onClick={openManualSearch}
                  className="rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition p-4 text-left flex items-start gap-3 disabled:opacity-50"
                >
                  <Globe className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <div className="font-semibold text-sm">Busca manual</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Abre o Google em nova aba com a query montada.</div>
                  </div>
                </button>
                <button
                  type="button"
                  disabled={!researchQuery.trim() || aiLoading}
                  onClick={runAiSearch}
                  className="rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition p-4 text-left flex items-start gap-3 disabled:opacity-50"
                >
                  {aiLoading ? <Loader2 className="h-5 w-5 text-primary mt-0.5 animate-spin" /> : <Sparkles className="h-5 w-5 text-primary mt-0.5" />}
                  <div>
                    <div className="font-semibold text-sm">Busca automática (IA)</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">DeepSeek V4 Flash + web search via OpenRouter. Popula o insumo.</div>
                  </div>
                </button>
              </div>
              <div className="flex justify-end pt-1">
                <Button size="sm" variant="ghost" onClick={() => goToStep('insumo', { research_query: researchQuery })}>Pular para insumo</Button>
              </div>
            </div>
          )}

          {step === 'insumo' && (
            <div className="py-2 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Insumo</div>
                <button onClick={() => goToStep('research', { insumo })} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> voltar à pesquisa
                </button>
              </div>
              <Textarea
                value={insumo}
                onChange={(e) => setInsumo(e.target.value)}
                onBlur={() => persistData({ insumo })}
                rows={14}
                placeholder="Cole aqui as notas da pesquisa (manual ou IA). Pode editar livremente."
                className="text-sm"
              />
              <div className="flex justify-end pt-1">
                <Button size="sm" className="gap-2" disabled={!insumo.trim()} onClick={() => goToStep('config', { insumo })}>
                  Seguir <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 'config' && (
            <div className="py-2 space-y-5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Configuração da pauta</div>
                <button onClick={() => goToStep('insumo', { length_words: lengthWords, sentiment })} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> voltar ao insumo
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-[11px] uppercase text-muted-foreground">Tamanho (palavras)</Label>
                  <Input
                    type="text"
                    value={lengthWords}
                    onChange={(e) => setLengthWords(e.target.value)}
                    className="mt-1 h-9"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Padrão 500. Tolerância ±15% — se ultrapassar, a IA ajusta automaticamente.</p>
                </div>
                <div>
                  <Label className="text-[11px] uppercase text-muted-foreground">Sentimento</Label>
                  <div className="mt-1 grid grid-cols-3 gap-1">
                    {(['positive','neutral','negative'] as ReviewSentiment[]).map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSentiment(s)}
                        className={cn(
                          'h-9 text-xs rounded-md border transition',
                          sentiment === s ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border hover:bg-accent',
                        )}
                      >{SENTIMENT_LABEL[s]}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setManualMode(true); persistData({ length_words: lengthWords, sentiment, mode: 'manual', step: 'config' }); toast.info('Modo manual — próximos passos em construção.'); }}
                  className="rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition p-4 text-left flex items-start gap-3"
                >
                  <Hammer className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <div className="font-semibold text-sm">Criação manual</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Cada passo você decide — com botões de IA para preencher um a um.</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => runGenerateAll()}
                  disabled={generating}
                  className="rounded-xl border-2 border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10 transition p-4 text-left flex items-start gap-3 disabled:opacity-50"
                >
                  {generating ? <Loader2 className="h-5 w-5 text-primary mt-0.5 animate-spin" /> : <Sparkles className="h-5 w-5 text-primary mt-0.5" />}
                  <div>
                    <div className="font-semibold text-sm">Gerar tudo com IA</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Encadeia chamadas no OpenRouter (DeepSeek V4 Flash) com prompt Kilton + ajuste de tamanho.</div>
                  </div>
                </button>
              </div>

              {manualMode && (
                <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
                  Fluxo manual em construção — os próximos passos virão por aqui, cada um com botão "preencher com IA".
                </div>
              )}
            </div>
          )}

          {step === 'result' && (
            <div className="py-2 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">
                  Resultado · <span className="text-muted-foreground">{countWords(result)} palavras</span>
                  <span className="text-muted-foreground"> / alvo {lengthWords}</span>
                </div>
                <button onClick={() => goToStep('config', { result_markdown: result })} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> voltar
                </button>
              </div>
              <div className="max-h-[60vh] overflow-auto rounded-md border border-border bg-card/40 p-4">
                <MarkdownView text={result} />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(result); toast.success('Copiado.'); }}>Copiar</Button>
                <Button size="sm" disabled={generating} onClick={() => runGenerateAll()} className="gap-2">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Regenerar
                </Button>
                <Button size="sm" disabled={generating || !result.trim()} onClick={() => goToStep('titles', { result_markdown: result })} className="gap-2">
                  Próximo: títulos <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 'titles' && (
            <div className="py-2 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Títulos · 3 opções</div>
                <button onClick={() => goToStep('result', { titles, selected_title: selectedTitle })} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> voltar à pauta
                </button>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="space-y-0.5">
                  <Label htmlFor="title-label-toggle" className="text-xs font-medium cursor-pointer">
                    Label "Resenha: [Banda] - [Álbum]"
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    {titleLabelOn && titleLabelPrefix
                      ? `Prefixo aplicado: ${titleLabelPrefix.trim()}`
                      : 'Off — título usa apenas a resposta da IA.'}
                  </p>
                </div>
                <Switch
                  id="title-label-toggle"
                  checked={titleLabelOn}
                  onCheckedChange={(v) => {
                    setTitleLabelOn(v);
                    // Re-sync the selected title with/without the prefix.
                    if (selectedTitle) {
                      const stripped = titleLabelPrefix && selectedTitle.startsWith(titleLabelPrefix)
                        ? selectedTitle.slice(titleLabelPrefix.length)
                        : selectedTitle;
                      const next = v && titleLabelPrefix ? `${titleLabelPrefix}${stripped}` : stripped;
                      setSelectedTitle(next);
                      persistData({ title_label_on: v, selected_title: next });
                    } else {
                      persistData({ title_label_on: v });
                    }
                  }}
                />
              </div>
              {titles.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-6 text-center">
                  <p className="text-xs text-muted-foreground mb-3">Clickbait · Curiosidade · Impacto — até 70 caracteres, máx 2 emojis, sem clickbait enganoso.</p>
                  <Button size="sm" disabled={titlesLoading} onClick={runGenerateTitles} className="gap-2">
                    {titlesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Gerar títulos
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {titles.map((t) => {
                    const displayText = applyTitleLabel(t.text);
                    const isSel = displayText === selectedTitle;
                    return (
                      <div key={t.kind}
                        className={cn(
                          'rounded-lg border p-3 transition cursor-pointer',
                          isSel ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50',
                        )}
                        onClick={() => pickTitle(t.text)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="secondary" className="text-[10px]">{TITLE_STYLE_LABEL[t.kind]}</Badge>
                          <span className="text-[10px] text-muted-foreground">{displayText.length} caracteres</span>
                        </div>
                        <div className="text-sm font-medium mt-1.5">{displayText}</div>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between pt-2">
                    <Button size="sm" variant="ghost" disabled={titlesLoading} onClick={runGenerateTitles} className="gap-2">
                      {titlesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Regenerar
                    </Button>
                    <Button size="sm" disabled={!selectedTitle} onClick={() => goToStep('description', { titles, selected_title: selectedTitle, title_label_on: titleLabelOn })} className="gap-2">
                      Próximo: descrição <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'description' && (
            <div className="py-2 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Descrição HTML</div>
                <button onClick={() => goToStep('titles', { mentioned, description_html: descriptionHtml })} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> voltar a títulos
                </button>
              </div>
              {selectedTitle && (
                <div className="rounded-md border border-border bg-card/40 p-3">
                  <div className="text-[10px] uppercase text-muted-foreground">Título selecionado</div>
                  <div className="text-sm font-medium">{selectedTitle}</div>
                </div>
              )}
              <div>
                <Label className="text-[11px] uppercase text-muted-foreground">Mencionado no Episódio</Label>
                <Textarea
                  value={mentioned}
                  onChange={(e) => setMentioned(e.target.value)}
                  onBlur={() => persistData({ mentioned })}
                  rows={4}
                  placeholder="Cole links, vídeos ou assuntos que você mencionou no episódio (um por linha)…"
                  className="mt-1 text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">A IA gera a seção "🎙️ Mencionado neste episódio" no topo da descrição.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={descLoading} onClick={runGenerateDescription} className="gap-2">
                  {descLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Gerar descrição (IA)
                </Button>
                {descriptionHtml && (
                  <Button size="sm" variant="outline" onClick={() => copy(descriptionHtml, 'HTML copiado.')} className="gap-2">
                    <Copy className="h-4 w-4" /> Copiar HTML
                  </Button>
                )}
              </div>
              {descriptionHtml && (
                <>
                  <div>
                    <Label className="text-[11px] uppercase text-muted-foreground">Preview</Label>
                    <div className="mt-1 rounded-md border border-border bg-card/40 p-3 max-h-[40vh] overflow-auto text-sm prose prose-sm prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
                  </div>
                  <div>
                    <Label className="text-[11px] uppercase text-muted-foreground">HTML (editável)</Label>
                    <Textarea
                      value={descriptionHtml}
                      onChange={(e) => setDescriptionHtml(e.target.value)}
                      onBlur={() => persistData({ description_html: descriptionHtml })}
                      rows={10}
                      className="mt-1 text-xs font-mono"
                    />
                  </div>
                  <div className="flex items-center justify-end">
                    <Button size="sm" onClick={() => goToStep('cover', { mentioned, description_html: descriptionHtml })} className="gap-2">
                      Próximo: capa <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 'cover' && (
            <div className="py-2 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Capa do episódio</div>
                <button onClick={() => goToStep('description', { cover_source_url: coverImageUrl, cover_url: coverDataUrl })} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> voltar à descrição
                </button>
              </div>
              <div>
                <Label className="text-[11px] uppercase text-muted-foreground">URL da imagem</Label>
                <Input
                  value={coverImageUrl}
                  onChange={(e) => setCoverImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="mt-1 h-9 text-sm"
                />
              </div>
              {coverImageUrl.trim() && /^https?:\/\//i.test(coverImageUrl.trim()) && (
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase text-muted-foreground">Pré-visualização da imagem original</Label>
                  <img
                    src={coverImageUrl}
                    alt="Preview da imagem original"
                    className="w-full max-w-xs mx-auto rounded-md border border-border object-contain bg-muted"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'block'; }}
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => {
                  const q = selectedRelease ? `${selectedRelease.artist} ${selectedRelease.album} band photo` : selectedTitle;
                  window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`, '_blank');
                }} className="gap-2">
                  <Search className="h-4 w-4" /> Buscar imagens
                </Button>
                <Button size="sm" disabled={coverGenerating || !coverImageUrl.trim()} onClick={runGenerateCover} className="gap-2">
                  {coverGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Gerar capa
                </Button>
              </div>
              {coverDataUrl && (
                <div className="space-y-2">
                  <img src={coverDataUrl} alt="Preview da capa" className="w-full max-w-sm mx-auto rounded-md border border-border" />
                  <div className="flex items-center justify-between">
                    <Button size="sm" variant="outline" onClick={downloadCover} className="gap-2">
                      <Download className="h-4 w-4" /> Baixar capa
                    </Button>
                    <Button size="sm" onClick={() => goToStep('package', { cover_url: coverDataUrl, cover_source_url: coverImageUrl, packaged_at: new Date().toISOString() })} className="gap-2">
                      Próximo: pacote <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              {!coverDataUrl && (
                <div className="flex items-center justify-end">
                  <Button size="sm" variant="ghost" onClick={() => goToStep('package', { cover_source_url: coverImageUrl, packaged_at: new Date().toISOString() })}>Pular capa</Button>
                </div>
              )}
            </div>
          )}

          {step === 'package' && (
            <div className="py-2">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-base font-semibold">Pacote do episódio</div>
                  <div className="text-xs text-muted-foreground">Copie título e HTML, baixe a capa e atualize o link do Spotify.</div>
                </div>
                <button onClick={() => goToStep('cover', { selected_title: selectedTitle, description_html: descriptionHtml, mentioned })} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> voltar
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {effectiveDate && <Badge variant="secondary" className="text-[10px] capitalize">{format(effectiveDate, 'EEEE', { locale: ptBR })}</Badge>}
                {effectiveDate && <Badge variant="secondary" className="text-[10px]">{format(effectiveDate, 'yyyy-MM-dd')}</Badge>}
                {coverDataUrl && <Badge variant="secondary" className="text-[10px] gap-1"><Check className="h-3 w-3" /> Capa pronta</Badge>}
                {descriptionHtml && <Badge variant="secondary" className="text-[10px] gap-1"><Check className="h-3 w-3" /> Descrição pronta</Badge>}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-4">
                  <div className="rounded-lg border border-border bg-card/40 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-[11px] uppercase text-muted-foreground">Título selecionado</Label>
                      <Button size="sm" variant="ghost" className="h-7 gap-1.5" onClick={() => copy(selectedTitle)}>
                        <Copy className="h-3.5 w-3.5" /> Copiar
                      </Button>
                    </div>
                    <Textarea value={selectedTitle} onChange={(e) => setSelectedTitle(e.target.value)} onBlur={() => persistData({ selected_title: selectedTitle })} rows={2} className="text-sm" />
                  </div>
                  <div className="rounded-lg border border-border bg-card/40 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-[11px] uppercase text-muted-foreground gap-1.5 inline-flex items-center">🎙️ Mencionado no Episódio</Label>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => persistData({ mentioned })}>Salvar</Button>
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => { setMentioned(''); persistData({ mentioned: '' }); }}>Limpar</Button>
                      </div>
                    </div>
                    <Textarea value={mentioned} onChange={(e) => setMentioned(e.target.value)} rows={4} placeholder="Cole links, vídeos ou assuntos…" className="text-sm" />
                  </div>
                  <div className="rounded-lg border border-border bg-card/40 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-[11px] uppercase text-muted-foreground">Descrição em HTML</Label>
                      <Button size="sm" variant="ghost" className="h-7 gap-1.5" onClick={() => copy(descriptionHtml, 'HTML copiado.')}>
                        <Copy className="h-3.5 w-3.5" /> Copiar
                      </Button>
                    </div>
                    <Textarea value={descriptionHtml} onChange={(e) => setDescriptionHtml(e.target.value)} onBlur={() => persistData({ description_html: descriptionHtml })} rows={12} className="text-xs font-mono" />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-card/40 p-3">
                    <Label className="text-[11px] uppercase text-muted-foreground">Capa do episódio</Label>
                    {coverDataUrl ? (
                      <img src={coverDataUrl} alt="Capa" className="mt-2 w-full rounded-md border border-border" />
                    ) : (
                      <div className="mt-2 aspect-square rounded-md border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">
                        <ImageIcon className="h-6 w-6 opacity-50" />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <Button size="sm" variant="outline" className="gap-1.5" disabled={!coverDataUrl} onClick={downloadCover}>
                        <Download className="h-3.5 w-3.5" /> Baixar
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => goToStep('cover', { selected_title: selectedTitle, description_html: descriptionHtml, mentioned })}>
                        <Sparkles className="h-3.5 w-3.5" /> Gerar
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card/40 p-3 space-y-1.5">
                    <Label className="text-[11px] uppercase text-muted-foreground">Ações rápidas</Label>
                    <Button size="sm" variant="ghost" className="w-full justify-start gap-2" onClick={() => copy(`${selectedTitle}\n\n${descriptionHtml}`, 'Pacote copiado.')}>
                      <Package className="h-4 w-4" /> Copiar título + HTML
                    </Button>
                    <Button size="sm" variant="ghost" className="w-full justify-start gap-2" onClick={() => window.open('https://creators.spotify.com/', '_blank', 'noopener')}>
                      <ExternalLink className="h-4 w-4" /> Spotify for Creators
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex sm:justify-between gap-2">
            <Button variant="ghost" className="text-destructive hover:text-destructive gap-2" onClick={() => setConfirmDiscard(true)}>
              <Trash2 className="h-4 w-4" /> Descartar
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void closeKeepingDraft()}>Fechar (manter rascunho)</Button>
              {step === 'package' && (
                <Button
                  onClick={async () => {
                    await persistData({ step: 'package', finalized_at: new Date().toISOString() }, 'ready');
                    toast.success('Pauta marcada como pronta.');
                    onClose();
                  }}
                >
                  Salvar como pronto
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ShortlistDialog
        open={shortlistOpen}
        onClose={() => setShortlistOpen(false)}
        onCreatePautaFromRelease={(id) => { pickRelease(id); setShortlistOpen(false); }}
      />

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar rascunho?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga este rascunho do banco imediatamente. Não dá pra desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={discard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Descartar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}