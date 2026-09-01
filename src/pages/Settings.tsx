import { useEffect, useMemo, useState } from 'react';
import { Activity, Ban, Check, FileCode2, Settings as SettingsIcon, Thermometer } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApp } from '@/contexts/AppContext';
import { toast } from 'sonner';

const PROMPTS = [
  { key: 'album_research_v1', title: 'Pesquisa do álbum', provider: 'Perplexity Sonar', description: 'Diretrizes extras para a coleta factual e desambiguação do release.', trigger: 'Quando um dos três próximos álbuns entra na fila de produção.' },
  { key: 'review_complete_v1', title: 'Resenha completa', provider: 'DeepSeek V4 Pro · GPT-OSS fallback', description: 'Diretrizes extras para pauta, auditoria interna, descrição e três títulos.', trigger: 'Depois que a pesquisa factual está disponível.' },
  { key: 'rivaldo_treatment_v1', title: 'Tratamento de áudio Rivaldo', provider: 'DeepSeek V4 Pro', description: 'Diretrizes extras para o planejador técnico de voz.', trigger: 'Quando o Rivaldo analisa o áudio raw selecionado.' },
] as const;

type PromptKey = typeof PROMPTS[number]['key'];
type PromptOverrides = Partial<Record<PromptKey, string>>;

const TONE_PRESETS = [
  { label: 'Cirúrgico', value: 30 }, { label: 'Sóbrio', value: 50 }, { label: 'Equilibrado', value: 55 }, { label: 'Quente', value: 70 }, { label: 'Incendiário', value: 90 },
];

function permittedOverrides(value: Record<string, string> | null | undefined): PromptOverrides {
  return Object.fromEntries(PROMPTS.flatMap(({ key }) => typeof value?.[key] === 'string' && value[key].trim() ? [[key, value[key]] as const] : [])) as PromptOverrides;
}

