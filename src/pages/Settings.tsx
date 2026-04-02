import { useState } from 'react';
import { Settings as SettingsIcon, Thermometer, Ban, Activity, Plus, X, Copy, Check, Search, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApp } from '@/contexts/AppContext';
import { toast } from 'sonner';
import { buildToneProbePrompt, toneProfileForTemperature } from '@/lib/prompt-builder';

const TONE_PRESETS = [
  { label: 'Cirúrgico', value: 30, desc: 'Extremamente preciso e direto. Mínimo de adjetivos, foco em dados.' },
  { label: 'Sóbrio', value: 50, desc: 'Informativo e equilibrado. Tom jornalístico respeitoso.' },
  { label: 'Equilibrado', value: 55, desc: 'Informativo com personalidade. O padrão Heavynauta.' },
  { label: 'Quente', value: 70, desc: 'Empolgante e envolvente. Paixão pelo metal evidente.' },
  { label: 'Incendiário', value: 90, desc: 'Máximo entusiasmo e energia. Linguagem visceral e intensa.' },
];

export default function Settings() {
  const { settings, updateSettings, activityLog } = useApp();
  const [newTerm, setNewTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [logFilter, setLogFilter] = useState<string>('all');

  const bannedTerms = settings.banned_terms_text ? settings.banned_terms_text.split('\n').filter(Boolean) : [];

  const addBannedTerm = () => {
    if (!newTerm.trim() || bannedTerms.includes(newTerm.trim())) return;
    const updated = [...bannedTerms, newTerm.trim()].join('\n');
    updateSettings({ banned_terms_text: updated });
    setNewTerm('');
  };

  const removeBannedTerm = (term: string) => {
    const updated = bannedTerms.filter(t => t !== term).join('\n');
    updateSettings({ banned_terms_text: updated });
  };

  const temperature = settings.brand_tone_temperature / 100;
  const currentPreset = TONE_PRESETS.find(p => Math.abs(settings.brand_tone_temperature - p.value) < 3);

  const labPrompt = `${EDITORIAL_IDENTITY}

TOM EDITORIAL: ${currentPreset?.label || 'Custom'} (temperatura: ${temperature.toFixed(2)})
${currentPreset?.desc || ''}

Escreva um parágrafo sobre um lançamento fictício de uma banda de death metal técnico, mostrando como a temperatura editorial afeta o estilo de escrita. Demonstre o tom configurado acima.`;

  const copyLabPrompt = async () => {
    await navigator.clipboard.writeText(labPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Prompt do laboratório copiado');
  };

  // Filtered activity log
  const filteredLog = activityLog.filter(entry => {
    const matchSearch = !logSearch || entry.action.toLowerCase().includes(logSearch.toLowerCase()) || entry.details.toLowerCase().includes(logSearch.toLowerCase());
    const matchFilter = logFilter === 'all' || entry.action.toLowerCase().includes(logFilter.toLowerCase());
    return matchSearch && matchFilter;
  });

  const logActions = [...new Set(activityLog.map(e => e.action))];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-primary" />
          Configurações
        </h1>
        <p className="text-muted-foreground mt-1">Preferências da workstation</p>
      </div>

      {/* Tone Lab */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Thermometer className="h-4 w-4" /> Laboratório de Tom
          </CardTitle>
          <CardDescription>Controle da temperatura do tom Heavynauta</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Temperatura</span>
              <span className="font-mono text-muted-foreground">{temperature.toFixed(2)}</span>
            </div>
            <Slider
              value={[settings.brand_tone_temperature]}
              max={100}
              step={1}
              onValueChange={([v]) => updateSettings({ brand_tone_temperature: v })}
            />
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <span>Conservador</span>
            <span className="ml-auto">Criativo</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {TONE_PRESETS.map(preset => (
              <Button
                key={preset.label}
                variant={Math.abs(settings.brand_tone_temperature - preset.value) < 3 ? 'default' : 'outline'}
                size="sm"
                className="text-xs"
                onClick={() => updateSettings({ brand_tone_temperature: preset.value })}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          {currentPreset && (
            <p className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">{currentPreset.desc}</p>
          )}

          {/* Lab prompt preview */}
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">Preview do Prompt de Tom</label>
              <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={copyLabPrompt}>
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                Copiar
              </Button>
            </div>
            <pre className="text-[10px] bg-muted p-3 rounded-md whitespace-pre-wrap max-h-[150px] overflow-y-auto text-muted-foreground">
              {labPrompt}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Banned Terms */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Ban className="h-4 w-4" /> Termos Banidos
          </CardTitle>
          <CardDescription>Palavras e expressões proibidas nos prompts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Adicionar termo..."
              value={newTerm}
              onChange={e => setNewTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addBannedTerm()}
              className="flex-1"
            />
            <Button size="icon" onClick={addBannedTerm} disabled={!newTerm.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {bannedTerms.length > 0 ? (
            <div className="flex gap-2 flex-wrap">
              {bannedTerms.map(term => (
                <Badge key={term} variant="secondary" className="gap-1 pr-1">
                  {term}
                  <button onClick={() => removeBannedTerm(term)} className="ml-1 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum termo banido configurado.</p>
          )}
        </CardContent>
      </Card>

      {/* Export defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Padrões de Exportação</CardTitle>
          <CardDescription>Layout e container padrão para exportação</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Layout</label>
              <Select value={settings.default_export_layout} onValueChange={v => updateSettings({ default_export_layout: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="split">Split</SelectItem>
                  <SelectItem value="unified">Unificado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Container</label>
              <Select value={settings.default_export_container} onValueChange={v => updateSettings({ default_export_container: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="zip">ZIP</SelectItem>
                  <SelectItem value="flat">Flat</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Log with filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" /> Log de Atividade
          </CardTitle>
          <CardDescription>Histórico de ações do sistema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar no log..." className="pl-8 h-8 text-xs" value={logSearch} onChange={e => setLogSearch(e.target.value)} />
            </div>
            <Select value={logFilter} onValueChange={setLogFilter}>
              <SelectTrigger className="w-[150px] h-8 text-xs">
                <Filter className="h-3 w-3 mr-1" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                {logActions.map(a => <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {filteredLog.length > 0 ? (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {filteredLog.map(entry => (
                  <div key={entry.id} className="flex items-start gap-3 p-2 rounded-md bg-muted/30 text-xs">
                    <span className="text-muted-foreground/50 font-mono shrink-0 mt-0.5">
                      {new Date(entry.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div>
                      <span className="font-medium">{entry.action}</span>
                      <span className="text-muted-foreground ml-1.5">{entry.details}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma atividade encontrada.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
