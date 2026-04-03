import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileText, Plus, Copy, Check, Sparkles, Download, Trash2, AlertTriangle, ExternalLink, Upload, CalendarIcon, Loader2, Zap, ChevronLeft, ChevronRight, Save, Eye } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
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
import { StatusBadge } from '@/components/StatusBadge';
import { useApp } from '@/contexts/AppContext';
import { getSectionsForDay, DAY_SLOTS } from '@/lib/constants';
import { Pauta, PautaSections, DaySlot, Release } from '@/lib/types';
import { buildWeekPrompt, buildDayPrompt, buildSectionPrompt, toneProfileForTemperature, PROMPT_SCHEMA_VERSION, type PromptBuildContext } from '@/lib/prompt-builder';
import { parsePautaResponse } from '@/lib/response-parser';
import { toast } from 'sonner';

function getPautaSlot(pauta: Pauta): DaySlot {
  const d = new Date(pauta.publication_date + 'T12:00:00');
  const wd = d.getDay();
  const slotMap: Record<number, DaySlot> = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };
  return slotMap[wd] || 'monday';
}

function getEligibleReviews(releases: Release[], publicationDate: string): Release[] {
  const pub = new Date(publicationDate + 'T12:00:00');
  const dPlus1 = new Date(pub); dPlus1.setDate(pub.getDate() + 1);
  return releases.filter(r => {
    const rd = new Date(r.release_date + 'T12:00:00');
    return rd >= dPlus1;
  });
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
      const genres = r.genres && r.genres.length > 0 ? r.genres : ['Sem gênero'];
      for (const g of genres) {
        if (!genreMap.has(g)) genreMap.set(g, []);
        genreMap.get(g)!.push(r);
      }
    }
    const genres = Array.from(genreMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([genre, releases]) => ({ genre, releases: releases.sort((a, b) => a.artist.localeCompare(b.artist)) }));
    result.push({ weekLabel, genres });
  }
  result.sort((a, b) => a.weekLabel.localeCompare(b.weekLabel));
  return result;
}

function getEligibleSaturdayReleases(releases: Release[], publicationDate: string): Release[] {
  const pub = new Date(publicationDate + 'T12:00:00');
  const dPlus2 = new Date(pub); dPlus2.setDate(pub.getDate() + 2);
  const dPlus8 = new Date(pub); dPlus8.setDate(pub.getDate() + 8);
  return releases.filter(r => {
    const rd = new Date(r.release_date + 'T12:00:00');
    return rd >= dPlus2 && rd <= dPlus8;
  });
}

// Flow step definitions matching section order
const FLOW_STEPS = [
  { key: 'anniversary', label: 'Aniversários', inputKey: 'anniversary' },
  { key: 'review_rafa', label: 'Review Rafa', inputKey: 'review_rafa_id', isReview: true },
  { key: 'news', label: 'Notícias', inputKey: 'news_link' },
  { key: 'review_kilton', label: 'Review Kilton', inputKey: 'review_kilton_id', isReview: true },
] as const;