export default function Settings() {
  const { settings, updateSettings, activityLog } = useApp();
  const [activeTab, setActiveTab] = useState('prompts');
  const [overrides, setOverrides] = useState<PromptOverrides>(() => permittedOverrides(settings.prompt_overrides_json));
  const [newTerm, setNewTerm] = useState('');

  useEffect(() => setOverrides(permittedOverrides(settings.prompt_overrides_json)), [settings.prompt_overrides_json]);
  const bannedTerms = useMemo(() => settings.banned_terms_text.split('\n').map((term) => term.trim()).filter(Boolean), [settings.banned_terms_text]);

  const savePrompts = () => {
    updateSettings({ prompt_overrides_json: overrides as Record<string, string> });
    toast.success('Prompts editoriais salvos');
  };
  const addBannedTerm = () => {
    const term = newTerm.trim();
    if (!term || bannedTerms.includes(term)) return;
    updateSettings({ banned_terms_text: [...bannedTerms, term].join('\n') });
    setNewTerm('');
  };
  const removeBannedTerm = (term: string) => updateSettings({ banned_terms_text: bannedTerms.filter((item) => item !== term).join('\n') });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><SettingsIcon className="h-6 w-6 text-primary" /> Configurações</h1>
        <p className="mt-1 text-muted-foreground">Controle editorial da produção automática.</p>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="prompts" className="gap-1.5 text-xs"><FileCode2 className="h-3.5 w-3.5" /> Prompts</TabsTrigger>
          <TabsTrigger value="tone" className="gap-1.5 text-xs"><Thermometer className="h-3.5 w-3.5" /> Tom</TabsTrigger>
          <TabsTrigger value="banned" className="gap-1.5 text-xs"><Ban className="h-3.5 w-3.5" /> Termos banidos</TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5 text-xs"><Activity className="h-3.5 w-3.5" /> Atividade</TabsTrigger>
        </TabsList>

        <TabsContent value="prompts" className="space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Os três prompts ativos</CardTitle><CardDescription>O contrato técnico, formato JSON e proteções factuais são fixos. Edite somente diretrizes extras: elas entram no prompt correspondente sem criar chamadas adicionais.</CardDescription></CardHeader></Card>
          {PROMPTS.map((prompt) => (
            <Card key={prompt.key}>
              <CardHeader className="pb-3"><div className="flex flex-wrap items-center gap-2"><CardTitle className="text-sm">{prompt.title}</CardTitle><Badge variant="secondary" className="font-mono text-[10px]">{prompt.key}</Badge><Badge variant="outline" className="text-[10px]">{prompt.provider}</Badge></div><CardDescription>{prompt.description}<br />{prompt.trigger}</CardDescription></CardHeader>
              <CardContent className="space-y-2"><Label htmlFor={prompt.key} className="text-xs">Diretrizes extras</Label><Textarea id={prompt.key} rows={7} className="font-mono text-xs" placeholder="Ex.: prefira comparações com a fase clássica da banda, mas só quando o dossiê trouxer evidência." value={overrides[prompt.key] || ''} onChange={(event) => setOverrides((current) => ({ ...current, [prompt.key]: event.target.value }))} /><div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => setOverrides((current) => { const next = { ...current }; delete next[prompt.key]; return next; })}>Restaurar padrão</Button></div></CardContent>
            </Card>
          ))}
          <div className="flex justify-end"><Button onClick={savePrompts} className="gap-2"><Check className="h-4 w-4" /> Salvar prompts</Button></div>
        </TabsContent>

        <TabsContent value="tone"><Card><CardHeader><CardTitle className="text-base">Tom editorial</CardTitle><CardDescription>Afeta a resenha completa. A pesquisa continua factual e conservadora.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="space-y-2"><div className="flex justify-between text-xs text-muted-foreground"><span>Temperatura</span><span className="font-mono">{(settings.brand_tone_temperature / 100).toFixed(2)}</span></div><Slider value={[settings.brand_tone_temperature]} max={100} step={1} onValueChange={([value]) => updateSettings({ brand_tone_temperature: value })} /></div><div className="flex flex-wrap gap-2">{TONE_PRESETS.map((preset) => <Button key={preset.label} variant={settings.brand_tone_temperature === preset.value ? 'default' : 'outline'} size="sm" onClick={() => updateSettings({ brand_tone_temperature: preset.value })}>{preset.label}</Button>)}</div></CardContent></Card></TabsContent>

        <TabsContent value="banned"><Card><CardHeader><CardTitle className="text-base">Termos banidos</CardTitle><CardDescription>Aplicados na resenha completa antes da resposta ser aceita.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex gap-2"><Input value={newTerm} onChange={(event) => setNewTerm(event.target.value)} placeholder="Adicionar termo ou expressão" onKeyDown={(event) => event.key === 'Enter' && addBannedTerm()} /><Button onClick={addBannedTerm}>Adicionar</Button></div><div className="flex flex-wrap gap-2">{bannedTerms.length ? bannedTerms.map((term) => <Badge key={term} variant="secondary" className="gap-2 py-1.5">{term}<button type="button" aria-label={`Remover ${term}`} onClick={() => removeBannedTerm(term)}>×</button></Badge>) : <span className="text-sm text-muted-foreground">Nenhum termo banido.</span>}</div></CardContent></Card></TabsContent>

        <TabsContent value="logs"><Card><CardHeader><CardTitle className="text-base">Atividade recente</CardTitle><CardDescription>Últimos eventos registrados pela plataforma.</CardDescription></CardHeader><CardContent className="space-y-2">{activityLog.slice(0, 30).map((entry) => <div key={entry.id} className="flex flex-col gap-1 rounded-md border border-border/60 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span>{entry.action}: {entry.details}</span><span className="text-xs text-muted-foreground">{new Date(entry.timestamp).toLocaleString('pt-BR')}</span></div>)}{!activityLog.length && <p className="text-sm text-muted-foreground">Ainda não há atividade registrada.</p>}</CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}
