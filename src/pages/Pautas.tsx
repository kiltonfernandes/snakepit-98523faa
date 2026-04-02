import { useState } from 'react';
import { FileText, Plus, Copy, Check, Sparkles, Download, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { StatusBadge } from '@/components/StatusBadge';
import { useApp } from '@/contexts/AppContext';
import { getSectionsForDay, DAY_SLOTS } from '@/lib/constants';
import { Pauta, PautaSections, DaySlot } from '@/lib/types';

const EDITORIAL_IDENTITY = `Você é o editor-chefe do Heavynauta, podcast diário de heavy metal que combina informação profunda com linguagem acessível. Mantenha a identidade: referências a subgêneros (death, black, doom, thrash, power), precisão factual, tom firme mas acolhedor para a comunidade metal brasileira. Use "Papo Sério Sobre Música Pesada" como tagline quando apropriado.`;

function getPautaSlot(pauta: Pauta): DaySlot {
  const d = new Date(pauta.publication_date + 'T12:00:00');
  const wd = d.getDay();
  const slotMap: Record<number, DaySlot> = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };
  return slotMap[wd] || 'monday';
}

export default function Pautas() {
  const { weeks, addWeek, pautas, updatePauta, getPautasForWeek, settings } = useApp();
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [newWeekDate, setNewWeekDate] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [activePauta, setActivePauta] = useState<Pauta | null>(null);
  const [promptResponse, setPromptResponse] = useState('');
  const [applyScope, setApplyScope] = useState<'all' | 'section'>('all');
  const [applySection, setApplySection] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [exportFormat, setExportFormat] = useState<'txt' | 'md' | 'json' | 'clipboard'>('clipboard');

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
    const week = addWeek(newWeekDate);
    setSelectedWeekId(week.id);
    setCreateDialogOpen(false);
    setNewWeekDate('');
  };

  const handleSectionChange = (pautaId: string, key: keyof PautaSections, value: string) => {
    const pauta = pautas.find(p => p.id === pautaId);
    if (!pauta) return;
    const currentSections = (pauta.sections_json || {}) as Partial<PautaSections>;
    updatePauta(pautaId, { sections_json: { ...currentSections, [key]: value } });
  };

  const generatePrompt = (pauta: Pauta) => {
    const slot = getPautaSlot(pauta);
    const sections = getSectionsForDay(slot);
    const sectionList = sections.map(s => `- ${s.label} (tag: <${s.key}>)`).join('\n');
    const bannedStr = bannedTerms.length > 0 ? `\n\nTERMOS PROIBIDOS (nunca use estas palavras/expressões):\n${bannedTerms.map(t => `- ${t}`).join('\n')}` : '';

    return `${EDITORIAL_IDENTITY}

TOM: ${tonePreset} (temperatura: ${settings.brand_tone_temperature}/100)
${bannedStr}

---

Gere a pauta do episódio do dia ${pauta.publication_date} (${slot}) com as seguintes seções:
${sectionList}

Formato de resposta OBRIGATÓRIO (use exatamente estas tags):
<snakepit_response>
${sections.map(s => `<${s.key}>
[conteúdo da seção ${s.label}]
</${s.key}>`).join('\n')}
</snakepit_response>

IMPORTANTE: A intro e outro são geradas automaticamente pelo app. Foque APENAS nas seções listadas acima.`;
  };

  const handleCopyPrompt = async (pauta: Pauta) => {
    await navigator.clipboard.writeText(generatePrompt(pauta));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyResponse = () => {
    if (!activePauta || !promptResponse) return;
    const extract = (tag: string) => {
      const match = promptResponse.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
      return match?.[1]?.trim() || '';
    };
    const slot = getPautaSlot(activePauta);
    const sections = getSectionsForDay(slot);
    const currentSections = (activePauta.sections_json || {}) as Record<string, string>;
    const updated: Record<string, string> = { ...currentSections };

    if (applyScope === 'section' && applySection) {
      const val = extract(applySection);
      if (val) updated[applySection] = val;
    } else {
      sections.forEach(s => {
        const val = extract(s.key);
        if (val) updated[s.key] = val;
      });
    }

    updatePauta(activePauta.id, { sections_json: updated, status: 'generated' });
    setPromptDialogOpen(false);
    setPromptResponse('');
  };

  const finalizePauta = (id: string) => updatePauta(id, { status: 'finalized', finalized_at: new Date().toISOString() });

  const trafficLight = (pauta: Pauta) => {
    const sections = getSectionsForDay(getPautaSlot(pauta));
    const data = (pauta.sections_json || {}) as Record<string, string>;
    const filled = sections.filter(s => data[s.key]?.trim()).length;
    const ratio = filled / sections.length;
    if (pauta.status === 'finalized') return 'bg-emerald-500';
    if (ratio >= 0.5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const handleExport = () => {
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
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setExportDialogOpen(true)}>
              <Download className="h-3.5 w-3.5" /> Exportar
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
        <WorkspaceShell
          weekLabel={`Semana de ${new Date(selectedWeek.start_date + 'T12:00:00').toLocaleDateString('pt-BR')}`}
          actions={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => {
                weekPautas.forEach(p => {
                  if (p.status === 'draft') {
                    setActivePauta(p);
                    setPromptDialogOpen(true);
                  }
                });
              }}>
                <Sparkles className="h-3.5 w-3.5 mr-1" /> Gerar Prompts
              </Button>
            </div>
          }
          renderDay={(day) => {
            const pauta = weekPautas.find(p => getPautaSlot(p) === day.key);
            if (!pauta) return <p className="text-xs text-muted-foreground italic">Sem pauta</p>;
            const sections = getSectionsForDay(day.key);
            const sectionsData = (pauta.sections_json || {}) as Record<string, string>;
            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${trafficLight(pauta)}`} />
                    <StatusBadge status={pauta.status} />
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" title="Gerar prompt" onClick={() => { setActivePauta(pauta); setPromptDialogOpen(true); }}>
                      <Sparkles className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" title="Copiar prompt" onClick={() => handleCopyPrompt(pauta)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    {pauta.status !== 'finalized' && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" title="Finalizar" onClick={() => finalizePauta(pauta.id)}>
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                {sections.map(sec => (
                  <div key={sec.key} className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{sec.label}</label>
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
            <DialogDescription>Selecione a segunda-feira de início da semana.</DialogDescription>
          </DialogHeader>
          <Input type="date" value={newWeekDate} onChange={e => setNewWeekDate(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateWeek} disabled={!newWeekDate}>Criar Semana</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prompt Protocol Dialog */}
      <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Protocolo de Prompt</DialogTitle>
            <DialogDescription>
              Copie o prompt, use no chat externo e cole a resposta com as tags {`<snakepit_response>`}.
            </DialogDescription>
          </DialogHeader>
          {activePauta && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="secondary">Tom: {tonePreset.split('–')[0].trim()}</Badge>
                {bannedTerms.length > 0 && <Badge variant="outline">{bannedTerms.length} termos banidos</Badge>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">1. Prompt gerado</label>
                <div className="relative">
                  <pre className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap max-h-[200px] overflow-y-auto">{generatePrompt(activePauta)}</pre>
                  <Button size="icon" variant="ghost" className="absolute top-1 right-1 h-7 w-7" onClick={() => handleCopyPrompt(activePauta)}>
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">2. Cole a resposta</label>
                <Textarea rows={8} placeholder="Cole aqui a resposta com as tags <snakepit_response>..." value={promptResponse} onChange={e => setPromptResponse(e.target.value)} />
              </div>
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
