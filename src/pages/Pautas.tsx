import { useState, useMemo, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileText, Plus, Copy, Check, Sparkles, Download, Trash2, AlertTriangle, ExternalLink, Upload, CalendarIcon, Loader2, Zap, ChevronLeft, ChevronRight, Save, Eye, Circle, Wand2, Newspaper, Link2, FolderOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { GenerationProgressModal, GenerationItem } from '@/components/GenerationProgressModal';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { resolveAllLinks } from '@/lib/dynamic-links';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { ExpandDayDialog } from '@/components/workspace/ExpandDayDialog';
import { StatusBadge } from '@/components/StatusBadge';
import { useApp } from '@/contexts/AppContext';
import { getSectionsForDay, DAY_SLOTS, NORMALIZED_GENRES } from '@/lib/constants';
import { Pauta, PautaSections, DaySlot, Release, EpisodeMaterial } from '@/lib/types';
import { buildWeekPrompt, buildDayPrompt, buildSectionPrompt, toneProfileForTemperature, PROMPT_SCHEMA_VERSION, sectionHasInput, type PromptBuildContext } from '@/lib/prompt-builder';
import { DirectionEditor, buildSectionSearchQuery } from '@/components/pautas/DirectionEditor';
import { parsePautaResponse } from '@/lib/response-parser';
import { toast } from 'sonner';

function getPautaSlot(pauta: Pauta): DaySlot {
  const d = new Date(pauta.publication_date + 'T12:00:00');
  const wd = d.getDay();
  const slotMap: Record<number, DaySlot> = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };
  return slotMap[wd] || 'monday';
}

// No filter — show all releases for review selection
function getEligibleReviews(releases: Release[], _publicationDate: string): Release[] {
  return releases;
}

function getISOWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const dayOfWeek = d.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${format(monday, 'dd/MM')} – ${format(sunday, 'dd/MM')}`;
}

// NORMALIZED_GENRES imported from constants

function normalizeGenre(genre: string): string {
  const lower = genre.toLowerCase().trim();
  for (const ng of NORMALIZED_GENRES) {
    if (lower === ng.toLowerCase()) return ng;
    const ngLower = ng.toLowerCase();
    if (lower.includes(ngLower.replace(' metal', '')) && ngLower.includes('metal')) return ng;
  }
  if (lower.includes('thrash')) return 'Thrash Metal';
  if (lower.includes('death') && lower.includes('melod')) return 'Melodic Death Metal';
  if (lower.includes('death')) return 'Death Metal';
  if (lower.includes('black')) return 'Black Metal';
  if (lower.includes('power')) return 'Power Metal';
  if (lower.includes('doom') || lower.includes('stoner') || lower.includes('sludge')) return 'Doom Metal';
  if (lower.includes('prog')) return 'Progressive Metal';
  if (lower.includes('groove')) return 'Groove Metal';
  if (lower.includes('core') || lower.includes('deathcore') || lower.includes('metalcore')) return 'Metalcore';
  if (lower.includes('symphonic')) return 'Symphonic Metal';
  if (lower.includes('heavy') || lower.includes('nwobhm') || lower.includes('traditional')) return 'Heavy Metal';
  return 'Heavy Metal';
}

function getFirstNormalizedGenre(release: Release): string {
  if (!release.genres || release.genres.length === 0) return 'Heavy Metal';
  return normalizeGenre(release.genres[0]);
}

function groupReleasesByWeekAndGenre(releases: Release[]): { weekLabel: string; genres: { genre: string; releases: Release[] }[] }[] {
  const weekMap = new Map<string, Release[]>();
  for (const r of releases) {
    const label = getISOWeekLabel(r.release_date);
    if (!weekMap.has(label)) weekMap.set(label, []);
    weekMap.get(label)!.push(r);
  }
  const result: { weekLabel: string; genres: { genre: string; releases: Release[] }[] }[] = [];
  for (const [weekLabel, rels] of weekMap) {
    const genreMap = new Map<string, Release[]>();
    for (const r of rels) {
      const genre = getFirstNormalizedGenre(r);
      if (!genreMap.has(genre)) genreMap.set(genre, []);
      genreMap.get(genre)!.push(r);
    }
    const genres = Array.from(genreMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([genre, releases]) => ({ genre, releases: releases.sort((a, b) => a.release_date.localeCompare(b.release_date)) }));
    result.push({ weekLabel, genres });
  }
  // Sort weeks from oldest to newest
  result.sort((a, b) => a.weekLabel.localeCompare(b.weekLabel));
  return result;
}

function getEligibleSaturdayReleases(releases: Release[], publicationDate: string): Release[] {
  const pub = new Date(publicationDate + 'T12:00:00');
  const dPlus2 = new Date(pub); dPlus2.setDate(pub.getDate() + 2);
  const dPlus8 = new Date(pub); dPlus8.setDate(pub.getDate() + 8);
  const minDate = dPlus2.toISOString().slice(0, 10);
  const maxDate = dPlus8.toISOString().slice(0, 10);
  return releases.filter(r => r.release_date >= minDate && r.release_date <= maxDate);
}

// Flow step definitions - added saturday_releases step
const FLOW_STEPS = [
  { key: 'anniversary', label: 'Aniversários', inputKey: 'anniversary' },
  { key: 'review_rafa', label: 'Review Rafa', inputKey: 'review_rafa_id', isReview: true },
  { key: 'news', label: 'Notícias', inputKey: 'news_link' },
  { key: 'review_kilton', label: 'Review Kilton', inputKey: 'review_kilton_id', isReview: true },
  { key: 'saturday_releases', label: 'Lançamentos Sábado', inputKey: 'selected_release_ids' },
] as const;

// Compute dynamic pauta status based on pauta + material state
function computePautaStatus(pauta: Pauta, material: EpisodeMaterial | undefined): Pauta['status'] {
  const slot = getPautaSlot(pauta);
  const sections = getSectionsForDay(slot);
  const data = (pauta.sections_json || {}) as Record<string, string>;
  const inputs = (pauta.raw_inputs_json || {}) as Record<string, any>;

  // Check if all inputs are filled
  let inputsComplete = !!inputs.anniversary?.trim();
  if (slot !== 'saturday' && slot !== 'sunday') {
    inputsComplete = inputsComplete && (!!inputs.review_rafa_id || !!inputs.review_kilton_id) && !!inputs.news_link?.trim();
  }
  if (slot === 'saturday') {
    inputsComplete = inputsComplete || (inputs.selected_release_ids?.length > 0);
  }

  // Check if all sections have AI content
  const allSectionsFilled = sections.every(s => data[s.key]?.trim());

  // Check material state
  const hasTitle = material?.selected_title_index != null;
  const hasDescription = !!material?.description_html;
  const hasCover = !!material?.cover_url;
  const hasSpotify = !!material?.spotify_link;

  // Published: today >= episode date AND agendado
  if (hasSpotify && pauta.publication_date <= new Date().toISOString().slice(0, 10)) {
    return 'publicado';
  }
  // Agendado: spotify link filled
  if (hasSpotify) return 'agendado';
  // Pronto para agendar: TODO - for now skip, handled by Rivaldo
  // Pronto para gravar: has cover
  if (hasCover && hasTitle && hasDescription && allSectionsFilled) return 'pronto_gravar';
  // Criando materiais: sections done, working on materials
  if (allSectionsFilled && (hasTitle || hasDescription)) return 'criando_materiais';
  // Revisão: all sections filled
  if (allSectionsFilled) return 'revisao';
  // Pesquisa: still collecting inputs
  return 'pesquisa';
}

function isMaterialSaved(material?: Pick<EpisodeMaterial, 'repository_url' | 'repository_file_id' | 'repository_uploaded_at' | 'repository_provider'> | null) {
  if (!material) return false;
  return !!(
    material.repository_file_id ||
    material.repository_url ||
    material.repository_uploaded_at ||
    material.repository_provider === 'onedrive'
  );
}

export default function Pautas() {
  const { weeks, addWeek, deleteWeek, pautas, addPauta, updatePauta, getPautasForWeek, settings, releases, recalcWeekStatus, savePromptSession, logActivity, materials, getMaterialsForWeek, updateMaterial } = useApp();
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [newWeekDate, setNewWeekDate] = useState<Date | undefined>(undefined);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [addPautaDialogOpen, setAddPautaDialogOpen] = useState(false);
  const [newPautaDate, setNewPautaDate] = useState<Date | undefined>(undefined);
  const [newPautaTemplateId, setNewPautaTemplateId] = useState<string>('none');
  const [templates, setTemplates] = useState<any[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [activePauta, setActivePauta] = useState<Pauta | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [promptResponse, setPromptResponse] = useState('');
  const [applyScope, setApplyScope] = useState<'all' | 'section'>('all');
  const [applySection, setApplySection] = useState('');
  const [copied, setCopied] = useState(false);
  const [exportFormat, setExportFormat] = useState<'txt' | 'md' | 'json' | 'clipboard'>('clipboard');
  const [activeTab, setActiveTab] = useState('content');
  const [generating, setGenerating] = useState(false);
  const [flowStep, setFlowStep] = useState(0);
  const [flowGenerating, setFlowGenerating] = useState(false);
  const [flowProgress, setFlowProgress] = useState<Record<string, Record<string, 'pending' | 'generating' | 'done' | 'error'>>>({});
  const [previewPauta, setPreviewPauta] = useState<Pauta | null>(null);
  // Progress modal state
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [progressItems, setProgressItems] = useState<GenerationItem[]>([]);
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [progressTitle, setProgressTitle] = useState('Gerando conteúdo...');
  const [weekCarouselStart, setWeekCarouselStart] = useState(() => {
    const sorted = [...weeks].sort((a, b) => a.start_date.localeCompare(b.start_date));
    const todayStr = new Date().toISOString().slice(0, 10);
    const idx = sorted.findIndex(w => w.start_date >= todayStr);
    return Math.max(0, idx >= 0 ? idx : sorted.length - 1);
  });
  const selectedWeek = weeks.find(w => w.id === selectedWeekId) || weeks[0];
  const weekPautas = selectedWeek ? getPautasForWeek(selectedWeek.id) : [];

  const bannedTerms = settings.banned_terms_text ? settings.banned_terms_text.split('\n').filter(Boolean) : [];
  const tone = toneProfileForTemperature(settings.brand_tone_temperature);

  const promptCtx: PromptBuildContext = useMemo(() => ({
    settings,
    releases,
    bannedTerms,
  }), [settings, releases, bannedTerms]);

  // Auto-compute pauta status based on pauta + material state
  const weekMats = selectedWeek ? getMaterialsForWeek(selectedWeek.id) : [];
  useEffect(() => {
    if (!selectedWeek) return;
    for (const pauta of weekPautas) {
      const mat = weekMats.find(m => m.slot_key === getPautaSlot(pauta) || m.episode_date === pauta.publication_date);
      const computed = computePautaStatus(pauta, mat);
      if (pauta.status !== computed) {
        updatePauta(pauta.id, { 
          status: computed, 
          ...(computed === 'revisao' && !pauta.finalized_at ? { finalized_at: new Date().toISOString() } : {}),
          warnings_json: [],
        });
        recalcWeekStatus(selectedWeek.id);
      }
    }
  }, [weekPautas.map(p => JSON.stringify({ s: p.sections_json, i: p.raw_inputs_json, st: p.status })).join(','), weekMats.map(m => JSON.stringify({ t: m.selected_title_index, d: !!m.description_html, c: !!m.cover_url, sp: m.spotify_link })).join(',')]);

  const handleCreateWeek = () => {
    if (!newWeekDate) return;
    const d = new Date(newWeekDate);
    const dayOfWeek = d.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    d.setDate(d.getDate() + diff);
    const monday = d.toISOString().slice(0, 10);
    if (weeks.some(w => w.start_date === monday)) {
      toast.error('Semana já existe');
      return;
    }
    const week = addWeek(monday);
    setSelectedWeekId(week.id);
    setCreateDialogOpen(false);
    setNewWeekDate(undefined);
  };

  // Load templates for + Pauta dialog
  useEffect(() => {
    supabase.from('pauta_templates' as any).select('*').order('name').then(({ data }) => {
      if (data) setTemplates(data as any[]);
    });
  }, []);

  const handleAddPauta = () => {
    if (!newPautaDate) return;
    const dateStr = newPautaDate.toISOString().slice(0, 10);
    
    // Find or create the week for this date
    const d = new Date(newPautaDate);
    const dayOfWeek = d.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    const mondayStr = monday.toISOString().slice(0, 10);
    
    let week = weeks.find(w => w.start_date === mondayStr);
    if (!week) {
      week = addWeek(mondayStr);
    }
    
    const wd = newPautaDate.getDay();
    const pautaType = wd === 6 ? 'saturday' : wd === 0 ? 'sunday' : 'weekday';
    
    const newPauta: Pauta = {
      id: crypto.randomUUID(),
      week_id: week.id,
      publication_date: dateStr,
      pauta_type: pautaType as any,
      status: 'draft',
      raw_inputs_json: {},
      sections_json: { anniversary: '', review_rafa: '', news: '', review_kilton: '', next_week_releases: '' },
      rendered_markdown: null,
      rendered_text: null,
      warnings_json: [],
      discovered_links_json: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      finalized_at: null,
      template_id: newPautaTemplateId !== 'none' ? newPautaTemplateId : undefined,
    } as any;
    
    addPauta(newPauta);
    
    // Also create a material row for this pauta
    const mat: EpisodeMaterial = {
      id: crypto.randomUUID(),
      week_id: week.id,
      slot_key: (['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][wd] || 'monday') as any,
      episode_date: dateStr,
      source_pauta_id: newPauta.id,
      title_options_json: [],
      selected_title_index: null,
      description_html: null,
      cover_url: null,
      cover_source_url: null,
      spotify_link: null,
      repository_url: null,
      repository_file_id: null,
      repository_provider: null,
      repository_uploaded_at: null,
      mentioned_in_episode: null,
      cover_saved_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    supabase.from('episode_materials' as any).insert(mat as any).then();
    
    setSelectedWeekId(week.id);
    setAddPautaDialogOpen(false);
    setNewPautaDate(undefined);
    setNewPautaTemplateId('none');
    toast.success(`Pauta criada para ${format(newPautaDate, 'dd/MM/yyyy')}`);
  };

  const handleDeleteWeek = () => {
    if (!selectedWeek) return;
    deleteWeek(selectedWeek.id);
    setSelectedWeekId(null);
    setDeleteConfirmOpen(false);
    toast.success('Semana removida');
  };

  const [loadingAnniversaries, setLoadingAnniversaries] = useState(false);
  const [loadingNews, setLoadingNews] = useState(false);

  const getRawInputs = (pauta: Pauta) => (pauta.raw_inputs_json || {}) as Record<string, any>;

  /**
   * Build the {value, onChange} pair for a DirectionEditor bound to a section.
   * Reads/writes both `comment_<commentKey>` (direction) and
   * `mandatory_<mandatoryKey>` (mandatory info) on raw_inputs_json.
   */
  const directionBinding = (pauta: Pauta, commentKey: string, mandatoryKey: string) => {
    const inputs = getRawInputs(pauta);
    return {
      value: {
        direction: (inputs[commentKey] || '') as string,
        mandatory: (inputs[mandatoryKey] || '') as string,
      },
      onChange: (v: { direction: string; mandatory: string }) => {
        updateRawInput(pauta.id, commentKey, v.direction);
        updateRawInput(pauta.id, mandatoryKey, v.mandatory);
      },
    };
  };

  const updateRawInput = (pautaId: string, key: string, value: any) => {
    const pauta = pautas.find(p => p.id === pautaId);
    if (!pauta) return;
    const inputs = getRawInputs(pauta);
    updatePauta(pautaId, { raw_inputs_json: { ...inputs, [key]: value } });
  };

  const handleAutoFillAnniversaries = useCallback(async () => {
    if (!selectedWeek) return;
    setLoadingAnniversaries(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-anniversaries', {
        body: { week_start: selectedWeek.start_date, years_back: 40 },
      });
      if (error) throw new Error(error.message || 'Erro ao buscar aniversários');
      const annMap: Record<string, { artist: string; album: string; yearsAgo: number; year: number }[]> = data?.anniversaries || {};

      let filled = 0;
      for (const pauta of weekPautas) {
        const slot = getPautaSlot(pauta);
        if (slot === 'sunday') continue;
        const dateStr = pauta.publication_date;
        const anns = annMap[dateStr];
        if (!anns || anns.length === 0) continue;

        // Pick the most notable: prefer milestone years (multiples of 5/10), then oldest
        const milestones = anns.filter(a => a.yearsAgo % 10 === 0);
        const fives = anns.filter(a => a.yearsAgo % 5 === 0);
        const best = milestones[0] || fives[0] || anns[0];

        // Normalize: trim, clean extra spaces, capitalize properly for hyperlink parsing
        const artist = best.artist.trim().replace(/\s+/g, ' ');
        const album = best.album.trim().replace(/\s+/g, ' ');
        const text = `${artist} — ${album} (${best.year}, ${best.yearsAgo} anos)`;
        updateRawInput(pauta.id, 'anniversary', text);
        filled++;
      }

      if (filled > 0) {
        toast.success(`${filled} aniversários preenchidos automaticamente`);
      } else {
        toast.info('Nenhum aniversário encontrado para esta semana');
      }
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setLoadingAnniversaries(false);
    }
  }, [selectedWeek, weekPautas, updateRawInput]);

  const handleAutoFillNews = useCallback(async () => {
    if (!selectedWeek) return;
    setLoadingNews(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-metal-news', {
        body: { week_start: selectedWeek.start_date, max_per_day: 3 },
      });
      if (error) throw new Error(error.message || 'Erro ao buscar notícias');
      const newsMap: Record<string, { title: string; link: string; source: string; why: string }[]> = data?.news || {};

      let filled = 0;
      for (const pauta of weekPautas) {
        const slot = getPautaSlot(pauta);
        if (slot === 'saturday' || slot === 'sunday') continue;
        const dateStr = pauta.publication_date;
        const newsItems = newsMap[dateStr];
        if (!newsItems || newsItems.length === 0) continue;

        const best = newsItems[0];
        updateRawInput(pauta.id, 'news_link', best.link);
        updateRawInput(pauta.id, 'comment_news', `${best.title} (${best.source}) — ${best.why || ''}`);
        filled++;
      }

      const srcCount = data?.raw_count || 0;
      const sources = (data?.sources || []).join(', ');
      if (filled > 0) {
        toast.success(`${filled} notícias preenchidas (${srcCount} artigos de ${sources})`);
      } else {
        toast.info('Nenhuma notícia relevante encontrada para esta semana');
      }
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setLoadingNews(false);
    }
  }, [selectedWeek, weekPautas, updateRawInput]);

  const handleSectionChange = (pautaId: string, key: keyof PautaSections, value: string) => {
    const pauta = pautas.find(p => p.id === pautaId);
    if (!pauta) return;
    const currentSections = (pauta.sections_json || {}) as Partial<PautaSections>;
    updatePauta(pautaId, { sections_json: { ...currentSections, [key]: value } });
  };

  const generatePrompt = (pauta: Pauta, sectionKey?: string) => {
    if (sectionKey) return buildSectionPrompt(pauta, sectionKey, promptCtx);
    return buildDayPrompt(pauta, promptCtx);
  };

  const generateWeekPrompt = () => {
    if (!selectedWeek || weekPautas.length === 0) return '';
    return buildWeekPrompt(selectedWeek.start_date, weekPautas, promptCtx);
  };

  const handleCopyPrompt = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Prompt copiado');
  };

  const [promptScope, setPromptScope] = useState<'week' | 'day' | 'section'>('day');

  const openPromptDialog = (pauta: Pauta, sectionKey?: string) => {
    setActivePauta(pauta);
    setActiveSection(sectionKey || null);
    setPromptScope(sectionKey ? 'section' : 'day');
    setPromptResponse('');
    setPromptDialogOpen(true);
    const prompt = sectionKey ? buildSectionPrompt(pauta, sectionKey, promptCtx) : buildDayPrompt(pauta, promptCtx);
    savePromptSession({
      id: crypto.randomUUID(),
      scope: sectionKey ? 'section' : 'day',
      prompt_text: prompt,
      target_json: { pauta_id: pauta.id, publication_date: pauta.publication_date, section: sectionKey || null, week_id: pauta.week_id },
    });
  };

  const openWeekPromptDialog = () => {
    if (!selectedWeek || weekPautas.length === 0) return;
    setActivePauta(weekPautas[0]);
    setActiveSection(null);
    setPromptScope('week');
    setPromptResponse('');
    setPromptDialogOpen(true);
    const prompt = buildWeekPrompt(selectedWeek.start_date, weekPautas, promptCtx);
    savePromptSession({
      id: crypto.randomUUID(),
      scope: 'week',
      prompt_text: prompt,
      target_json: { week_id: selectedWeek.id, week_start: selectedWeek.start_date },
    });
  };

  const streamAI = useCallback(async (prompt: string, onChunk: (full: string) => void): Promise<string> => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pauta`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ prompt, bannedTerms: settings.banned_terms_text ? settings.banned_terms_text.split('\n').filter(Boolean) : [] }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(err.error || `Erro ${resp.status}`);
    }

    const reader = resp.body?.getReader();
    if (!reader) throw new Error('No reader');

    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nlIdx: number;
      while ((nlIdx = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, nlIdx);
        buffer = buffer.slice(nlIdx + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') break;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            full += content;
            onChunk(full);
          }
        } catch { /* partial json, skip */ }
      }
    }
    return full;
  }, []);

  const handleGenerateAI = useCallback(async () => {
    if (!activePauta) return;
    const prompt = promptScope === 'week'
      ? generateWeekPrompt()
      : generatePrompt(activePauta, activeSection || undefined);
    if (!prompt) return;

    setGenerating(true);
    setPromptResponse('');
    setParseError(null);

    // Open progress modal
    const label = promptScope === 'week' ? 'Semana completa' : `Pauta ${activePauta.publication_date}${activeSection ? ` — ${activeSection}` : ''}`;
    setProgressItems([{ id: 'gen', label, status: 'generating' }]);
    setProgressLogs([`Gerando: ${label}`]);
    setProgressTitle('Gerando com IA...');
    setProgressModalOpen(true);

    try {
      await streamAI(prompt, (full) => setPromptResponse(full));
      setProgressItems([{ id: 'gen', label, status: 'done' }]);
      setProgressLogs(prev => [...prev, '✓ Resposta gerada']);
      toast.success('Resposta gerada com IA');
      logActivity('IA gerou resposta', `scope: ${promptScope}, pauta: ${activePauta.publication_date}`);
    } catch (e: any) {
      console.error('AI generation error:', e);
      setProgressItems([{ id: 'gen', label, status: 'error', error: e.message }]);
      setProgressLogs(prev => [...prev, `✗ Erro: ${e.message}`]);
      toast.error(e.message || 'Erro ao gerar com IA');
    } finally {
      setGenerating(false);
    }
  }, [activePauta, activeSection, promptScope, streamAI]);

  const [parseError, setParseError] = useState<string | null>(null);

  const handleApplyResponse = () => {
    if (!activePauta || !promptResponse) return;
    setParseError(null);

    if (promptScope === 'week' && selectedWeek) {
      const requiredSections = weekPautas
        .filter(p => p.pauta_type !== 'sunday')
        .flatMap(p => getSectionsForDay(getPautaSlot(p)).map(s => s.key));

      const result = parsePautaResponse(promptResponse, 'week', { week_start: selectedWeek.start_date }, [...new Set(requiredSections)]);

      if (!result.success) {
        setParseError(result.error || 'Erro de parse desconhecido');
        toast.error(`Validação falhou: ${result.error}`);
        return;
      }

      if (result.days) {
        for (const [pubDate, sectionMap] of Object.entries(result.days)) {
          const pauta = weekPautas.find(p => p.publication_date === pubDate);
          if (!pauta) continue;
          const slot = getPautaSlot(pauta);
          const sections = getSectionsForDay(slot);
          const current = (pauta.sections_json || {}) as Record<string, string>;
          const updated = { ...current, ...sectionMap };
          const allContent = Object.values(updated).join('\n');
          const linkMatches = allContent.match(/https?:\/\/[^\s<>"]+/g) || [];
          updatePauta(pauta.id, {
            sections_json: updated,
            status: 'generated',
            discovered_links_json: linkMatches,
            rendered_markdown: sections.map(s => `## ${s.label}\n\n${updated[s.key] || 'N/A'}`).join('\n\n'),
            rendered_text: sections.map(s => `${s.label}:\n${updated[s.key] || 'N/A'}`).join('\n\n'),
          });
        }
      }
    } else if (promptScope === 'section' && activeSection) {
      const result = parsePautaResponse(promptResponse, 'section', {
        publication_date: activePauta.publication_date,
        section: activeSection,
      }, [activeSection]);

      if (!result.success) {
        setParseError(result.error || 'Erro de parse desconhecido');
        toast.error(`Validação falhou: ${result.error}`);
        return;
      }

      if (result.sections) {
        const slot = getPautaSlot(activePauta);
        const sections = getSectionsForDay(slot);
        const current = (activePauta.sections_json || {}) as Record<string, string>;
        const updated = { ...current, ...result.sections };
        updatePauta(activePauta.id, {
          sections_json: updated,
          status: 'generated',
          rendered_markdown: sections.map(s => `## ${s.label}\n\n${updated[s.key] || 'N/A'}`).join('\n\n'),
          rendered_text: sections.map(s => `${s.label}:\n${updated[s.key] || 'N/A'}`).join('\n\n'),
        });
      }
    } else {
      const result = parsePautaResponse(promptResponse, 'day', {
        publication_date: activePauta.publication_date,
      });

      if (!result.success) {
        setParseError(result.error || 'Erro de parse desconhecido');
        toast.error(`Validação falhou: ${result.error}`);
        return;
      }

      if (result.sections) {
        const slot = getPautaSlot(activePauta);
        const sections = getSectionsForDay(slot);
        const current = (activePauta.sections_json || {}) as Record<string, string>;
        const updated = { ...current, ...result.sections };
        const allContent = Object.values(updated).join('\n');
        const linkMatches = allContent.match(/https?:\/\/[^\s<>"]+/g) || [];
        updatePauta(activePauta.id, {
          sections_json: updated,
          status: 'generated',
          discovered_links_json: linkMatches,
          rendered_markdown: sections.map(s => `## ${s.label}\n\n${updated[s.key] || 'N/A'}`).join('\n\n'),
          rendered_text: sections.map(s => `${s.label}:\n${updated[s.key] || 'N/A'}`).join('\n\n'),
        });
      }
    }

    if (selectedWeek) recalcWeekStatus(selectedWeek.id);
    setPromptDialogOpen(false);
    setPromptResponse('');
    toast.success('Resposta validada e aplicada');
    logActivity('Resposta aplicada', `Pauta: ${activePauta.publication_date}, scope: ${promptScope}`);
  };

  const finalizePauta = (id: string) => {
    const pauta = pautas.find(p => p.id === id);
    if (!pauta) return;
    const mat = weekMats.find(m => m.slot_key === getPautaSlot(pauta) || m.episode_date === pauta.publication_date);
    const computed = computePautaStatus(pauta, mat);
    
    // Dynamic warnings
    const slot = getPautaSlot(pauta);
    const sections = getSectionsForDay(slot);
    const data = (pauta.sections_json || {}) as Record<string, string>;
    const warnings: string[] = [];
    const inputs = getRawInputs(pauta);

    if (slot !== 'saturday' && slot !== 'sunday') {
      if (!inputs.review_rafa_id && !inputs.review_kilton_id && !data.review_rafa?.trim() && !data.review_kilton?.trim()) {
        warnings.push('Nenhuma resenha definida para este dia útil');
      }
    }
    const empty = sections.filter(s => !data[s.key]?.trim());
    if (empty.length > 0) {
      warnings.push(`Seções vazias: ${empty.map(s => s.label).join(', ')}`);
    }

    updatePauta(id, { status: computed, warnings_json: warnings, ...(computed !== 'pesquisa' ? { finalized_at: new Date().toISOString() } : {}) });
    if (warnings.length > 0) {
      toast.warning(`Avisos: ${warnings.join('; ')}`);
    } else {
      toast.success(`Status atualizado: ${computed}`);
    }
    if (selectedWeek) recalcWeekStatus(selectedWeek.id);
  };

  const forceFinalize = (id: string) => {
    updatePauta(id, { status: 'finalized', finalized_at: new Date().toISOString() });
    if (selectedWeek) recalcWeekStatus(selectedWeek.id);
    toast.success('Pauta finalizada (forçado)');
  };

  const trafficLight = (pauta: Pauta) => {
    const sections = getSectionsForDay(getPautaSlot(pauta));
    const data = (pauta.sections_json || {}) as Record<string, string>;
    const filled = sections.filter(s => data[s.key]?.trim()).length;
    const ratio = filled / sections.length;
    if (pauta.status === 'finalized') return 'bg-emerald-500';
    if (pauta.status === 'needs_review') return 'bg-orange-500';
    if (ratio >= 0.5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const handleExport = () => {
    const notFinalized = weekPautas.filter(p => p.status !== 'finalized');
    if (notFinalized.length > 0 && exportFormat !== 'clipboard') {
      toast.warning(`${notFinalized.length} pauta(s) não finalizada(s). Finalize antes de exportar.`);
      return;
    }
    const content = weekPautas.map(p => {
      const slot = getPautaSlot(p);
      const sections = getSectionsForDay(slot);
      const data = (p.sections_json || {}) as Record<string, string>;
      const lines = [`# ${slot.toUpperCase()} — ${p.publication_date}`, `Status: ${p.status}`, ''];
      sections.forEach(s => {
        lines.push(`## ${s.label}`);
        lines.push(data[s.key]?.trim() || 'Não Aplicável');
        lines.push('');
      });
      return lines.join('\n');
    }).join('\n---\n\n');

    if (exportFormat === 'clipboard') {
      navigator.clipboard.writeText(content);
      toast.success('Copiado para clipboard');
      setExportDialogOpen(false);
      return;
    }
    const mimeMap = { txt: 'text/plain', md: 'text/markdown', json: 'application/json' };
    const output = exportFormat === 'json' ? JSON.stringify(weekPautas, null, 2) : content;
    const blob = new Blob([output], { type: mimeMap[exportFormat] });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `pautas_${selectedWeek?.start_date}.${exportFormat}`; a.click();
    URL.revokeObjectURL(url);
    setExportDialogOpen(false);
    logActivity('Exportação de pautas', `Formato: ${exportFormat}`);
  };

  const handleImportPauta = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,.md,.txt';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        try {
          if (file.name.endsWith('.json')) {
            const data = JSON.parse(text);
            if (Array.isArray(data)) {
              data.forEach((p: any) => {
                const existing = pautas.find(x => x.publication_date === p.publication_date && x.week_id === selectedWeek?.id);
                if (existing) {
                  updatePauta(existing.id, { sections_json: p.sections_json || p.sections, status: 'generated' });
                }
              });
            } else if (data.sections_json) {
              if (activePauta) updatePauta(activePauta.id, { sections_json: data.sections_json, status: 'generated' });
            }
          } else {
            if (activePauta) {
              updatePauta(activePauta.id, { rendered_markdown: text, status: 'generated' });
            }
          }
          toast.success('Pauta importada');
        } catch {
          toast.error('Erro ao importar arquivo');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleSaveAll = () => {
    toast.success('Todos os inputs foram salvos');
    logActivity('Salvar todos inputs', `Semana: ${selectedWeek?.start_date}`);
  };

  const handleFlowAutoGenerateInner = useCallback(async (regenerateAll: boolean) => {
    if (!selectedWeek || weekPautas.length === 0) return;
    setFlowGenerating(true);

    const weekdayPautas = weekPautas.filter(p => {
      const slot = getPautaSlot(p);
      return slot !== 'sunday';
    });

    const initialProgress: Record<string, Record<string, 'pending' | 'generating' | 'done' | 'error'>> = {};
    const flowItems: GenerationItem[] = [];
    for (const pauta of weekdayPautas) {
      const slot = getPautaSlot(pauta);
      const sections = getSectionsForDay(slot);
      initialProgress[slot] = {};
      for (const sec of sections) {
        initialProgress[slot][sec.key] = 'pending';
      }
      flowItems.push({ id: slot, label: `${DAY_SLOTS.find(d => d.key === slot)?.label || slot}`, status: 'pending' });
    }
    setFlowProgress(initialProgress);
    setProgressItems(flowItems);
    setProgressLogs(['Iniciando flow automático...']);
    setProgressTitle('Flow automático de pautas...');
    setProgressModalOpen(true);

    for (const pauta of weekdayPautas) {
      const slot = getPautaSlot(pauta);
      const sections = getSectionsForDay(slot);
      const existingSections = (pauta.sections_json || {}) as Record<string, string>;

      // BYPASS: only generate sections whose raw input is filled.
      // Sections without any insumo are skipped entirely (never sent to the AI).
      const filledSectionKeys = sections
        .filter(s => sectionHasInput(pauta, s.key))
        .map(s => s.key);
      const skippedSectionKeys = sections
        .filter(s => !sectionHasInput(pauta, s.key))
        .map(s => s.key);

      // Mark skipped sections as "done" in the progress UI so the user sees
      // they were intentionally bypassed (not pending).
      if (skippedSectionKeys.length > 0) {
        setFlowProgress(prev => {
          const next = { ...prev };
          next[slot] = { ...next[slot] };
          for (const k of skippedSectionKeys) next[slot][k] = 'done';
          return next;
        });
        setProgressLogs(prev => [
          ...prev,
          `⊘ ${DAY_SLOTS.find(d => d.key === slot)?.label}: pulando seções sem insumo (${skippedSectionKeys.join(', ')})`,
        ]);
      }

      // Nothing to generate for this day
      if (filledSectionKeys.length === 0) {
        setProgressItems(prev => prev.map(i => i.id === slot ? { ...i, status: 'done' } : i));
        setProgressLogs(prev => [...prev, `⊘ ${DAY_SLOTS.find(d => d.key === slot)?.label}: sem insumos preenchidos`]);
        continue;
      }

      const allFilledTargets = filledSectionKeys.every(k => existingSections[k]?.trim());
      if (!regenerateAll && allFilledTargets) {
        setFlowProgress(prev => {
          const next = { ...prev };
          next[slot] = { ...next[slot] };
          for (const k of filledSectionKeys) next[slot][k] = 'done';
          return next;
        });
        setProgressItems(prev => prev.map(i => i.id === slot ? { ...i, status: 'done' } : i));
        setProgressLogs(prev => [...prev, `✓ ${DAY_SLOTS.find(d => d.key === slot)?.label}: já preenchido`]);
        continue;
      }

      // Mark day as generating in progress modal
      setProgressItems(prev => prev.map(i => i.id === slot ? { ...i, status: 'generating' } : i));
      setProgressLogs(prev => [...prev, `🔄 Gerando: ${DAY_SLOTS.find(d => d.key === slot)?.label || slot}...`]);

      setFlowProgress(prev => {
        const next = { ...prev };
        next[slot] = { ...next[slot] };
        for (const k of filledSectionKeys) next[slot][k] = 'generating';
        return next;
      });

      // Build prompt restricted to filled sections only
      const prompt = buildDayPrompt(pauta, promptCtx, { sectionKeys: filledSectionKeys });
      if (!prompt) continue;

      try {
        const responseText = await streamAI(prompt, () => {});
        const result = parsePautaResponse(responseText, 'day', { publication_date: pauta.publication_date });

        if (result.success && result.sections) {
          const current = (pauta.sections_json || {}) as Record<string, string>;
          // Only persist sections we asked for — defensively drop anything else
          const onlyRequested: Record<string, string> = {};
          for (const k of filledSectionKeys) {
            if (result.sections[k]) onlyRequested[k] = result.sections[k];
          }
          const updated = { ...current, ...onlyRequested };
          const allContent = Object.values(updated).join('\n');
          const linkMatches = allContent.match(/https?:\/\/[^\s<>"]+/g) || [];
          updatePauta(pauta.id, {
            sections_json: updated,
            status: 'generated',
            discovered_links_json: linkMatches,
            rendered_markdown: sections.map(s => `## ${s.label}\n\n${updated[s.key] || 'N/A'}`).join('\n\n'),
            rendered_text: sections.map(s => `${s.label}:\n${updated[s.key] || 'N/A'}`).join('\n\n'),
          });
          setFlowProgress(prev => {
            const next = { ...prev };
            next[slot] = { ...next[slot] };
            for (const k of filledSectionKeys) next[slot][k] = 'done';
            return next;
          });
          setProgressItems(prev => prev.map(i => i.id === slot ? { ...i, status: 'done' } : i));
          setProgressLogs(prev => [...prev, `✓ ${DAY_SLOTS.find(d => d.key === slot)?.label || slot} concluído`]);
        } else {
          setFlowProgress(prev => {
            const next = { ...prev };
            next[slot] = { ...next[slot] };
            for (const k of filledSectionKeys) next[slot][k] = 'error';
            return next;
          });
          setProgressItems(prev => prev.map(i => i.id === slot ? { ...i, status: 'error', error: result.error } : i));
          setProgressLogs(prev => [...prev, `✗ ${DAY_SLOTS.find(d => d.key === slot)?.label}: ${result.error}`]);
          toast.error(`Falha: ${slot} — ${result.error}`);
        }
      } catch (e: any) {
        setFlowProgress(prev => {
          const next = { ...prev };
          next[slot] = { ...next[slot] };
          for (const k of filledSectionKeys) next[slot][k] = 'error';
          return next;
        });
        setProgressItems(prev => prev.map(i => i.id === slot ? { ...i, status: 'error', error: e.message } : i));
        setProgressLogs(prev => [...prev, `✗ Erro: ${e.message}`]);
        toast.error(`Erro: ${e.message}`);
      }
    }

    if (selectedWeek) recalcWeekStatus(selectedWeek.id);
    setFlowGenerating(false);
    toast.success('Flow automático concluído');
    logActivity('Flow automático', `Semana: ${selectedWeek.start_date}`);
  }, [selectedWeek, weekPautas, promptCtx, streamAI]);

  const handleFlowAutoGenerate = useCallback(() => handleFlowAutoGenerateInner(false), [handleFlowAutoGenerateInner]);
  const handleFlowRegenerate = useCallback(() => handleFlowAutoGenerateInner(true), [handleFlowAutoGenerateInner]);

  const handleFlowManual = () => {
    setActiveTab('inputs');
    setFlowStep(0);
  };

  const flowWeekdayPautas = weekPautas.filter(p => {
    const slot = getPautaSlot(p);
    return slot !== 'sunday' && slot !== 'saturday';
  }).sort((a, b) => a.publication_date.localeCompare(b.publication_date));

  // Saturday pauta for the flow saturday_releases step
  const flowSaturdayPauta = weekPautas.find(p => getPautaSlot(p) === 'saturday');

  const flowTotalSteps = FLOW_STEPS.length + 1;

  // Collect all release IDs already used in reviews across ALL pautas (not just this week)
  const usedReviewIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of pautas) {
      const inputs = (p.raw_inputs_json || {}) as Record<string, any>;
      if (inputs.review_rafa_id) ids.add(inputs.review_rafa_id);
      if (inputs.review_kilton_id) ids.add(inputs.review_kilton_id);
    }
    return ids;
  }, [pautas]);

  const ReleasePicker = ({ pauta, inputKey, label }: { pauta: Pauta; inputKey: string; label: string }) => {
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    const inputs = getRawInputs(pauta);
    const eligible = getEligibleReviews(releases, pauta.publication_date);
    const selectedId = inputs[inputKey];
    const selected = releases.find(r => r.id === selectedId);

    // Exclude releases already used in any review (except the current selection)
    const available = eligible.filter(r => r.id === selectedId || !usedReviewIds.has(r.id));

    const filtered = search.trim()
      ? available.filter(r => `${r.artist} ${r.album}`.toLowerCase().includes(search.toLowerCase()))
      : available;

    const grouped = groupReleasesByWeekAndGenre(filtered);

    return (
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-start text-xs h-8 font-normal">
              {selected ? `${selected.artist} – ${selected.album}` : 'Selecionar release...'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="p-2 border-b border-border">
              <Input
                placeholder="Buscar artista ou álbum..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
            <ScrollArea className="h-[min(60vh,500px)]">
              {grouped.length > 0 ? (
                <div className="p-1">
                  {grouped.map(week => (
                    <div key={week.weekLabel} className="mb-2">
                      <p className="text-[10px] font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wider">
                        Semana {week.weekLabel}
                      </p>
                      {week.genres.map(g => (
                        <div key={g.genre}>
                          <p className="text-[10px] text-primary/70 px-3 py-0.5 font-medium">{g.genre}</p>
                          {g.releases.map(r => (
                            <button
                              key={r.id}
                              className={cn(
                                'w-full text-left px-3 py-1.5 text-xs rounded hover:bg-accent transition-colors',
                                r.id === selectedId && 'bg-accent font-medium'
                              )}
                              onClick={() => {
                                updateRawInput(pauta.id, inputKey, r.id);
                                setOpen(false);
                                setSearch('');
                              }}
                            >
                              {r.artist} – {r.album}
                              <span className="text-muted-foreground ml-1">({r.release_date})</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground p-3 text-center italic">
                  {eligible.length === 0 ? 'Nenhum release na janela D-90 a D-1' : available.length === 0 ? 'Todos os releases já foram usados em reviews' : 'Nenhum resultado'}
                </p>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>
        {selected && (
          <p className="text-[10px] text-muted-foreground">{selected.artist} – {selected.album} ({selected.release_date})</p>
        )}
      </div>
    );
  };

  const SaturdayReleasePicker = ({ pauta }: { pauta: Pauta }) => {
    const [search, setSearch] = useState('');
    const inputs = getRawInputs(pauta);
    const eligible = getEligibleSaturdayReleases(releases, pauta.publication_date);
    const selectedIds: string[] = inputs.selected_release_ids || [];

    const filtered = search.trim()
      ? eligible.filter(r => `${r.artist} ${r.album}`.toLowerCase().includes(search.toLowerCase()))
      : eligible;

    const grouped = groupReleasesByWeekAndGenre(filtered);

    const toggle = (id: string) => {
      const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id];
      updateRawInput(pauta.id, 'selected_release_ids', next);
    };

    return (
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Destaques da Semana (D+2 a D+10)</Label>
        <Input
          placeholder="Buscar artista ou álbum..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-7 text-xs mb-1"
        />
        <ScrollArea className="h-[min(55vh,420px)]">
          {grouped.length > 0 ? (
            <div className="space-y-1">
              {grouped.map(week => (
                <div key={week.weekLabel} className="mb-2">
                  <p className="text-[10px] font-semibold text-muted-foreground px-1 py-0.5 uppercase tracking-wider">
                    Semana {week.weekLabel}
                  </p>
                  {week.genres.map(g => (
                    <div key={g.genre}>
                      <p className="text-[10px] text-primary/70 px-2 py-0.5 font-medium">{g.genre}</p>
                      {g.releases.map(r => (
                        <button
                          key={r.id}
                          className={`w-full text-left p-1.5 rounded text-xs border transition-colors ${selectedIds.includes(r.id) ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/30'}`}
                          onClick={() => toggle(r.id)}
                        >
                          {r.artist} – {r.album}
                          <span className="text-muted-foreground ml-1">({r.release_date})</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground italic p-2">
              {eligible.length === 0 ? 'Nenhum release na janela D+2/D+10' : 'Nenhum resultado'}
            </p>
          )}
        </ScrollArea>
      </div>
    );
  };

  const currentPromptText = activePauta
    ? (activeSection ? generatePrompt(activePauta, activeSection) : (activeSection === null && !activePauta ? generateWeekPrompt() : generatePrompt(activePauta)))
    : '';

  const renderFlowStep = () => {
    if (flowStep >= FLOW_STEPS.length) {
      const hasProgress = Object.keys(flowProgress).length > 0;
      const totalSections = Object.values(flowProgress).reduce((acc, day) => acc + Object.keys(day).length, 0);
      const doneSections = Object.values(flowProgress).reduce((acc, day) => acc + Object.values(day).filter(s => s === 'done').length, 0);
      const progressPct = totalSections > 0 ? Math.round((doneSections / totalSections) * 100) : 0;

      return (
        <div className="flex flex-col items-center justify-center py-8 space-y-6">
          <div className="text-center space-y-2">
            <h3 className="text-xl font-bold">{flowGenerating ? 'Gerando Pautas...' : hasProgress && progressPct === 100 ? '✅ Geração Concluída' : 'Insumos Completos'}</h3>
            <p className="text-muted-foreground">
              {flowGenerating ? `${doneSections}/${totalSections} seções processadas (${progressPct}%)` : 'Todos os campos de insumo da semana foram preenchidos. Como deseja prosseguir?'}
            </p>
          </div>

          {hasProgress && (
            <div className="w-full max-w-2xl space-y-3">
              <Progress value={progressPct} className="h-2.5" />
              <div className="grid gap-2">
                {DAY_SLOTS.filter(d => d.key !== 'sunday' && flowProgress[d.key]).map(day => {
                  const sections = flowProgress[day.key];
                  if (!sections) return null;
                  const dayDone = Object.values(sections).filter(s => s === 'done').length;
                  const dayTotal = Object.keys(sections).length;
                  const dayPct = dayTotal > 0 ? Math.round((dayDone / dayTotal) * 100) : 0;

                  return (
                    <div key={day.key} className="flex items-center gap-3 p-2 rounded-md border border-border/50 bg-card/50">
                      <span className="text-xs font-medium w-16">{day.short}</span>
                      <div className="flex gap-1.5 flex-1">
                        {Object.entries(sections).map(([secKey, status]) => {
                          const secLabel = getSectionsForDay(day.key as DaySlot).find(s => s.key === secKey);
                          return (
                            <div key={secKey} className="flex items-center gap-1" title={secLabel?.label || secKey}>
                              {status === 'done' && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                              {status === 'generating' && <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />}
                              {status === 'error' && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                              {status === 'pending' && <Circle className="h-3.5 w-3.5 text-muted-foreground/30" />}
                              <span className="text-[10px] text-muted-foreground">{secLabel?.label || secKey}</span>
                            </div>
                          );
                        })}
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">{dayPct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!flowGenerating && (
            <div className="flex gap-4">
              <Button size="lg" className="gap-2" onClick={handleFlowAutoGenerate}>
                <Zap className="h-4 w-4" /> Gerar Todos
              </Button>
              <Button size="lg" variant="secondary" className="gap-2" onClick={handleFlowRegenerate}>
                <Sparkles className="h-4 w-4" /> Regenerar Todos
              </Button>
              <Button size="lg" variant="outline" className="gap-2" onClick={handleFlowManual}>
                <FileText className="h-4 w-4" /> Gerar Manualmente
              </Button>
            </div>
          )}
        </div>
      );
    }

    const step = FLOW_STEPS[flowStep];

    // Saturday releases step - show SaturdayReleasePicker for the saturday pauta
    if (step.key === 'saturday_releases') {
      if (!flowSaturdayPauta) {
        return (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Nenhuma pauta de sábado encontrada nesta semana.</p>
          </div>
        );
      }
      return (
        <div className="space-y-6">
          <div className="text-center space-y-1">
            <h3 className="text-lg font-bold">{step.label}</h3>
            <p className="text-sm text-muted-foreground">Selecione os lançamentos que serão destaque no episódio de sábado</p>
          </div>
          <div className="max-w-2xl mx-auto">
            <Card className="border-border/50">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">Sáb</Badge>
                  <span className="font-medium text-sm">Sábado</span>
                  <span className="text-xs text-muted-foreground">{flowSaturdayPauta.publication_date}</span>
                </div>
                <SaturdayReleasePicker pauta={flowSaturdayPauta} />
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="text-center space-y-1">
          <h3 className="text-lg font-bold">{step.label}</h3>
          <p className="text-sm text-muted-foreground">Preencha os dados de {step.label.toLowerCase()} para todos os dias da semana</p>
          {step.key === 'anniversary' && (
            <Button size="sm" variant="outline" className="gap-2 mt-2" onClick={handleAutoFillAnniversaries} disabled={loadingAnniversaries}>
              {loadingAnniversaries ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando na Wikipedia...</> : <><Wand2 className="h-3.5 w-3.5" /> Preencher Automaticamente</>}
            </Button>
          )}
          {step.key === 'news' && (
            <Button size="sm" variant="outline" className="gap-2 mt-2" onClick={handleAutoFillNews} disabled={loadingNews}>
              {loadingNews ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando notícias...</> : <><Newspaper className="h-3.5 w-3.5" /> Preencher Automaticamente</>}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {flowWeekdayPautas.map(pauta => {
            const slot = getPautaSlot(pauta);
            const dayInfo = DAY_SLOTS.find(d => d.key === slot);
            const inputs = getRawInputs(pauta);

            return (
              <Card key={pauta.id} className="border-border/50">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{dayInfo?.short}</Badge>
                    <span className="font-medium text-sm">{dayInfo?.label}</span>
                    <span className="text-xs text-muted-foreground">{pauta.publication_date}</span>
                  </div>

                  {step.key === 'anniversary' && (
                    <>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Aniversário do Dia</Label>
                          <Button variant="ghost" size="icon" className="h-4 w-4" title="Buscar aniversários"
                            onClick={() => window.open('https://en.wikipedia.org/wiki/2026_in_heavy_metal_music', '_blank')}>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                        <Input
                          className="h-8 text-xs"
                          placeholder="Ex: Aniversário de 40 anos do Powerslave"
                          value={inputs.anniversary || ''}
                          onChange={e => updateRawInput(pauta.id, 'anniversary', e.target.value)}
                        />
                      </div>
                      <DirectionEditor
                        sectionLabel="Aniversário"
                        {...directionBinding(pauta, 'comment_anniversary', 'mandatory_anniversary')}
                        searchQuery={buildSectionSearchQuery('anniversary', { anniversary: inputs.anniversary })}
                      />
                    </>
                  )}

                  {step.key === 'review_rafa' && (
                    <>
                      <ReleasePicker pauta={pauta} inputKey="review_rafa_id" label="Review Rafa" />
                      <DirectionEditor
                        sectionLabel="Review Rafa"
                        {...directionBinding(pauta, 'comment_review_rafa', 'mandatory_review_rafa')}
                        searchQuery={(() => {
                          const r = releases.find(x => x.id === inputs.review_rafa_id);
                          return buildSectionSearchQuery('review_rafa', { releaseArtist: r?.artist, releaseAlbum: r?.album });
                        })()}
                      />
                    </>
                  )}

                  {step.key === 'news' && (
                    <>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Link Notícia</Label>
                          <Button variant="ghost" size="icon" className="h-4 w-4" title="Blabbermouth"
                            onClick={() => window.open('https://www.blabbermouth.net/', '_blank')}>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-4 w-4" title="Whiplash"
                            onClick={() => window.open('https://whiplash.net/', '_blank')}>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                        <Input
                          className="h-8 text-xs"
                          placeholder="https://..."
                          value={inputs.news_link || ''}
                          onChange={e => updateRawInput(pauta.id, 'news_link', e.target.value)}
                        />
                      </div>
                      <DirectionEditor
                        sectionLabel="Notícias"
                        {...directionBinding(pauta, 'comment_news', 'mandatory_news')}
                        searchQuery={buildSectionSearchQuery('news', { newsLink: inputs.news_link })}
                      />
                    </>
                  )}

                  {step.key === 'review_kilton' && (
                    <>
                      <ReleasePicker pauta={pauta} inputKey="review_kilton_id" label="Review Kilton" />
                      <DirectionEditor
                        sectionLabel="Review Kilton"
                        {...directionBinding(pauta, 'comment_review_kilton', 'mandatory_review_kilton')}
                        searchQuery={(() => {
                          const r = releases.find(x => x.id === inputs.review_kilton_id);
                          return buildSectionSearchQuery('review_kilton', { releaseArtist: r?.artist, releaseAlbum: r?.album });
                        })()}
                      />
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Pautas
          </h1>
          <p className="text-muted-foreground mt-1">Workspace semanal de pautas editoriais</p>
        </div>
        <div className="flex gap-2">
          {selectedWeek && weekPautas.length > 0 && (
            <>
              <Button size="sm" variant="outline" className="gap-1" onClick={handleImportPauta}>
                <Upload className="h-3.5 w-3.5" /> Importar
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => setExportDialogOpen(true)}>
                <Download className="h-3.5 w-3.5" /> Exportar
              </Button>
            </>
          )}
          {selectedWeek && (
            <Button size="sm" variant="destructive" className="gap-1" onClick={() => setDeleteConfirmOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="sm" variant="secondary" className="gap-2" onClick={() => setAddPautaDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Pauta
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Nova Semana
          </Button>
        </div>
      </div>

      {weeks.length > 0 && (() => {
        const sortedWeeks = [...weeks].sort((a, b) => a.start_date.localeCompare(b.start_date));
        const visible = 4;
        const visibleWeeks = sortedWeeks.slice(weekCarouselStart, weekCarouselStart + visible);
        const canPrev = weekCarouselStart > 0;
        const canNext = weekCarouselStart + visible < sortedWeeks.length;

        return (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={!canPrev} onClick={() => setWeekCarouselStart(s => Math.max(0, s - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex gap-2 overflow-hidden">
              {visibleWeeks.map(w => (
                <Button key={w.id} variant={selectedWeek?.id === w.id ? 'default' : 'outline'} size="sm" onClick={() => setSelectedWeekId(w.id)}>
                  {(() => {
                    const mon = new Date(w.start_date + 'T12:00:00');
                    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
                    return `Semana ${format(mon, 'dd.MM')} a ${format(sun, 'dd.MM')}`;
                  })()}
                  <StatusBadge status={w.status} className="ml-2 text-[10px]" />
                </Button>
              ))}
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={!canNext} onClick={() => setWeekCarouselStart(s => Math.min(sortedWeeks.length - visible, s + 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        );
      })()}

      {selectedWeek ? (
        <>
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === 'flow') setFlowStep(0); }}>
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="content">Conteúdo</TabsTrigger>
                <TabsTrigger value="inputs">Insumos</TabsTrigger>
                <TabsTrigger value="flow">Flow</TabsTrigger>
                <TabsTrigger value="management">Management</TabsTrigger>
              </TabsList>
              {activeTab === 'inputs' && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-2" onClick={handleAutoFillAnniversaries} disabled={loadingAnniversaries}>
                    {loadingAnniversaries ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando...</> : <><Wand2 className="h-3.5 w-3.5" /> Auto Aniversários</>}
                  </Button>
                  <Button size="sm" variant="outline" className="gap-2" onClick={handleAutoFillNews} disabled={loadingNews}>
                    {loadingNews ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando...</> : <><Newspaper className="h-3.5 w-3.5" /> Auto Notícias</>}
                  </Button>
                  <Button size="sm" className="gap-2" onClick={handleSaveAll}>
                    <Save className="h-3.5 w-3.5" /> Salvar Todos
                  </Button>
                </div>
              )}
            </div>

            <TabsContent value="inputs">
              <WorkspaceShell
                excludeDays={['sunday']}
                weekLabel={`Insumos – Semana de ${new Date(selectedWeek.start_date + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                renderDay={(day) => {
                  const pauta = weekPautas.find(p => getPautaSlot(p) === day.key);
                  if (!pauta) return <p className="text-xs text-muted-foreground italic">Sem pauta</p>;
                  const inputs = getRawInputs(pauta);
                  const slot = getPautaSlot(pauta);
                  const sections = getSectionsForDay(slot);

                  const body = (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${trafficLight(pauta)}`} />
                        <StatusBadge status={pauta.status} />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Aniversário do Dia</Label>
                          <Button variant="ghost" size="icon" className="h-4 w-4" title="Buscar aniversários"
                            onClick={() => window.open('https://en.wikipedia.org/wiki/2026_in_heavy_metal_music', '_blank')}>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                        <Input
                          className="h-8 text-xs"
                          placeholder="Ex: Aniversário de 40 anos do Powerslave"
                          value={inputs.anniversary || ''}
                          onChange={e => updateRawInput(pauta.id, 'anniversary', e.target.value)}
                        />
                      </div>
                      <DirectionEditor
                        sectionLabel="Aniversário"
                        {...directionBinding(pauta, 'comment_anniversary', 'mandatory_anniversary')}
                        searchQuery={buildSectionSearchQuery('anniversary', { anniversary: inputs.anniversary })}
                      />

                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Mencionado no Episódio
                          </Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 text-[10px] text-destructive hover:text-destructive"
                            onClick={() => updateRawInput(pauta.id, 'mentioned_in_episode', '')}
                            disabled={!inputs.mentioned_in_episode}
                          >
                            Limpar
                          </Button>
                        </div>
                        <Textarea
                          className="min-h-[60px] text-xs"
                          placeholder="Cole links ou assuntos que você mencionou no episódio (um por linha)..."
                          value={inputs.mentioned_in_episode || ''}
                          onChange={e => updateRawInput(pauta.id, 'mentioned_in_episode', e.target.value)}
                        />
                      </div>

                      {slot !== 'saturday' && slot !== 'sunday' && (
                        <>
                          <ReleasePicker pauta={pauta} inputKey="review_rafa_id" label="Review Rafa" />
                          <DirectionEditor
                            sectionLabel="Review Rafa"
                            {...directionBinding(pauta, 'comment_review_rafa', 'mandatory_review_rafa')}
                            searchQuery={(() => {
                              const r = releases.find(x => x.id === inputs.review_rafa_id);
                              return buildSectionSearchQuery('review_rafa', { releaseArtist: r?.artist, releaseAlbum: r?.album });
                            })()}
                          />

                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Link Notícia</Label>
                              <Button variant="ghost" size="icon" className="h-4 w-4" title="Blabbermouth"
                                onClick={() => window.open('https://www.blabbermouth.net/', '_blank')}>
                                <ExternalLink className="h-2.5 w-2.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-4 w-4" title="Whiplash"
                                onClick={() => window.open('https://whiplash.net/', '_blank')}>
                                <ExternalLink className="h-2.5 w-2.5" />
                              </Button>
                            </div>
                            <Input
                              className="h-8 text-xs"
                              placeholder="https://..."
                              value={inputs.news_link || ''}
                              onChange={e => updateRawInput(pauta.id, 'news_link', e.target.value)}
                            />
                          </div>
                          <DirectionEditor
                            sectionLabel="Notícias"
                            {...directionBinding(pauta, 'comment_news', 'mandatory_news')}
                            searchQuery={buildSectionSearchQuery('news', { newsLink: inputs.news_link })}
                          />

                          <ReleasePicker pauta={pauta} inputKey="review_kilton_id" label="Review Kilton" />
                          <DirectionEditor
                            sectionLabel="Review Kilton"
                            {...directionBinding(pauta, 'comment_review_kilton', 'mandatory_review_kilton')}
                            searchQuery={(() => {
                              const r = releases.find(x => x.id === inputs.review_kilton_id);
                              return buildSectionSearchQuery('review_kilton', { releaseArtist: r?.artist, releaseAlbum: r?.album });
                            })()}
                          />
                        </>
                      )}

                      {slot === 'saturday' && (
                        <>
                          <SaturdayReleasePicker pauta={pauta} />
                          <DirectionEditor
                            sectionLabel="Lançamentos da Semana"
                            {...directionBinding(pauta, 'comment_next_week_releases', 'mandatory_next_week_releases')}
                            searchQuery={buildSectionSearchQuery('next_week_releases', { publicationDate: pauta.publication_date })}
                          />
                        </>
                      )}

                      {slot === 'sunday' && (
                        <div className="p-2 rounded bg-muted/30 text-xs text-muted-foreground">
                          <p className="font-medium mb-1">Compilação Semanal</p>
                          <p>Este episódio agrega os conteúdos da semana automaticamente.</p>
                          {weekPautas.filter(p => getPautaSlot(p) !== 'sunday' && p.status === 'finalized').length > 0 ? (
                            <p className="text-emerald-400 mt-1">
                              {weekPautas.filter(p => getPautaSlot(p) !== 'sunday' && p.status === 'finalized').length} episódios prontos
                            </p>
                          ) : (
                            <p className="text-yellow-400 mt-1">Finalize as pautas da semana primeiro</p>
                          )}
                        </div>
                      )}

                      <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => toast.success('Inputs salvos')}>
                        Salvar Inputs
                      </Button>
                    </div>
                  );

                  return (
                    <>
                      <ExpandDayDialog
                        dayLabel={day.label}
                        weekLabel={`Insumos – Semana de ${new Date(selectedWeek.start_date + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                      >
                        {body}
                      </ExpandDayDialog>
                      {body}
                    </>
                  );
                }}
              />
            </TabsContent>

            <TabsContent value="content">
              <WorkspaceShell
                excludeDays={['sunday']}
                weekLabel={`Conteúdo – Semana de ${new Date(selectedWeek.start_date + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                actions={
                  <div className="flex gap-2">
                    <Button size="sm" variant="default" className="gap-1.5" onClick={handleFlowAutoGenerate} disabled={flowGenerating}>
                      {flowGenerating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando...</> : <><Zap className="h-3.5 w-3.5" /> Gerar Tudo</>}
                    </Button>
                    <Button size="sm" variant="secondary" className="gap-1.5" onClick={handleFlowRegenerate} disabled={flowGenerating}>
                      <Sparkles className="h-3.5 w-3.5" /> Regenerar Tudo
                    </Button>
                    <Button size="sm" variant="outline" onClick={openWeekPromptDialog}>
                      <Sparkles className="h-3.5 w-3.5 mr-1" /> Prompt Semana
                    </Button>
                  </div>
                }
                renderDay={(day) => {
                  const pauta = weekPautas.find(p => getPautaSlot(p) === day.key);
                  if (!pauta) return <p className="text-xs text-muted-foreground italic">Sem pauta</p>;
                  const sections = getSectionsForDay(day.key);
                  const sectionsData = (pauta.sections_json || {}) as Record<string, string>;
                  
                  // Compute warnings dynamically
                  const dynamicWarnings: string[] = [];
                  const inputs = getRawInputs(pauta);
                  if (day.key !== 'saturday' && day.key !== 'sunday') {
                    if (!inputs.review_rafa_id && !inputs.review_kilton_id && !sectionsData.review_rafa?.trim() && !sectionsData.review_kilton?.trim()) {
                      dynamicWarnings.push('Nenhuma resenha definida');
                    }
                  }
                  const empty = sections.filter(s => !sectionsData[s.key]?.trim());
                  if (empty.length > 0) {
                    dynamicWarnings.push(`Seções vazias: ${empty.map(s => s.label).join(', ')}`);
                  }

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${trafficLight(pauta)}`} />
                          <StatusBadge status={pauta.status} />
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6" title="Visualizar pauta" onClick={() => setPreviewPauta(pauta)}>
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" title="Prompt completo" onClick={() => openPromptDialog(pauta)}>
                            <Sparkles className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" title="Copiar prompt" onClick={() => handleCopyPrompt(generatePrompt(pauta))}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {dynamicWarnings.length > 0 && (
                        <div className="p-1.5 rounded bg-orange-500/10 border border-orange-500/20">
                          {dynamicWarnings.map((w, i) => (
                            <p key={i} className="text-[10px] text-orange-400">⚠ {w}</p>
                          ))}
                        </div>
                      )}

                      {sections.map(sec => (
                        <div key={sec.key} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{sec.label}</label>
                            <Button variant="ghost" size="icon" className="h-5 w-5" title={`Gerar ${sec.label}`} onClick={() => openPromptDialog(pauta, sec.key)}>
                              <Sparkles className="h-2.5 w-2.5" />
                            </Button>
                          </div>
                          <Textarea
                            className="min-h-[60px] text-xs resize-none"
                            placeholder={`${sec.label}...`}
                            value={sectionsData[sec.key] || ''}
                            onChange={e => handleSectionChange(pauta.id, sec.key as keyof PautaSections, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
            </TabsContent>

            <TabsContent value="flow">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {FLOW_STEPS.map((step, i) => (
                      <button
                        key={step.key}
                        onClick={() => setFlowStep(i)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                          i === flowStep ? 'bg-primary text-primary-foreground' :
                          i < flowStep ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {step.label}
                      </button>
                    ))}
                    <button
                      onClick={() => setFlowStep(FLOW_STEPS.length)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                        flowStep === FLOW_STEPS.length ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      Gerar
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" disabled={flowStep === 0} onClick={() => setFlowStep(s => s - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground">{flowStep + 1} / {flowTotalSteps}</span>
                    <Button size="sm" variant="outline" disabled={flowStep >= flowTotalSteps - 1} onClick={() => setFlowStep(s => s + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {renderFlowStep()}
              </div>
            </TabsContent>

            <TabsContent value="management">
              <div className="space-y-6">
                <h3 className="text-lg font-semibold">
                  Management – Semana de {new Date(selectedWeek.start_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                </h3>

                {/* Shared link */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      const url = `${window.location.origin}/week/${selectedWeek.id}`;
                      window.open(url, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    <ExternalLink className="h-4 w-4" /> Abrir pauta pública
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      const url = `${window.location.origin}/week/${selectedWeek.id}`;
                      navigator.clipboard.writeText(url);
                      toast.success('Link copiado');
                    }}
                  >
                    <Link2 className="h-4 w-4" /> Copiar link compartilhável
                  </Button>
                </div>

                {/* Progress cards grid */}
                <WorkspaceShell
                  excludeDays={['sunday']}
                  weekLabel="Progresso por episódio"
                  renderDay={(day) => {
                    const pauta = weekPautas.find(p => getPautaSlot(p) === day.key);
                    const mat = weekMats.find(m => m.slot_key === day.key);
                    if (!pauta) return <p className="text-xs text-muted-foreground italic">Sem pauta</p>;

                    const slot = getPautaSlot(pauta);
                    const sections = getSectionsForDay(slot);
                    const data = (pauta.sections_json || {}) as Record<string, string>;
                    const allSectionsFilled = sections.every(s => data[s.key]?.trim());

                    const indicators = {
                      pauta: allSectionsFilled,
                      title: mat?.selected_title_index != null,
                      description: !!mat?.description_html,
                      cover: !!(mat?.cover_url || mat?.cover_source_url || mat?.cover_saved_at),
                      saved: isMaterialSaved(mat),
                      scheduling: !!mat?.spotify_link,
                    };
                    const doneCount = Object.values(indicators).filter(Boolean).length;
                    const total = 6;
                    const pct = Math.round((doneCount / total) * 100);

                    return (
                      <div className="space-y-4">
                        {/* Progress bar */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-medium">{doneCount}/{total}</span>
                            <span className={cn(
                              'h-2.5 w-2.5 rounded-full',
                              doneCount === total ? 'bg-emerald-500' : doneCount >= 3 ? 'bg-yellow-500' : 'bg-orange-500'
                            )} />
                          </div>
                          <Progress value={pct} className="h-1.5" />
                        </div>

                        {/* Indicator chips */}
                        <div className="flex flex-wrap gap-1.5 text-[10px]">
                          {([
                            { key: 'pauta', label: 'Pauta', done: indicators.pauta },
                            { key: 'title', label: 'Título', done: indicators.title },
                            { key: 'desc', label: 'Desc.', done: indicators.description },
                            { key: 'cover', label: 'Capa', done: indicators.cover },
                            { key: 'saved', label: 'Salvo', done: indicators.saved },
                            { key: 'sched', label: 'Agend.', done: indicators.scheduling },
                          ] as const).map(item => (
                            <span key={item.key} className="flex items-center gap-0.5">
                              {item.done
                                ? <Check className="h-3 w-3 text-emerald-400" />
                                : <Circle className="h-3 w-3 text-muted-foreground/40" />
                              }
                              {item.label}
                            </span>
                          ))}
                        </div>

                        {/* Spotify link */}
                        <div className="space-y-1.5 border-t border-border/50 pt-3">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <Link2 className="h-3 w-3" /> Link do Spotify
                          </Label>
                          <div className="flex gap-1.5">
                            <Input
                              className="h-8 text-xs flex-1"
                              placeholder="https://open.spotify.com/episode/..."
                              value={mat?.spotify_link || ''}
                              onChange={e => {
                                if (mat) updateMaterial(mat.id, { spotify_link: e.target.value || null });
                              }}
                            />
                            <Button
                              size="sm"
                              className="h-8 px-3"
                              disabled={!mat}
                              onClick={() => {
                                if (mat) {
                                  updateMaterial(mat.id, { spotify_link: mat.spotify_link });
                                  toast.success('Link do Spotify salvo');
                                }
                              }}
                            >
                              Salvar
                            </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Preencher marca o episódio como agendado.</p>
                        </div>

                        {/* Repository link */}
                        <div className="space-y-1.5 border-t border-border/50 pt-3">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <FolderOpen className="h-3 w-3" /> Repositório
                          </Label>
                          <div className="flex gap-1.5">
                            <Input
                              className="h-8 text-xs flex-1"
                              placeholder="Link para as gravações do episódio..."
                              value={mat?.repository_url || ''}
                              onChange={e => {
                                if (mat) updateMaterial(mat.id, { repository_url: e.target.value || null });
                              }}
                            />
                            <Button
                              size="sm"
                              className="h-8 px-3"
                              disabled={!mat}
                              onClick={() => {
                                if (mat) {
                                  updateMaterial(mat.id, { repository_url: mat.repository_url });
                                  toast.success('Repositório salvo');
                                }
                              }}
                            >
                              Salvar
                            </Button>
                          </div>
                        </div>

                        {/* Status badge */}
                        <div className="border-t border-border/50 pt-2">
                          <StatusBadge status={computePautaStatus(pauta, mat)} />
                        </div>
                      </div>
                    );
                  }}
                />
              </div>
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Nenhuma semana criada. Clique em "Nova Semana" para começar.</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Semana Editorial</DialogTitle>
            <DialogDescription>Selecione qualquer data da semana. O app normaliza para a segunda-feira.</DialogDescription>
          </DialogHeader>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !newWeekDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {newWeekDate ? format(newWeekDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione uma data"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={newWeekDate}
                onSelect={setNewWeekDate}
                locale={ptBR}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateWeek} disabled={!newWeekDate}>Criar Semana</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* + Pauta Dialog */}
      <Dialog open={addPautaDialogOpen} onOpenChange={setAddPautaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Pauta</DialogTitle>
            <DialogDescription>Selecione a data e o template. A pauta será vinculada à semana correspondente (criada automaticamente se não existir).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Data da Pauta</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !newPautaDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newPautaDate ? format(newPautaDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione uma data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={newPautaDate} onSelect={setNewPautaDate} locale={ptBR} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={newPautaTemplateId} onValueChange={setNewPautaTemplateId}>
                <SelectTrigger><SelectValue placeholder="Selecione um template" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Padrão (sem template)</SelectItem>
                  {templates.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPautaDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddPauta} disabled={!newPautaDate}>Criar Pauta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover Semana</DialogTitle>
            <DialogDescription>Esta ação remove a semana, todas as pautas e materiais associados. Não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteWeek}>Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Protocolo de Prompt — {PROMPT_SCHEMA_VERSION} {activeSection ? `(${activeSection})` : `(${promptScope})`}
            </DialogTitle>
            <DialogDescription>
              Copie o prompt, use no chat externo e cole a resposta com as tags {`<snakepit_response schema_version="${PROMPT_SCHEMA_VERSION}" scope="${promptScope}">`}.
            </DialogDescription>
          </DialogHeader>
          {activePauta && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <Badge variant="secondary">Tom: {tone.label}</Badge>
                <Badge variant="secondary">Scope: {promptScope}</Badge>
                {bannedTerms.length > 0 && <Badge variant="outline">{bannedTerms.length} termos banidos</Badge>}
                <Badge variant="outline">{activeSection ? `Seção: ${activeSection}` : promptScope === 'week' ? 'Semana completa' : 'Pauta completa'}</Badge>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">1. Prompt gerado ({promptScope})</label>
                <div className="relative">
                  <pre className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                    {promptScope === 'week' ? generateWeekPrompt() : generatePrompt(activePauta, activeSection || undefined)}
                  </pre>
                  <Button size="icon" variant="ghost" className="absolute top-1 right-1 h-7 w-7"
                    onClick={() => handleCopyPrompt(promptScope === 'week' ? generateWeekPrompt() : generatePrompt(activePauta, activeSection || undefined))}>
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">2. Resposta (contrato {PROMPT_SCHEMA_VERSION})</label>
                  <Button size="sm" variant="secondary" onClick={handleGenerateAI} disabled={generating}>
                    {generating ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Gerando...</> : <><Zap className="h-3.5 w-3.5 mr-1.5" /> Gerar com IA</>}
                  </Button>
                </div>
                <Textarea rows={8} placeholder={`Cole aqui a resposta ou clique "Gerar com IA"...`} value={promptResponse} onChange={e => { setPromptResponse(e.target.value); setParseError(null); }} />
              </div>
              {parseError && (
                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                  <p className="font-medium mb-1">❌ Validação falhou:</p>
                  <p>{parseError}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromptDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleApplyResponse} disabled={!promptResponse || generating}>Validar e Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewPauta} onOpenChange={(open) => !open && setPreviewPauta(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-black border-border/30">
          <DialogHeader className="sr-only">
            <DialogTitle>Visualização da Pauta</DialogTitle>
            <DialogDescription>Preview da pauta para gravação</DialogDescription>
          </DialogHeader>
          {previewPauta && (() => {
            const slot = getPautaSlot(previewPauta);
            const sections = getSectionsForDay(slot);
            const data = (previewPauta.sections_json || {}) as Record<string, string>;
            const inputs = getRawInputs(previewPauta);
            const dayInfo = DAY_SLOTS.find(d => d.key === slot);

            const INTRO_SEGWAY = `Saudações, heavynautas!\n\nNossa nave está aterrissando em mais um episódio do nosso podcast diário com os melhores lançamentos do heavy metal. O meu nome é Kilton Fernandes e hoje eu estou com meu copiloto Rafa Ferreira. Seja muito bem-vindo!`;
            const OUTRO_SEGWAY = `Kilton: Nossa nave espacial está se preparando para levantar voo e partir por hoje. Muito obrigado por nos acompanhar nessa jornada pelo universo do heavy metal.\n\nRafa: E não se esqueçam, heavynautas! Estamos de volta amanhã com mais novidades do mundo do metal. O Snakepit vai ao ar todos os dias, de segunda a sexta as 6 da manhã. Desejo a todos uma ótima noite e até a nossa próxima viagem!`;

            return (
              <div className="space-y-10 p-4">
                <header className="border-b border-white/20 pb-6 text-center">
                  <h1 className="m-0 text-3xl font-bold tracking-tight text-white">SNAKEPIT</h1>
                  <h2 className="mt-3 text-xl font-semibold text-white/80">
                    {dayInfo?.label} — {new Date(previewPauta.publication_date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                  </h2>
                  <p className="mt-2 text-sm text-white/50">Roteiro organizado por blocos editoriais para facilitar a gravação.</p>
                </header>

                <section className="space-y-3">
                  <h2 className="text-xl font-bold uppercase tracking-wider text-primary">Abertura</h2>
                  <div className="border-l-4 border-primary pl-4">
                    <p className="text-lg leading-relaxed whitespace-pre-wrap text-white/90">{INTRO_SEGWAY}</p>
                  </div>
                </section>

                <section className="space-y-6">
                  <h2 className="text-xl font-bold uppercase tracking-wider text-primary">Blocos do episódio</h2>
                  {sections.map((sec, idx) => {
                    const rawContent = data[sec.key]?.trim() || '';
                    const content = rawContent
                      .replace(/<title>[\s\S]*?<\/title>\s*/gi, '')
                      .replace(/<\/?content>\s*/gi, '')
                      .replace(/<\/?section[^>]*>\s*/gi, '')
                      .trim() || null;
                    let contextNote = '';
                    let quickLinks: { youtube: string; spotify: string; deezer: string; metal_archives: string } | null = null;

                    if (sec.key === 'anniversary') {
                      contextNote = inputs.anniversary ? `📅 ${inputs.anniversary}` : '';
                      if (inputs.anniversary) {
                        const parts = inputs.anniversary.split(/\s*[-–—]\s*/);
                        const artist = parts[0]?.trim() || inputs.anniversary;
                        const album = parts[1]?.trim() || '';
                        const links = resolveAllLinks({ artist, album: album || artist });
                        quickLinks = { youtube: links.youtube, spotify: links.spotify, deezer: links.deezer, metal_archives: links.metal_archives };
                      }
                    }
                    if (sec.key === 'review_rafa') {
                      const rel = releases.find(r => r.id === inputs.review_rafa_id);
                      contextNote = rel ? `🎵 ${rel.artist} — ${rel.album}` : '';
                      if (rel) {
                        const links = resolveAllLinks(rel);
                        quickLinks = { youtube: links.youtube, spotify: links.spotify, deezer: links.deezer, metal_archives: links.metal_archives };
                      }
                    }
                    if (sec.key === 'review_kilton') {
                      const rel = releases.find(r => r.id === inputs.review_kilton_id);
                      contextNote = rel ? `🎵 ${rel.artist} — ${rel.album}` : '';
                      if (rel) {
                        const links = resolveAllLinks(rel);
                        quickLinks = { youtube: links.youtube, spotify: links.spotify, deezer: links.deezer, metal_archives: links.metal_archives };
                      }
                    }
                    if (sec.key === 'news') contextNote = inputs.news_link ? `🔗 ${inputs.news_link}` : '';

                    return (
                      <article key={sec.key} className={idx > 0 ? 'border-t border-white/10 pt-6' : ''}>
                        <h3 className="mb-3 text-lg font-bold uppercase tracking-wider text-white">
                          {sec.label}
                        </h3>
                        {contextNote && (
                          <h4 className="mb-3 text-sm font-medium italic text-white/55">{contextNote}</h4>
                        )}
                        {content ? (
                          <div className="text-lg leading-relaxed whitespace-pre-wrap text-white/90">{content}</div>
                        ) : (
                          <p className="text-lg italic text-white/30">Seção não preenchida</p>
                        )}
                        {quickLinks && (
                          <div className="mt-4 border-t border-white/5 pt-3">
                            <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Links rápidos</h4>
                            <div className="flex flex-wrap items-center gap-2">
                              {([
                                { key: 'youtube', label: 'YouTube', color: 'text-red-400 hover:text-red-300' },
                                { key: 'spotify', label: 'Spotify', color: 'text-emerald-400 hover:text-emerald-300' },
                                { key: 'deezer', label: 'Deezer', color: 'text-purple-400 hover:text-purple-300' },
                                { key: 'metal_archives', label: 'Metal Archives', color: 'text-orange-400 hover:text-orange-300' },
                              ] as const).map((platform, i, arr) => (
                                <span key={platform.key} className="flex items-center gap-1">
                                  <a
                                    href={quickLinks![platform.key]}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`text-sm font-medium transition-colors ${platform.color}`}
                                  >
                                    {platform.label}
                                  </a>
                                  {i < arr.length - 1 && <span className="text-white/20">|</span>}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </section>

                <section className="space-y-3 border-t border-white/10 pt-6">
                  <h2 className="text-xl font-bold uppercase tracking-wider text-primary">Encerramento</h2>
                  <div className="border-l-4 border-primary pl-4">
                    <p className="text-lg leading-relaxed whitespace-pre-wrap text-white/90">{OUTRO_SEGWAY}</p>
                  </div>
                </section>

                <footer className="border-t border-white/10 pt-4 text-center">
                  <p className="m-0 text-xs text-white/40">Status: {previewPauta.status}</p>
                </footer>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              if (!previewPauta) return;
              const slot = getPautaSlot(previewPauta);
              const sections = getSectionsForDay(slot);
              const data = (previewPauta.sections_json || {}) as Record<string, string>;
              const inputs = getRawInputs(previewPauta);
              const INTRO_SEGWAY = `Saudações, heavynautas!\n\nNossa nave está aterrissando em mais um episódio do nosso podcast diário com os melhores lançamentos do heavy metal. O meu nome é Kilton Fernandes e hoje eu estou com meu copiloto Rafa Ferreira. Seja muito bem-vindo!`;
              const OUTRO_SEGWAY = `Kilton: Nossa nave espacial está se preparando para levantar voo e partir por hoje. Muito obrigado por nos acompanhar nessa jornada pelo universo do heavy metal.\n\nRafa: E não se esqueçam, heavynautas! Estamos de volta amanhã com mais novidades do mundo do metal. O Snakepit vai ao ar todos os dias, de segunda a sexta as 6 da manhã. Desejo a todos uma ótima noite e até a nossa próxima viagem!`;
              const text = [
                '# SNAKEPIT',
                `## ${new Date(previewPauta.publication_date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}`,
                '',
                '## Abertura',
                INTRO_SEGWAY,
                '',
                '## Blocos do episódio',
                ...sections.flatMap((section) => {
                  const lines = [`### ${section.label}`];
                  if (section.key === 'anniversary' && inputs.anniversary) {
                    lines.push(`#### Contexto\n${inputs.anniversary}`);
                  }
                  lines.push(data[section.key]?.trim() || 'N/A');
                  lines.push('');
                  return lines;
                }),
                '## Encerramento',
                OUTRO_SEGWAY,
              ].join('\n');
              navigator.clipboard.writeText(text);
              toast.success('Conteúdo copiado');
            }}>
              <Copy className="h-4 w-4 mr-2" /> Copiar Texto
            </Button>
            <Button onClick={() => setPreviewPauta(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exportar Pautas</DialogTitle>
            <DialogDescription>Escolha o formato de exportação da semana.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 flex-wrap">
            {([['clipboard', 'Clipboard'], ['txt', 'TXT'], ['md', 'Markdown'], ['json', 'JSON']] as const).map(([val, label]) => (
              <Button key={val} size="sm" variant={exportFormat === val ? 'default' : 'outline'} onClick={() => setExportFormat(val)}>
                {label}
              </Button>
            ))}
          </div>
          {exportFormat !== 'clipboard' && (
            <p className="text-xs text-muted-foreground">Será gerado o arquivo <code>pautas_{selectedWeek?.start_date}.{exportFormat}</code></p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleExport}>{exportFormat === 'clipboard' ? 'Copiar' : 'Baixar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generation progress modal */}
      <GenerationProgressModal
        open={progressModalOpen}
        onOpenChange={setProgressModalOpen}
        title={progressTitle}
        items={progressItems}
        logs={progressLogs}
      />
    </div>
  );
}
