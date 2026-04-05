import { useState, useEffect, useCallback } from 'react';
import { Settings as SettingsIcon, Thermometer, Ban, Activity, Plus, X, Copy, Check, Search, Filter, FileCode, FileText, Download, Trash2, Cpu, Music, LayoutTemplate, Save, ToggleLeft, ToggleRight, Edit, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { buildToneProbePrompt, toneProfileForTemperature } from '@/lib/prompt-builder';
import { PromptManager } from '@/components/PromptManager';
import { PROMPT_BLOCKS } from '@/lib/prompt-defaults';
import { PautaTemplate, PautaTemplateSectionConfig } from '@/lib/types';
import { Switch } from '@/components/ui/switch';
import { motion } from 'framer-motion';

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
  const [promptManagerOpen, setPromptManagerOpen] = useState(false);
  const [descTemplateOpen, setDescTemplateOpen] = useState(false);
  const [descTemplateValue, setDescTemplateValue] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [aiUsage, setAiUsage] = useState<{ scope: string; tokens_input: number; tokens_output: number; estimated_cost: number; created_at: string; episode_date: string | null; week_id: string | null }[]>([]);
  const [aiUsageLoading, setAiUsageLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('tone');

  // Templates state
  const [templates, setTemplates] = useState<PautaTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PautaTemplate | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  const SECTION_OPTIONS: { key: string; label: string }[] = [
    { key: 'anniversary', label: 'Aniversário' },
    { key: 'review', label: 'Review' },
    { key: 'news', label: 'Notícias' },
    { key: 'releases', label: 'Lançamentos' },
    { key: 'interview', label: 'Entrevista' },
    { key: 'list', label: 'Lista' },
  ];

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    const { data } = await supabase.from('pauta_templates' as any).select('*').order('created_at', { ascending: true });
    setTemplates((data as any[] || []).map((t: any) => ({
      ...t,
      description: t.description || '',
      sections_config: (typeof t.sections_config === 'string' ? JSON.parse(t.sections_config) : t.sections_config) || [],
      segway_intro: t.segway_intro || '',
      segway_outro: t.segway_outro || '',
    })));
    setTemplatesLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'templates') loadTemplates();
  }, [activeTab, loadTemplates]);

  const openNewTemplate = () => {
    setEditingTemplate({
      id: `tpl_${Date.now()}`,
      name: '',
      description: '',
      sections_config: SECTION_OPTIONS.map(s => ({ key: s.key, label: s.label, enabled: false, core_prompt: '' })),
      segway_intro: '',
      segway_outro: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setTemplateDialogOpen(true);
  };

  const openEditTemplate = (t: PautaTemplate) => {
    // Ensure all section options exist
    const existing = new Set(t.sections_config.map(s => s.key));
    const merged = [...t.sections_config];
    SECTION_OPTIONS.forEach(opt => {
      if (!existing.has(opt.key)) merged.push({ key: opt.key, label: opt.label, enabled: false, core_prompt: '' });
    });
    setEditingTemplate({ ...t, sections_config: merged });
    setTemplateDialogOpen(true);
  };

  const saveTemplate = async () => {
    if (!editingTemplate || !editingTemplate.name.trim()) {
      toast.error('Nome do template é obrigatório');
      return;
    }
    const payload = {
      id: editingTemplate.id,
      name: editingTemplate.name,
      description: editingTemplate.description,
      sections_config: JSON.stringify(editingTemplate.sections_config),
      segway_intro: editingTemplate.segway_intro,
      segway_outro: editingTemplate.segway_outro,
      updated_at: new Date().toISOString(),
    };
    const exists = templates.some(t => t.id === editingTemplate.id);
    if (exists) {
      await supabase.from('pauta_templates' as any).update(payload as any).eq('id', editingTemplate.id);
    } else {
      await supabase.from('pauta_templates' as any).insert({ ...payload, created_at: new Date().toISOString() } as any);
    }
    toast.success('Template salvo');
    setTemplateDialogOpen(false);
    loadTemplates();
  };

  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);

  const confirmDeleteTemplate = async () => {
    if (!deleteTemplateId) return;
    await supabase.from('pauta_templates' as any).delete().eq('id', deleteTemplateId);
    toast.success('Template removido');
    setDeleteTemplateId(null);
    loadTemplates();
  };

  useEffect(() => {
    if (activeTab !== 'tokens') return;
    setAiUsageLoading(true);
    supabase.from('ai_usage_logs' as any).select('*').order('created_at', { ascending: false }).limit(500)
      .then(({ data }) => { setAiUsage((data as any[]) || []); setAiUsageLoading(false); })
      .then(undefined, () => setAiUsageLoading(false));
  }, [activeTab]);

  const totalTokensIn = aiUsage.reduce((s, r) => s + (r.tokens_input || 0), 0);
  const totalTokensOut = aiUsage.reduce((s, r) => s + (r.tokens_output || 0), 0);
  const totalCost = aiUsage.reduce((s, r) => s + (r.estimated_cost || 0), 0);
  const usageByScope = aiUsage.reduce((acc, r) => {
    if (!acc[r.scope]) acc[r.scope] = { input: 0, output: 0, cost: 0, count: 0 };
    acc[r.scope].input += r.tokens_input || 0;
    acc[r.scope].output += r.tokens_output || 0;
    acc[r.scope].cost += r.estimated_cost || 0;
    acc[r.scope].count += 1;
    return acc;
  }, {} as Record<string, { input: number; output: number; cost: number; count: number }>);

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

  const labPrompt = buildToneProbePrompt(settings);

  const copyLabPrompt = async () => {
    await navigator.clipboard.writeText(labPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Prompt do laboratório copiado');
  };

  const filteredLog = activityLog.filter(entry => {
    const matchSearch = !logSearch || entry.action.toLowerCase().includes(logSearch.toLowerCase()) || entry.details.toLowerCase().includes(logSearch.toLowerCase());
    const matchFilter = logFilter === 'all' || entry.action.toLowerCase().includes(logFilter.toLowerCase());
    return matchSearch && matchFilter;
  });

  const logActions = [...new Set(activityLog.map(e => e.action))];

  const overridesCount = Object.keys(settings.prompt_overrides_json || {}).length;

  const exportLogCsv = () => {
    const header = 'Data,Ação,Detalhes';
    const rows = filteredLog.map(entry => {
      const date = new Date(entry.timestamp).toLocaleString('pt-BR');
      const action = entry.action.replace(/"/g, '""');
      const details = entry.details.replace(/"/g, '""');
      return `"${date}","${action}","${details}"`;
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filteredLog.length} registros exportados`);
  };

  const deleteAllLogs = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('activity_logs' as any).delete().neq('id', '');
      if (error) {
        toast.error(`Erro ao limpar logs: ${error.message}`);
      } else {
        toast.success('Todos os logs foram removidos');
        window.location.reload();
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao limpar logs');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-primary" />
          Configurações
        </h1>
        <p className="text-muted-foreground mt-1">Preferências da workstation</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="tone" className="gap-1.5 text-xs"><Thermometer className="h-3.5 w-3.5" /> Tom & Prompts</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5 text-xs"><LayoutTemplate className="h-3.5 w-3.5" /> Templates</TabsTrigger>
          <TabsTrigger value="banned" className="gap-1.5 text-xs"><Ban className="h-3.5 w-3.5" /> Termos Banidos</TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5 text-xs"><Activity className="h-3.5 w-3.5" /> Logs</TabsTrigger>
          <TabsTrigger value="tokens" className="gap-1.5 text-xs"><Cpu className="h-3.5 w-3.5" /> IA & Tokens</TabsTrigger>
          <TabsTrigger value="audio" className="gap-1.5 text-xs"><Music className="h-3.5 w-3.5" /> Áudio</TabsTrigger>
        </TabsList>

        {/* TAB: Tom & Prompts */}
        <TabsContent value="tone">
          <motion.div className="grid grid-cols-1 lg:grid-cols-2 gap-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <div className="space-y-6">
              {/* Prompt Manager */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileCode className="h-4 w-4" /> System Prompts
                  </CardTitle>
                  <CardDescription>Gerencie todos os prompts do sistema</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{PROMPT_BLOCKS.length} blocos</span>
                      {overridesCount > 0 && (
                        <Badge variant="secondary" className="text-xs">{overridesCount} customizado{overridesCount > 1 ? 's' : ''}</Badge>
                      )}
                    </div>
                    <Button size="sm" className="gap-2" onClick={() => setPromptManagerOpen(true)}>
                      <FileCode className="h-3.5 w-3.5" /> Gerenciar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Description Template */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Descrição Fixa
                  </CardTitle>
                  <CardDescription>Template HTML base para descrições de episódios</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {settings.description_template_html ? `${settings.description_template_html.length} chars` : 'Não configurado'}
                    </span>
                    <Button size="sm" className="gap-2" onClick={() => {
                      setDescTemplateValue(settings.description_template_html || '');
                      setDescTemplateOpen(true);
                    }}>
                      <FileText className="h-3.5 w-3.5" /> Editar
                    </Button>
                  </div>
                </CardContent>
              </Card>
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

                <div className="space-y-2 border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium">Preview do Prompt</label>
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
          </motion.div>
        </TabsContent>

        {/* TAB: Templates de Pauta */}
        <TabsContent value="templates">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <LayoutTemplate className="h-4 w-4" /> Templates de Pauta
                    </CardTitle>
                    <CardDescription>Defina templates reutilizáveis com seções e prompts customizados</CardDescription>
                  </div>
                  <Button size="sm" className="gap-2" onClick={openNewTemplate}>
                    <Plus className="h-3.5 w-3.5" /> Novo Template
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {templatesLoading ? (
                  <div className="text-center py-8 text-muted-foreground text-sm flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                  </div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Nenhum template criado. Crie o primeiro!
                  </div>
                ) : (
                  <div className="space-y-3">
                    {templates.map(t => {
                      const enabledSections = (t.sections_config || []).filter((s: any) => s.enabled);
                      return (
                        <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-sm">{t.name}</h4>
                              <Badge variant="secondary" className="text-[9px]">{enabledSections.length} seções</Badge>
                            </div>
                            {t.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}</p>}
                            <div className="flex gap-1 mt-1.5 flex-wrap">
                              {enabledSections.map((s: PautaTemplateSectionConfig) => (
                                <Badge key={s.key} variant="outline" className="text-[8px] h-[18px]">{s.label}</Badge>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 ml-3">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTemplate(t)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteTemplate(t.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* TAB: Termos Banidos */}
        <TabsContent value="banned">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
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
          </motion.div>
        </TabsContent>

        {/* TAB: Logs */}
        <TabsContent value="logs">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="h-4 w-4" /> Log de Atividade
                    </CardTitle>
                    <CardDescription>Histórico de ações do sistema</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={exportLogCsv} disabled={filteredLog.length === 0}>
                      <Download className="h-3 w-3" /> CSV
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1 text-xs h-7 text-destructive hover:text-destructive" disabled={activityLog.length === 0}>
                          <Trash2 className="h-3 w-3" /> Limpar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Limpar todos os logs?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Essa ação é irreversível. Todos os {activityLog.length} registros serão removidos.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={deleteAllLogs} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            {isDeleting ? 'Limpando...' : 'Sim, limpar tudo'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
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
                  <ScrollArea className="h-[500px]">
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
          </motion.div>
        </TabsContent>

        {/* TAB: IA & Tokens */}
        <TabsContent value="tokens">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Cpu className="h-4 w-4" /> Dashboard de Tokens
                </CardTitle>
                <CardDescription>Consumo estimado de tokens e custos por tipo de geração</CardDescription>
              </CardHeader>
              <CardContent>
                {aiUsageLoading ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
                ) : aiUsage.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Nenhum uso registrado ainda.</div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-muted/30 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold font-mono">{(totalTokensIn + totalTokensOut).toLocaleString()}</div>
                        <div className="text-[10px] text-muted-foreground">Tokens totais</div>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold font-mono">{aiUsage.length}</div>
                        <div className="text-[10px] text-muted-foreground">Chamadas</div>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold font-mono text-primary">${totalCost.toFixed(4)}</div>
                        <div className="text-[10px] text-muted-foreground">Custo estimado</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xs font-medium">Por tipo</h4>
                      {Object.entries(usageByScope).map(([scope, data]) => (
                        <div key={scope} className="flex items-center justify-between bg-muted/20 rounded px-3 py-2 text-xs">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px]">{scope}</Badge>
                            <span className="text-muted-foreground">{data.count} chamadas</span>
                          </div>
                          <div className="flex items-center gap-4 font-mono">
                            <span>{(data.input + data.output).toLocaleString()} tok</span>
                            <span className="text-primary">${data.cost.toFixed(4)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xs font-medium">Últimas chamadas</h4>
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-1">
                          {aiUsage.slice(0, 50).map((r, i) => (
                            <div key={i} className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-muted/10">
                              <span className="text-muted-foreground font-mono">{new Date(r.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                              <Badge variant="outline" className="text-[9px] h-4">{r.scope}</Badge>
                              <span className="font-mono">{(r.tokens_input + r.tokens_output).toLocaleString()}</span>
                              <span className="font-mono text-primary">${r.estimated_cost.toFixed(5)}</span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* TAB: Áudio */}
        <TabsContent value="audio">
          <motion.div className="grid grid-cols-1 lg:grid-cols-2 gap-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Music className="h-4 w-4" /> Padrões de Exportação
                </CardTitle>
                <CardDescription>Layout, container e qualidade de áudio</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Informações</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  A qualidade de exportação (bitrate) pode ser ajustada diretamente no sidebar do Rivaldo durante o processamento.
                  Opções disponíveis: 128, 192, 256 e 320 kbps.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>

      <PromptManager
        open={promptManagerOpen}
        onOpenChange={setPromptManagerOpen}
        overrides={settings.prompt_overrides_json || {}}
        onSave={(overrides) => {
          updateSettings({ prompt_overrides_json: overrides });
          setPromptManagerOpen(false);
        }}
      />

      <Dialog open={descTemplateOpen} onOpenChange={setDescTemplateOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Template de Descrição Fixa</DialogTitle>
            <DialogDescription>
              Cole aqui o HTML base para as descrições dos episódios.<br />
              Use <code className="bg-muted px-1 rounded text-xs">{'<<<title>>>'}</code> onde o título deve aparecer.<br />
              Use <code className="bg-muted px-1 rounded text-xs">{'<<<generated content>>>'}</code> para o conteúdo gerado por IA.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            className="min-h-[300px] font-mono text-xs"
            placeholder="<p><b><<<title>>></b></p>\n<p><<<generated content>>></p>\n<p>Ouça no Spotify...</p>"
            value={descTemplateValue}
            onChange={e => setDescTemplateValue(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDescTemplateOpen(false)}>Cancelar</Button>
            <Button onClick={() => {
              updateSettings({ description_template_html: descTemplateValue });
              setDescTemplateOpen(false);
              toast.success('Template de descrição salvo');
            }}>Salvar Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template editor dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate && templates.some(t => t.id === editingTemplate.id) ? 'Editar Template' : 'Novo Template'}</DialogTitle>
            <DialogDescription>Configure nome, seções ativas e core prompts do template.</DialogDescription>
          </DialogHeader>
          {editingTemplate && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome</Label>
                  <Input value={editingTemplate.name} onChange={e => setEditingTemplate(prev => prev ? { ...prev, name: e.target.value } : prev)} placeholder="Ex: Notícias, Entrevista, Lista..." />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Descrição</Label>
                  <Input value={editingTemplate.description} onChange={e => setEditingTemplate(prev => prev ? { ...prev, description: e.target.value } : prev)} placeholder="Breve descrição..." />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Segway Intro</Label>
                  <Textarea value={editingTemplate.segway_intro} onChange={e => setEditingTemplate(prev => prev ? { ...prev, segway_intro: e.target.value } : prev)} placeholder="Texto de abertura do episódio..." rows={2} className="text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Segway Outro</Label>
                  <Textarea value={editingTemplate.segway_outro} onChange={e => setEditingTemplate(prev => prev ? { ...prev, segway_outro: e.target.value } : prev)} placeholder="Texto de fechamento do episódio..." rows={2} className="text-xs" />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-medium">Seções</Label>
                {editingTemplate.sections_config.map((sec, idx) => (
                  <div key={sec.key} className={`rounded-lg border p-3 space-y-2 transition-colors ${sec.enabled ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/10'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Switch checked={sec.enabled} onCheckedChange={(checked) => {
                          setEditingTemplate(prev => {
                            if (!prev) return prev;
                            const next = [...prev.sections_config];
                            next[idx] = { ...next[idx], enabled: checked };
                            return { ...prev, sections_config: next };
                          });
                        }} />
                        <span className={`text-sm font-medium ${sec.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>{sec.label}</span>
                        <Badge variant="outline" className="text-[9px]">{sec.key}</Badge>
                      </div>
                    </div>
                    {sec.enabled && (
                      <div className="space-y-1 pl-12">
                        <Label className="text-[10px] text-muted-foreground">Core Prompt (instrução específica para esta seção)</Label>
                        <Textarea
                          value={sec.core_prompt}
                          onChange={e => {
                            setEditingTemplate(prev => {
                              if (!prev) return prev;
                              const next = [...prev.sections_config];
                              next[idx] = { ...next[idx], core_prompt: e.target.value };
                              return { ...prev, sections_config: next };
                            });
                          }}
                          placeholder="Instruções adicionais para IA ao gerar esta seção..."
                          rows={3}
                          className="text-xs"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveTemplate} className="gap-2"><Save className="h-3.5 w-3.5" /> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
