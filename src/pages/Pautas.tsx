import { useState } from 'react';
import { FileText, Plus, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { StatusBadge } from '@/components/StatusBadge';
import { useApp } from '@/contexts/AppContext';
import { getSectionsForDay } from '@/lib/constants';
import { Pauta, PautaSections, DaySlot } from '@/lib/types';
import { DAY_SLOTS } from '@/lib/constants';

export default function Pautas() {
  const { weeks, addWeek, pautas, updatePauta, getPautasForWeek } = useApp();
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [newWeekDate, setNewWeekDate] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [activePauta, setActivePauta] = useState<Pauta | null>(null);
  const [promptResponse, setPromptResponse] = useState('');
  const [copied, setCopied] = useState(false);

  const selectedWeek = weeks.find(w => w.id === selectedWeekId) || weeks[0];
  const weekPautas = selectedWeek ? getPautasForWeek(selectedWeek.id) : [];

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

  const getPautaSlot = (pauta: Pauta): DaySlot | null => {
    const dayIdx = DAY_SLOTS.findIndex(s => {
      const mat = weekPautas.find(p => p.id === pauta.id);
      return mat;
    });
    // Derive from publication_date weekday
    const d = new Date(pauta.publication_date + 'T12:00:00');
    const wd = d.getDay();
    const slotMap: Record<number, DaySlot> = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };
    return slotMap[wd] || null;
  };

  const generatePrompt = (pauta: Pauta) => {
    const slot = getPautaSlot(pauta);
    const sections = getSectionsForDay(slot || 'monday');
    const sectionList = sections.map(s => `- ${s.label}`).join('\n');
    return `Gere a pauta do episódio de ${slot || pauta.publication_date} com as seguintes seções:\n${sectionList}\n\nFormato de resposta usando tags:\n${sections.map(s => `<${s.key}>...</${s.key}>`).join('\n')}`;
  };

  const handleCopyPrompt = async (pauta: Pauta) => {
    await navigator.clipboard.writeText(generatePrompt(pauta));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyResponse = () => {
    if (!activePauta || !promptResponse) return;
    const extract = (tag: string) => {
      const match = promptResponse.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 's'));
      return match?.[1]?.trim() || '';
    };
    const slot = getPautaSlot(activePauta);
    const sections = getSectionsForDay(slot || 'monday');
    const currentSections = (activePauta.sections_json || {}) as Record<string, string>;
    const updated: Record<string, string> = { ...currentSections };
    sections.forEach(s => {
      const val = extract(s.key);
      if (val) updated[s.key] = val;
    });
    updatePauta(activePauta.id, { sections_json: updated, status: 'generated' });
    setPromptDialogOpen(false);
    setPromptResponse('');
  };

  const finalizePauta = (id: string) => updatePauta(id, { status: 'finalized', finalized_at: new Date().toISOString() });

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
        <Button size="sm" className="gap-2" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4" /> Nova Semana
        </Button>
      </div>

      {weeks.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {weeks.map(w => (
            <Button key={w.id} variant={selectedWeek?.id === w.id ? 'default' : 'outline'} size="sm" onClick={() => setSelectedWeekId(w.id)}>
              {new Date(w.start_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              <StatusBadge status={w.status} className="ml-2 text-[10px]" />
            </Button>
          ))}
        </div>
      )}

      {selectedWeek ? (
        <WorkspaceShell
          weekLabel={`Semana de ${new Date(selectedWeek.start_date).toLocaleDateString('pt-BR')}`}
          actions={
            <Button size="sm" variant="outline" onClick={() => {
              const p = weekPautas.find(p => p.status === 'draft');
              if (p) { setActivePauta(p); setPromptDialogOpen(true); }
            }}>
              Gerar Prompts
            </Button>
          }
          renderDay={(day) => {
            const pauta = weekPautas.find(p => {
              const slot = getPautaSlot(p);
              return slot === day.key;
            });
            if (!pauta) return <p className="text-xs text-muted-foreground italic">Sem pauta</p>;
            const sections = getSectionsForDay(day.key);
            const sectionsData = (pauta.sections_json || {}) as Record<string, string>;
            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <StatusBadge status={pauta.status} />
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setActivePauta(pauta); setPromptDialogOpen(true); }}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    {pauta.status !== 'finalized' && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => finalizePauta(pauta.id)}>
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

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Semana Editorial</DialogTitle>
            <DialogDescription>Selecione a data de início da semana.</DialogDescription>
          </DialogHeader>
          <Input type="date" value={newWeekDate} onChange={e => setNewWeekDate(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateWeek} disabled={!newWeekDate}>Criar Semana</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Protocolo de Prompt</DialogTitle>
            <DialogDescription>Copie o prompt, use no chat externo e cole a resposta abaixo.</DialogDescription>
          </DialogHeader>
          {activePauta && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">1. Prompt gerado</label>
                <div className="relative">
                  <pre className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap">{generatePrompt(activePauta)}</pre>
                  <Button size="icon" variant="ghost" className="absolute top-1 right-1 h-7 w-7" onClick={() => handleCopyPrompt(activePauta)}>
                    {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">2. Cole a resposta com tags</label>
                <Textarea rows={8} placeholder="Cole aqui a resposta do chat com as tags..." value={promptResponse} onChange={e => setPromptResponse(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromptDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleApplyResponse} disabled={!promptResponse}>Aplicar Resposta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