export default function Pautas() {
  const { weeks, addWeek, deleteWeek, pautas, updatePauta, getPautasForWeek, settings, releases, recalcWeekStatus, savePromptSession, logActivity } = useApp();
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [newWeekDate, setNewWeekDate] = useState<Date | undefined>(undefined);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
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
  const [activeTab, setActiveTab] = useState('inputs');
  const [generating, setGenerating] = useState(false);
  const [flowStep, setFlowStep] = useState(0);
  const [flowGenerating, setFlowGenerating] = useState(false);
  const [flowProgress, setFlowProgress] = useState<Record<string, Record<string, 'pending' | 'generating' | 'done' | 'error'>>>({});
  const [previewPauta, setPreviewPauta] = useState<Pauta | null>(null);
  const selectedWeek = weeks.find(w => w.id === selectedWeekId) || weeks[0];
  const weekPautas = selectedWeek ? getPautasForWeek(selectedWeek.id) : [];

  const bannedTerms = settings.banned_terms_text ? settings.banned_terms_text.split('\n').filter(Boolean) : [];
  const tone = toneProfileForTemperature(settings.brand_tone_temperature);

  const promptCtx: PromptBuildContext = useMemo(() => ({
    settings,
    releases,
    bannedTerms,
  }), [settings, releases, bannedTerms]);

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

  const handleDeleteWeek = () => {
    if (!selectedWeek) return;
    deleteWeek(selectedWeek.id);
    setSelectedWeekId(null);
    setDeleteConfirmOpen(false);
    toast.success('Semana removida');
  };

  const getRawInputs = (pauta: Pauta) => (pauta.raw_inputs_json || {}) as Record<string, any>;

  const updateRawInput = (pautaId: string, key: string, value: any) => {
    const pauta = pautas.find(p => p.id === pautaId);
    if (!pauta) return;
    const inputs = getRawInputs(pauta);
    updatePauta(pautaId, { raw_inputs_json: { ...inputs, [key]: value } });
  };

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

  // ─── Generate with AI (streaming) ───
  const streamAI = useCallback(async (prompt: string, onChunk: (full: string) => void): Promise<string> => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pauta`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ prompt }),
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

    try {
      await streamAI(prompt, (full) => setPromptResponse(full));
      toast.success('Resposta gerada com IA');
      logActivity('IA gerou resposta', `scope: ${promptScope}, pauta: ${activePauta.publication_date}`);
    } catch (e: any) {
      console.error('AI generation error:', e);
      toast.error(e.message || 'Erro ao gerar com IA');
    } finally {
      setGenerating(false);
    }
  }, [activePauta, activeSection, promptScope, streamAI]);

  // ─── Apply response using ResponseParser ───
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

    if (warnings.length > 0) {
      updatePauta(id, { status: 'needs_review', warnings_json: warnings });
      toast.warning(`Pauta enviada para revisão: ${warnings.join('; ')}`);
    } else {
      updatePauta(id, { status: 'finalized', finalized_at: new Date().toISOString(), warnings_json: [] });
      toast.success('Pauta finalizada');
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

  // ─── Flow: auto-generate all prompts with granular progress ───
  const handleFlowAutoGenerate = useCallback(async () => {
    if (!selectedWeek || weekPautas.length === 0) return;
    setFlowGenerating(true);

    const weekdayPautas = weekPautas.filter(p => {
      const slot = getPautaSlot(p);
      return slot !== 'sunday';
    });

    // Initialize progress map
    const initialProgress: Record<string, Record<string, 'pending' | 'generating' | 'done' | 'error'>> = {};
    for (const pauta of weekdayPautas) {
      const slot = getPautaSlot(pauta);
      const sections = getSectionsForDay(slot);
      initialProgress[slot] = {};
      for (const sec of sections) {
        initialProgress[slot][sec.key] = 'pending';
      }
    }
    setFlowProgress(initialProgress);

    for (const pauta of weekdayPautas) {
      const slot = getPautaSlot(pauta);
      const sections = getSectionsForDay(slot);

      // Mark all sections of this day as generating
      setFlowProgress(prev => {
        const next = { ...prev };
        next[slot] = { ...next[slot] };
        for (const sec of sections) next[slot][sec.key] = 'generating';
        return next;
      });

      const prompt = buildDayPrompt(pauta, promptCtx);
      if (!prompt) continue;

      try {
        const responseText = await streamAI(prompt, () => {});
        const result = parsePautaResponse(responseText, 'day', { publication_date: pauta.publication_date });

        if (result.success && result.sections) {
          const current = (pauta.sections_json || {}) as Record<string, string>;
          const updated = { ...current, ...result.sections };
          const allContent = Object.values(updated).join('\n');
          const linkMatches = allContent.match(/https?:\/\/[^\s<>"]+/g) || [];
          updatePauta(pauta.id, {
            sections_json: updated,
            status: 'generated',
            discovered_links_json: linkMatches,
            rendered_markdown: sections.map(s => `## ${s.label}\n\n${updated[s.key] || 'N/A'}`).join('\n\n'),
            rendered_text: sections.map(s => `${s.label}:\n${updated[s.key] || 'N/A'}`).join('\n\n'),
          });
          // Mark sections as done
          setFlowProgress(prev => {
            const next = { ...prev };
            next[slot] = { ...next[slot] };
            for (const sec of sections) next[slot][sec.key] = 'done';
            return next;
          });
        } else {
          setFlowProgress(prev => {
            const next = { ...prev };
            next[slot] = { ...next[slot] };
            for (const sec of sections) next[slot][sec.key] = 'error';
            return next;
          });
          toast.error(`Falha: ${slot} — ${result.error}`);
        }
      } catch (e: any) {
        setFlowProgress(prev => {
          const next = { ...prev };
          next[slot] = { ...next[slot] };
          for (const sec of sections) next[slot][sec.key] = 'error';
          return next;
        });
        toast.error(`Erro: ${e.message}`);
      }
    }

    if (selectedWeek) recalcWeekStatus(selectedWeek.id);
    setFlowGenerating(false);
    toast.success('Flow automático concluído');
    logActivity('Flow automático', `Semana: ${selectedWeek.start_date}`);
  }, [selectedWeek, weekPautas, promptCtx, streamAI]);

  const handleFlowManual = () => {
    setActiveTab('inputs');
    setFlowStep(0);
  };

  // Flow steps: each section across all weekday pautas
  const flowWeekdayPautas = weekPautas.filter(p => {
    const slot = getPautaSlot(p);
    return slot !== 'sunday' && slot !== 'saturday';
  }).sort((a, b) => a.publication_date.localeCompare(b.publication_date));

  const flowTotalSteps = FLOW_STEPS.length + 1; // +1 for final action screen

  const ReleasePicker = ({ pauta, inputKey, label }: { pauta: Pauta; inputKey: string; label: string }) => {
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    const inputs = getRawInputs(pauta);
    const eligible = getEligibleReviews(releases, pauta.publication_date);
    const selectedId = inputs[inputKey];
    const selected = releases.find(r => r.id === selectedId);

    const filtered = search.trim()
      ? eligible.filter(r => `${r.artist} ${r.album}`.toLowerCase().includes(search.toLowerCase()))
      : eligible;

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
            <ScrollArea className="h-[300px]">
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
                  {eligible.length === 0 ? 'Nenhum release a partir de D+1' : 'Nenhum resultado'}
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
    const inputs = getRawInputs(pauta);
    const eligible = getEligibleSaturdayReleases(releases, pauta.publication_date);
    const selectedIds: string[] = inputs.selected_release_ids || [];

    const toggle = (id: string) => {
      const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id];
      updateRawInput(pauta.id, 'selected_release_ids', next);
    };

    return (
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Destaques da Semana (D+2 a D+10)</Label>
        {eligible.length > 0 ? (
          <div className="space-y-1 max-h-[120px] overflow-y-auto">
            {eligible.map(r => (
              <button
                key={r.id}
                className={`w-full text-left p-1.5 rounded text-xs border transition-colors ${selectedIds.includes(r.id) ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/30'}`}
                onClick={() => toggle(r.id)}
              >
                {r.artist} – {r.album}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground italic">Nenhum release na janela D+2/D+10</p>
        )}
      </div>
    );
  };

  const currentPromptText = activePauta
    ? (activeSection ? generatePrompt(activePauta, activeSection) : (activeSection === null && !activePauta ? generateWeekPrompt() : generatePrompt(activePauta)))
    : '';

  // ─── Flow step renderer ───
  const renderFlowStep = () => {
    if (flowStep >= FLOW_STEPS.length) {
      // Final step: action buttons
      return (
        <div className="flex flex-col items-center justify-center py-16 space-y-6">
          <div className="text-center space-y-2">
            <h3 className="text-xl font-bold">Insumos Completos</h3>
            <p className="text-muted-foreground">Todos os campos de insumo da semana foram preenchidos. Como deseja prosseguir?</p>
          </div>
          <div className="flex gap-4">
            <Button size="lg" className="gap-2" onClick={handleFlowAutoGenerate} disabled={flowGenerating}>
              {flowGenerating ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</> : <><Zap className="h-4 w-4" /> Gerar Automaticamente</>}
            </Button>
            <Button size="lg" variant="outline" className="gap-2" onClick={handleFlowManual} disabled={flowGenerating}>
              <FileText className="h-4 w-4" /> Gerar Manualmente
            </Button>
          </div>
        </div>
      );
    }

    const step = FLOW_STEPS[flowStep];

    return (
      <div className="space-y-6">
        <div className="text-center space-y-1">
          <h3 className="text-lg font-bold">{step.label}</h3>
          <p className="text-sm text-muted-foreground">Preencha os dados de {step.label.toLowerCase()} para todos os dias da semana</p>
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
                      <Input
                        className="h-7 text-[10px]"
                        placeholder="Direção: Aniversário"
                        value={inputs.comment_anniversary || ''}
                        onChange={e => updateRawInput(pauta.id, 'comment_anniversary', e.target.value)}
                      />
                    </>
                  )}

                  {step.key === 'review_rafa' && (
                    <>
                      <ReleasePicker pauta={pauta} inputKey="review_rafa_id" label="Review Rafa" />
                      <Input
                        className="h-7 text-[10px]"
                        placeholder="Direção: Review Rafa"
                        value={inputs.comment_review_rafa || ''}
                        onChange={e => updateRawInput(pauta.id, 'comment_review_rafa', e.target.value)}
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
                      <Input
                        className="h-7 text-[10px]"
                        placeholder="Direção: Notícias"
                        value={inputs.comment_news || ''}
                        onChange={e => updateRawInput(pauta.id, 'comment_news', e.target.value)}
                      />
                    </>
                  )}

                  {step.key === 'review_kilton' && (
                    <>
                      <ReleasePicker pauta={pauta} inputKey="review_kilton_id" label="Review Kilton" />
                      <Input
                        className="h-7 text-[10px]"
                        placeholder="Direção: Review Kilton"
                        value={inputs.comment_review_kilton || ''}
                        onChange={e => updateRawInput(pauta.id, 'comment_review_kilton', e.target.value)}
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
          <Button size="sm" className="gap-2" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Nova Semana
          </Button>
        </div>
      </div>

      {weeks.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {weeks.map(w => (
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
      )}

      {selectedWeek ? (
        <>
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === 'flow') setFlowStep(0); }}>
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="inputs">Insumos</TabsTrigger>
                <TabsTrigger value="content">Conteúdo</TabsTrigger>
                <TabsTrigger value="flow">Flow</TabsTrigger>
              </TabsList>
              {activeTab === 'inputs' && (
                <Button size="sm" className="gap-2" onClick={handleSaveAll}>
                  <Save className="h-3.5 w-3.5" /> Salvar Todos
                </Button>
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

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${trafficLight(pauta)}`} />
                        <StatusBadge status={pauta.status} />
                      </div>

                      {/* Anniversary + direction */}
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
                      <Input
                        className="h-7 text-[10px]"
                        placeholder="Direção: Aniversário"
                        value={inputs.comment_anniversary || ''}
                        onChange={e => updateRawInput(pauta.id, 'comment_anniversary', e.target.value)}
                      />

                      {/* Weekday-specific: interleaved review/news + directions */}
                      {slot !== 'saturday' && slot !== 'sunday' && (
                        <>
                          <ReleasePicker pauta={pauta} inputKey="review_rafa_id" label="Review Rafa" />
                          <Input
                            className="h-7 text-[10px]"
                            placeholder="Direção: Review Rafa"
                            value={inputs.comment_review_rafa || ''}
                            onChange={e => updateRawInput(pauta.id, 'comment_review_rafa', e.target.value)}
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
                          <Input
                            className="h-7 text-[10px]"
                            placeholder="Direção: Notícias"
                            value={inputs.comment_news || ''}
                            onChange={e => updateRawInput(pauta.id, 'comment_news', e.target.value)}
                          />

                          <ReleasePicker pauta={pauta} inputKey="review_kilton_id" label="Review Kilton" />
                          <Input
                            className="h-7 text-[10px]"
                            placeholder="Direção: Review Kilton"
                            value={inputs.comment_review_kilton || ''}
                            onChange={e => updateRawInput(pauta.id, 'comment_review_kilton', e.target.value)}
                          />
                        </>
                      )}

                      {/* Saturday: release picker */}
                      {slot === 'saturday' && (
                        <>
                          <SaturdayReleasePicker pauta={pauta} />
                          <Input
                            className="h-7 text-[10px]"
                            placeholder="Direção: Lançamentos da Semana"
                            value={inputs.comment_next_week_releases || ''}
                            onChange={e => updateRawInput(pauta.id, 'comment_next_week_releases', e.target.value)}
                          />
                        </>
                      )}

                      {/* Sunday: compilation summary */}
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
                      {flowGenerating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando Semana...</> : <><Zap className="h-3.5 w-3.5" /> Gerar Tudo</>}
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
                  const warnings = (pauta.warnings_json || []) as string[];

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
                          {pauta.status !== 'finalized' && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" title="Finalizar" onClick={() => finalizePauta(pauta.id)}>
                              <Check className="h-3 w-3" />
                            </Button>
                          )}
                          {pauta.status === 'needs_review' && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" title="Forçar finalização" onClick={() => forceFinalize(pauta.id)}>
                              <AlertTriangle className="h-3 w-3 text-orange-400" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {warnings.length > 0 && (
                        <div className="p-1.5 rounded bg-orange-500/10 border border-orange-500/20">
                          {warnings.map((w, i) => (
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
                {/* Flow navigation bar */}
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

      {/* Create Week Dialog */}
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

      {/* Delete Week Confirm */}
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

      {/* Prompt Protocol Dialog */}
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

      {/* Pauta Preview Dialog */}
      <Dialog open={!!previewPauta} onOpenChange={(open) => !open && setPreviewPauta(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Visualização da Pauta</DialogTitle>
            <DialogDescription>
              {previewPauta && (() => {
                const slot = getPautaSlot(previewPauta);
                const dayInfo = DAY_SLOTS.find(d => d.key === slot);
                return `${dayInfo?.label} — ${previewPauta.publication_date}`;
              })()}
            </DialogDescription>
          </DialogHeader>
          {previewPauta && (() => {
            const slot = getPautaSlot(previewPauta);
            const sections = getSectionsForDay(slot);
            const data = (previewPauta.sections_json || {}) as Record<string, string>;
            const inputs = getRawInputs(previewPauta);
            const dayInfo = DAY_SLOTS.find(d => d.key === slot);

            return (
              <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
                <div className="text-center border-b border-border pb-4 mb-6">
                  <h2 className="text-xl font-bold tracking-tight m-0">🐍 SNAKEPIT</h2>
                  <p className="text-muted-foreground text-sm m-0 mt-1">
                    {dayInfo?.label} — {new Date(previewPauta.publication_date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                </div>

                {sections.map((sec, idx) => {
                  const content = data[sec.key]?.trim();
                  let contextNote = '';
                  if (sec.key === 'anniversary') contextNote = inputs.anniversary ? `📅 ${inputs.anniversary}` : '';
                  if (sec.key === 'review_rafa') {
                    const rel = releases.find(r => r.id === inputs.review_rafa_id);
                    contextNote = rel ? `🎵 ${rel.artist} — ${rel.album}` : '';
                  }
                  if (sec.key === 'review_kilton') {
                    const rel = releases.find(r => r.id === inputs.review_kilton_id);
                    contextNote = rel ? `🎵 ${rel.artist} — ${rel.album}` : '';
                  }
                  if (sec.key === 'news') contextNote = inputs.news_link ? `🔗 ${inputs.news_link}` : '';

                  return (
                    <div key={sec.key} className={idx > 0 ? 'border-t border-border/50 pt-4' : ''}>
                      <h3 className="text-base font-bold uppercase tracking-wider text-primary m-0 mb-2">
                        {sec.label}
                      </h3>
                      {contextNote && (
                        <p className="text-xs text-muted-foreground italic m-0 mb-2">{contextNote}</p>
                      )}
                      {content ? (
                        <div className="text-sm leading-relaxed whitespace-pre-wrap">{content}</div>
                      ) : (
                        <p className="text-sm text-muted-foreground/50 italic">Seção não preenchida</p>
                      )}
                    </div>
                  );
                })}

                <div className="border-t border-border pt-4 mt-6 text-center">
                  <p className="text-xs text-muted-foreground m-0">Status: {previewPauta.status}</p>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              if (!previewPauta) return;
              const slot = getPautaSlot(previewPauta);
              const sections = getSectionsForDay(slot);
              const data = (previewPauta.sections_json || {}) as Record<string, string>;
              const text = sections.map(s => `## ${s.label}\n\n${data[s.key]?.trim() || 'N/A'}`).join('\n\n---\n\n');
              navigator.clipboard.writeText(text);
              toast.success('Conteúdo copiado');
            }}>
              <Copy className="h-4 w-4 mr-2" /> Copiar Texto
            </Button>
            <Button onClick={() => setPreviewPauta(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
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
    </div>
  );
}
