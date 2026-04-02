import { useState, useMemo } from 'react';
import { FileText, Plus, Copy, Check, Sparkles, Download, Trash2, AlertTriangle, ExternalLink, Upload } from 'lucide-react';
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
import { toast } from 'sonner';

const EDITORIAL_IDENTITY = `Você é o editor-chefe do Heavynauta, podcast diário de heavy metal que combina informação profunda com linguagem acessível. Mantenha a identidade: referências a subgêneros (death, black, doom, thrash, power), precisão factual, tom firme mas acolhedor para a comunidade metal brasileira. Use "Papo Sério Sobre Música Pesada" como tagline quando apropriado.`;

function getPautaSlot(pauta: Pauta): DaySlot {
  const d = new Date(pauta.publication_date + 'T12:00:00');
  const wd = d.getDay();
  const slotMap: Record<number, DaySlot> = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };
  return slotMap[wd] || 'monday';
}

function getEligibleReviews(releases: Release[], publicationDate: string): Release[] {
  const pub = new Date(publicationDate + 'T12:00:00');
  const dMinus30 = new Date(pub); dMinus30.setDate(pub.getDate() - 30);
  const dMinus1 = new Date(pub); dMinus1.setDate(pub.getDate() - 1);
  return releases.filter(r => {
    const rd = new Date(r.release_date + 'T12:00:00');
    return rd >= dMinus30 && rd <= dMinus1;
  });
}

function getEligibleSaturdayReleases(releases: Release[], publicationDate: string): Release[] {
  const pub = new Date(publicationDate + 'T12:00:00');
  const dPlus2 = new Date(pub); dPlus2.setDate(pub.getDate() + 2);
  const dPlus10 = new Date(pub); dPlus10.setDate(pub.getDate() + 10);
  return releases.filter(r => {
    const rd = new Date(r.release_date + 'T12:00:00');
    return rd >= dPlus2 && rd <= dPlus10;
  });
}

export default function Pautas() {
  const { weeks, addWeek, deleteWeek, pautas, updatePauta, getPautasForWeek, settings, releases, recalcWeekStatus, savePromptSession, logActivity } = useApp();
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [newWeekDate, setNewWeekDate] = useState('');
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

  const selectedWeek = weeks.find(w => w.id === selectedWeekId) || weeks[0];
  const weekPautas = selectedWeek ? getPautasForWeek(selectedWeek.id) : [];

  const bannedTerms = settings.banned_terms_text ? settings.banned_terms_text.split('\n').filter(Boolean) : [];
  const tonePreset = (() => {
    const t = settings.brand_tone_temperature;
    if (t <= 30) return 'Cirúrgico – tom extremamente preciso e direto';
    if (t <= 50) return 'Sóbrio – tom informativo e equilibrado';
    if (t <= 60) return 'Equilibrado – informativo com personalidade';
    if (t <= 75) return 'Quente – empolgante e envolvente';
    return 'Incendiário – máximo entusiasmo e energia';
  })();

  const handleCreateWeek = () => {
    if (!newWeekDate) return;
    // Normalize to Monday
    const d = new Date(newWeekDate + 'T12:00:00');
    const dayOfWeek = d.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    d.setDate(d.getDate() + diff);
    const monday = d.toISOString().slice(0, 10);
    // Check if already exists
    if (weeks.some(w => w.start_date === monday)) {
      toast.error('Semana já existe');
      return;
    }
    const week = addWeek(monday);
    setSelectedWeekId(week.id);
    setCreateDialogOpen(false);
    setNewWeekDate('');
  };

  const handleDeleteWeek = () => {
    if (!selectedWeek) return;
    deleteWeek(selectedWeek.id);
    setSelectedWeekId(null);
    setDeleteConfirmOpen(false);
    toast.success('Semana removida');
  };

  // Raw inputs management
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

  // Prompt generation
  const generatePrompt = (pauta: Pauta, sectionKey?: string) => {
    const slot = getPautaSlot(pauta);
    const allSections = getSectionsForDay(slot);
    const sections = sectionKey ? allSections.filter(s => s.key === sectionKey) : allSections;
    const sectionList = sections.map(s => `- ${s.label} (tag: <${s.key}>)`).join('\n');
    const bannedStr = bannedTerms.length > 0 ? `\n\nTERMOS PROIBIDOS (nunca use estas palavras/expressões):\n${bannedTerms.map(t => `- ${t}`).join('\n')}` : '';
    const inputs = getRawInputs(pauta);

    // Contextual info from raw inputs
    let context = '';
    if (inputs.anniversary) context += `\nAniversário do dia: ${inputs.anniversary}`;
    if (inputs.review_rafa_id) {
      const rel = releases.find(r => r.id === inputs.review_rafa_id);
      if (rel) context += `\nReview Rafa: ${rel.artist} - ${rel.album} (${rel.release_date})`;
    }
    if (inputs.review_kilton_id) {
      const rel = releases.find(r => r.id === inputs.review_kilton_id);
      if (rel) context += `\nReview Kilton: ${rel.artist} - ${rel.album} (${rel.release_date})`;
    }
    if (inputs.news_link) context += `\nLink de notícia: ${inputs.news_link}`;
    if (inputs.selected_release_ids?.length) {
      const rels = releases.filter(r => inputs.selected_release_ids.includes(r.id));
      context += `\nDestaques da semana:\n${rels.map(r => `  - ${r.artist} - ${r.album} (${r.release_date})`).join('\n')}`;
    }
    // Editorial comments per section
    sections.forEach(s => {
      const comment = inputs[`comment_${s.key}`];
      if (comment) context += `\nDireção editorial (${s.label}): ${comment}`;
    });

    return `${EDITORIAL_IDENTITY}

TOM: ${tonePreset} (temperatura: ${settings.brand_tone_temperature}/100)
${bannedStr}
${context ? `\n---\nCONTEXTO EDITORIAL:${context}\n---` : ''}

Gere ${sectionKey ? `a seção "${sections[0]?.label}"` : 'a pauta completa'} do episódio do dia ${pauta.publication_date} (${slot}) ${sectionKey ? '' : `com as seguintes seções:\n${sectionList}`}

Formato de resposta OBRIGATÓRIO (use exatamente estas tags):
<snakepit_response>
${sections.map(s => `<${s.key}>
[conteúdo da seção ${s.label}]
</${s.key}>`).join('\n')}
</snakepit_response>

IMPORTANTE: A intro e outro são geradas automaticamente pelo app. Foque APENAS nas seções listadas acima.`;
  };

  const generateWeekPrompt = () => {
    if (weekPautas.length === 0) return '';
    return weekPautas.map(p => {
      const slot = getPautaSlot(p);
      return `=== ${slot.toUpperCase()} (${p.publication_date}) ===\n\n${generatePrompt(p)}`;
    }).join('\n\n---\n\n');
  };

  const handleCopyPrompt = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Prompt copiado');
  };

  const openPromptDialog = (pauta: Pauta, sectionKey?: string) => {
    setActivePauta(pauta);
    setActiveSection(sectionKey || null);
    setApplyScope(sectionKey ? 'section' : 'all');
    setApplySection(sectionKey || '');
    setPromptResponse('');
    setPromptDialogOpen(true);
    // Save prompt session
    const sessionId = crypto.randomUUID();
    savePromptSession({
      id: sessionId,
      scope: sectionKey ? 'section' : 'day',
      prompt_text: generatePrompt(pauta, sectionKey),
      target_json: { pauta_id: pauta.id, section: sectionKey || null, week_id: pauta.week_id },
    });
  };

  const openWeekPromptDialog = () => {
    if (weekPautas.length === 0) return;
    setActivePauta(weekPautas[0]);
    setActiveSection(null);
    setApplyScope('all');
    setPromptResponse('');
    setPromptDialogOpen(true);
    const sessionId = crypto.randomUUID();
    savePromptSession({
      id: sessionId,
      scope: 'week',
      prompt_text: generateWeekPrompt(),
      target_json: { week_id: selectedWeek?.id },
    });
  };

  const handleApplyResponse = () => {
    if (!activePauta || !promptResponse) return;
    const extract = (tag: string) => {
      const match = promptResponse.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
      return match?.[1]?.trim() || '';
    };

    // If week scope, apply to all pautas
    if (!activeSection && weekPautas.length > 0) {
      weekPautas.forEach(p => {
        const slot = getPautaSlot(p);
        const sections = getSectionsForDay(slot);
        const currentSections = (p.sections_json || {}) as Record<string, string>;
        const updated: Record<string, string> = { ...currentSections };
        sections.forEach(s => {
          const val = extract(s.key);
          if (val) updated[s.key] = val;
        });
        const hasContent = sections.some(s => updated[s.key]?.trim());
        // Detect warnings
        const warnings: string[] = [];
        const inputs = getRawInputs(p);
        if (slot !== 'saturday' && slot !== 'sunday') {
          if (!inputs.review_rafa_id && !inputs.review_kilton_id && !updated.review_rafa?.trim() && !updated.review_kilton?.trim()) {
            warnings.push('Nenhuma resenha definida para este dia útil');
          }
        }
        // Detect links in content
        const allContent = Object.values(updated).join('\n');
        const linkMatches = allContent.match(/https?:\/\/[^\s<>"]+/g) || [];
        updatePauta(p.id, {
          sections_json: updated,
          status: hasContent ? 'generated' : p.status,
          warnings_json: warnings,
          discovered_links_json: linkMatches,
          rendered_markdown: sections.map(s => `## ${s.label}\n\n${updated[s.key] || 'Não Aplicável'}`).join('\n\n'),
          rendered_text: sections.map(s => `${s.label}:\n${updated[s.key] || 'Não Aplicável'}`).join('\n\n'),
        });
      });
    } else {
      // Single pauta or section
      const slot = getPautaSlot(activePauta);
      const sections = getSectionsForDay(slot);
      const currentSections = (activePauta.sections_json || {}) as Record<string, string>;
      const updated: Record<string, string> = { ...currentSections };

      if (activeSection) {
        const val = extract(activeSection);
        if (val) updated[activeSection] = val;
      } else {
        sections.forEach(s => {
          const val = extract(s.key);
          if (val) updated[s.key] = val;
        });
      }

      const warnings: string[] = [];
      const inputs = getRawInputs(activePauta);
      if (slot !== 'saturday' && slot !== 'sunday') {
        if (!inputs.review_rafa_id && !inputs.review_kilton_id && !updated.review_rafa?.trim() && !updated.review_kilton?.trim()) {
          warnings.push('Nenhuma resenha definida para este dia útil');
        }
      }
      const allContent = Object.values(updated).join('\n');
      const linkMatches = allContent.match(/https?:\/\/[^\s<>"]+/g) || [];

      updatePauta(activePauta.id, {
        sections_json: updated,
        status: 'generated',
        warnings_json: warnings,
        discovered_links_json: linkMatches,
        rendered_markdown: sections.map(s => `## ${s.label}\n\n${updated[s.key] || 'Não Aplicável'}`).join('\n\n'),
        rendered_text: sections.map(s => `${s.label}:\n${updated[s.key] || 'Não Aplicável'}`).join('\n\n'),
      });
    }
    if (selectedWeek) recalcWeekStatus(selectedWeek.id);
    setPromptDialogOpen(false);
    setPromptResponse('');
    toast.success('Resposta aplicada');
    logActivity('Resposta aplicada', `Pauta: ${activePauta.publication_date}`);
  };

  const finalizePauta = (id: string) => {
    const pauta = pautas.find(p => p.id === id);
    if (!pauta) return;
    const slot = getPautaSlot(pauta);
    const sections = getSectionsForDay(slot);
    const data = (pauta.sections_json || {}) as Record<string, string>;
    const warnings: string[] = [];
    const inputs = getRawInputs(pauta);

    // Weekday: require at least one review
    if (slot !== 'saturday' && slot !== 'sunday') {
      if (!inputs.review_rafa_id && !inputs.review_kilton_id && !data.review_rafa?.trim() && !data.review_kilton?.trim()) {
        warnings.push('Nenhuma resenha definida para este dia útil');
      }
    }
    // Check empty sections
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
    // Check if all pautas are finalized for week export
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
            // MD or TXT - apply to active pauta if available
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

  // Release picker for inputs
  const ReleasePicker = ({ pauta, inputKey, label }: { pauta: Pauta; inputKey: string; label: string }) => {
    const inputs = getRawInputs(pauta);
    const eligible = getEligibleReviews(releases, pauta.publication_date);
    const selectedId = inputs[inputKey];
    const selected = releases.find(r => r.id === selectedId);

    return (
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
        {eligible.length > 0 ? (
          <Select value={selectedId || ''} onValueChange={v => updateRawInput(pauta.id, inputKey, v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Selecionar release..." />
            </SelectTrigger>
            <SelectContent>
              {eligible.map(r => (
                <SelectItem key={r.id} value={r.id} className="text-xs">
                  {r.artist} – {r.album}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-[10px] text-muted-foreground italic">Nenhum release na janela D-30/D-1</p>
        )}
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
              {new Date(w.start_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              <StatusBadge status={w.status} className="ml-2 text-[10px]" />
            </Button>
          ))}
        </div>
      )}

      {selectedWeek ? (
        <>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="inputs">Insumos</TabsTrigger>
              <TabsTrigger value="content">Conteúdo</TabsTrigger>
            </TabsList>

            <TabsContent value="inputs">
              <WorkspaceShell
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

                      {/* Anniversary - all days */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Aniversário do Dia</Label>
                          <Button variant="ghost" size="icon" className="h-4 w-4" title="Buscar aniversários"
                            onClick={() => window.open('https://en.wikipedia.org/wiki/List_of_heavy_metal_festivals', '_blank')}>
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

                      {/* Weekday-specific: review pickers + news */}
                      {slot !== 'saturday' && slot !== 'sunday' && (
                        <>
                          <ReleasePicker pauta={pauta} inputKey="review_rafa_id" label="Review Rafa" />
                          <ReleasePicker pauta={pauta} inputKey="review_kilton_id" label="Review Kilton" />
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
                        </>
                      )}

                      {/* Saturday: release picker */}
                      {slot === 'saturday' && <SaturdayReleasePicker pauta={pauta} />}

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

                      {/* Editorial comments per section */}
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Direção Editorial</Label>
                        {sections.map(s => (
                          <Input
                            key={s.key}
                            className="h-7 text-[10px]"
                            placeholder={`Direção: ${s.label}`}
                            value={inputs[`comment_${s.key}`] || ''}
                            onChange={e => updateRawInput(pauta.id, `comment_${s.key}`, e.target.value)}
                          />
                        ))}
                      </div>

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
                weekLabel={`Conteúdo – Semana de ${new Date(selectedWeek.start_date + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                actions={
                  <div className="flex gap-2">
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
          <Input type="date" value={newWeekDate} onChange={e => setNewWeekDate(e.target.value)} />
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
              Protocolo de Prompt {activeSection ? `(${activeSection})` : ''}
            </DialogTitle>
            <DialogDescription>
              Copie o prompt, use no chat externo e cole a resposta com as tags {`<snakepit_response>`}.
            </DialogDescription>
          </DialogHeader>
          {activePauta && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <Badge variant="secondary">Tom: {tonePreset.split('–')[0].trim()}</Badge>
                {bannedTerms.length > 0 && <Badge variant="outline">{bannedTerms.length} termos banidos</Badge>}
                <Badge variant="outline">{activeSection ? `Seção: ${activeSection}` : 'Pauta completa'}</Badge>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">1. Prompt gerado</label>
                <div className="relative">
                  <pre className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                    {activeSection ? generatePrompt(activePauta, activeSection) : generatePrompt(activePauta)}
                  </pre>
                  <Button size="icon" variant="ghost" className="absolute top-1 right-1 h-7 w-7"
                    onClick={() => handleCopyPrompt(activeSection ? generatePrompt(activePauta, activeSection) : generatePrompt(activePauta))}>
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">2. Cole a resposta</label>
                <Textarea rows={8} placeholder="Cole aqui a resposta com as tags <snakepit_response>..." value={promptResponse} onChange={e => setPromptResponse(e.target.value)} />
              </div>
              {!activeSection && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">3. Escopo de aplicação</label>
                  <div className="flex gap-2">
                    <Button size="sm" variant={applyScope === 'all' ? 'default' : 'outline'} onClick={() => setApplyScope('all')}>
                      Todas as seções
                    </Button>
                    <Button size="sm" variant={applyScope === 'section' ? 'default' : 'outline'} onClick={() => setApplyScope('section')}>
                      Seção específica
                    </Button>
                  </div>
                  {applyScope === 'section' && (
                    <Select value={applySection} onValueChange={setApplySection}>
                      <SelectTrigger className="w-[200px]"><SelectValue placeholder="Selecione a seção" /></SelectTrigger>
                      <SelectContent>
                        {getSectionsForDay(getPautaSlot(activePauta)).map(s => (
                          <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromptDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleApplyResponse} disabled={!promptResponse}>Aplicar Resposta</Button>
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
