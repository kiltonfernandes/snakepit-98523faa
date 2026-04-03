import { useState, useEffect, useCallback } from 'react';
import { Palette, Sparkles, Image, ExternalLink, Download, Copy, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { useApp } from '@/contexts/AppContext';
import { TitleOption, DaySlot, EpisodeMaterial, Pauta } from '@/lib/types';
import { DAY_SLOTS } from '@/lib/constants';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

function parseProperNouns(title: string): string {
  return title.split(' ').filter(w => w.length > 2 && w[0] === w[0].toUpperCase()).join(' ');
}

export default function Materials() {
  const { weeks, materials, pautas, getMaterialsForWeek, getPautasForWeek, updateMaterial, loadReleases } = useApp();
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);
  const [coverDaySlot, setCoverDaySlot] = useState<DaySlot | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [generatingTitles, setGeneratingTitles] = useState<Set<string>>(new Set());
  const [generatingAllTitles, setGeneratingAllTitles] = useState(false);

  const selectedWeek = weeks.find(w => w.id === selectedWeekId) || weeks[0];
  const weekMaterials = selectedWeek ? getMaterialsForWeek(selectedWeek.id) : [];
  const weekPautas = selectedWeek ? getPautasForWeek(selectedWeek.id) : [];

  // Auto-repair: create missing materials for the selected week
  const repairMaterials = async () => {
    if (!selectedWeek) return;
    setRepairing(true);
    const existing = new Set(weekMaterials.map(m => m.slot_key));
    const weekPautasList = getPautasForWeek(selectedWeek.id);
    const newMaterials: EpisodeMaterial[] = [];

    for (let i = 0; i < DAY_SLOTS.length; i++) {
      const slot = DAY_SLOTS[i];
      if (existing.has(slot.key)) continue;

      const epDate = new Date(selectedWeek.start_date);
      epDate.setDate(epDate.getDate() + i);
      const dateStr = epDate.toISOString().slice(0, 10);

      // Find matching pauta by date or slot
      const pauta = weekPautasList.find(p => p.publication_date === dateStr) 
        || weekPautasList.find(p => {
          const d = new Date(p.publication_date + 'T12:00:00');
          const wd = d.getDay();
          const slotMap: Record<number, string> = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };
          return slotMap[wd] === slot.key;
        })
        || null;

      const mat: EpisodeMaterial = {
        id: crypto.randomUUID(),
        week_id: selectedWeek.id,
        slot_key: slot.key,
        episode_date: dateStr,
        source_pauta_id: pauta?.id || null,
        title_options_json: [],
        selected_title_index: null,
        description_html: null,
        cover_url: null,
        spotify_link: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      newMaterials.push(mat);
    }

    if (newMaterials.length > 0) {
      await supabase.from('episode_materials' as any).insert(newMaterials as any);
      window.location.reload();
    }
    setRepairing(false);
  };

  // Auto-repair on mount if materials are missing
  useEffect(() => {
    if (selectedWeek && weekPautas.length > 0 && weekMaterials.length === 0) {
      repairMaterials();
    }
  }, [selectedWeek?.id, weekPautas.length, weekMaterials.length]);

  const getTitle = (mat: { title_options_json: any[]; selected_title_index: number | null }) => {
    if (mat.selected_title_index != null && mat.title_options_json[mat.selected_title_index]) {
      return (mat.title_options_json[mat.selected_title_index] as any)?.text || '';
    }
    return '';
  };

  const getPautaForMaterial = (mat: EpisodeMaterial) => {
    if (mat.source_pauta_id) {
      const byId = pautas.find(p => p.id === mat.source_pauta_id);
      if (byId) return byId;
    }
    const byDate = weekPautas.find(p => p.publication_date === mat.episode_date);
    if (byDate) return byDate;
    return weekPautas.find(p => {
      const d = new Date(p.publication_date + 'T12:00:00');
      const wd = d.getDay();
      const slotMap: Record<number, string> = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };
      return slotMap[wd] === mat.slot_key;
    });
  };

  const isPautaReady = (mat: EpisodeMaterial) => {
    const pauta = getPautaForMaterial(mat);
    return pauta && (pauta.status === 'generated' || pauta.status === 'finalized' || pauta.status === 'needs_review');
  };

  // Build prompt for AI title generation based on pauta content
  const buildTitlePrompt = (mat: EpisodeMaterial, pauta: Pauta): string => {
    const sections = (pauta.sections_json || {}) as Record<string, string>;
    const inputs = (pauta.raw_inputs_json || {}) as Record<string, any>;
    
    // Extract key content from the pauta
    const newsContent = sections.news || inputs.news_urls || '';
    const anniversaryContent = sections.anniversary || inputs.anniversary || '';
    const reviewRafa = sections.review_rafa || '';
    const reviewKilton = sections.review_kilton || '';
    
    const dayLabel = DAY_SLOTS.find(d => d.key === mat.slot_key)?.label || mat.slot_key;
    
    // Build context summary
    let context = `📅 ${dayLabel.toUpperCase()} (${mat.episode_date})\n\n`;
    
    if (newsContent) context += `📰 Notícia principal:\n${typeof newsContent === 'string' ? newsContent.slice(0, 500) : JSON.stringify(newsContent).slice(0, 500)}\n\n`;
    if (anniversaryContent) context += `🎸 Aniversário:\n${typeof anniversaryContent === 'string' ? anniversaryContent.slice(0, 300) : ''}\n\n`;
    if (reviewRafa) context += `🎤 Review Rafa (trecho):\n${reviewRafa.slice(0, 300)}\n\n`;
    if (reviewKilton) context += `🎧 Review Kilton (trecho):\n${reviewKilton.slice(0, 300)}\n\n`;
    
    return `🔥 Títulos otimizados para YOUTUBE/PODCAST

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 REGRAS E RESTRIÇÕES:
• máximo 60-70 caracteres por título
• usar CAPS LOCK apenas em 1-2 palavras-chave por título
• incluir nome da banda sempre que possível
• opção 1: foco em CLICKBAIT emocional
• opção 2: foco em despertar CURIOSIDADE
• opção 3: foco em criar IMPACTO/urgência
• evitar clickbait enganoso
• usar emojis estrategicamente (máx 2 por título)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Contexto do episódio:

${context}

Gere EXATAMENTE 3 títulos para este episódio.

FORMATO DE RESPOSTA (siga EXATAMENTE):
TITULO_1_CLICKBAIT: [seu título aqui]
TITULO_2_CURIOSIDADE: [seu título aqui]  
TITULO_3_IMPACTO: [seu título aqui]

Responda APENAS com os 3 títulos no formato acima, sem explicações extras.`;
  };

  // Call AI to generate titles for a single material
  const generateTitlesAI = useCallback(async (materialId: string) => {
    const mat = weekMaterials.find(m => m.id === materialId);
    if (!mat) return;
    
    const pauta = getPautaForMaterial(mat);
    if (!pauta) {
      toast.error('Pauta não encontrada para este episódio');
      return;
    }
    
    setGeneratingTitles(prev => new Set(prev).add(materialId));
    
    try {
      const prompt = buildTitlePrompt(mat, pauta);
      
      const { data: fnData, error: fnError } = await supabase.functions.invoke('generate-pauta', {
        body: { prompt },
      });
      
      if (fnError) throw fnError;
      
      // Parse the response - it comes as SSE stream text
      let fullText = '';
      if (typeof fnData === 'string') {
        fullText = fnData;
      } else if (fnData && typeof fnData === 'object') {
        // Handle SSE response
        const text = await new Response(fnData as any).text();
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const json = JSON.parse(line.slice(6));
              const delta = json.choices?.[0]?.delta?.content || '';
              fullText += delta;
            } catch {}
          }
        }
      }
      
      if (!fullText.trim()) {
        // Fallback: generate placeholder titles
        fullText = 'TITULO_1_CLICKBAIT: Título clickbait pendente\nTITULO_2_CURIOSIDADE: Título curiosidade pendente\nTITULO_3_IMPACTO: Título impacto pendente';
      }
      
      // Parse titles from response
      const options: TitleOption[] = [];
      const styles = [
        { pattern: /TITULO_1_CLICKBAIT:\s*(.+)/i, style: 'clickbait' },
        { pattern: /TITULO_2_CURIOSIDADE:\s*(.+)/i, style: 'curiosidade' },
        { pattern: /TITULO_3_IMPACTO:\s*(.+)/i, style: 'impacto' },
      ];
      
      for (const { pattern, style } of styles) {
        const match = fullText.match(pattern);
        if (match) {
          options.push({ text: match[1].trim(), style: style as TitleOption['style'] });
        }
      }
      
      // If parsing failed, try line-by-line
      if (options.length === 0) {
        const lines = fullText.split('\n').filter(l => l.trim());
        const styleNames = ['clickbait', 'curiosidade', 'impacto'];
        lines.slice(0, 3).forEach((line, i) => {
          const cleanLine = line.replace(/^[\d\.\-\*\•]+\s*/, '').replace(/^\[.*?\]\s*/, '').trim();
          if (cleanLine) {
            options.push({ text: cleanLine, style: (styleNames[i] || 'clickbait') as TitleOption['style'] });
          }
        });
      }
      
      if (options.length > 0) {
        updateMaterial(materialId, { title_options_json: options as any });
        toast.success(`${options.length} títulos gerados`);
      } else {
        toast.warning('Não foi possível extrair títulos da resposta');
      }
    } catch (err: any) {
      console.error('Title generation error:', err);
      toast.error(err.message || 'Erro ao gerar títulos');
    } finally {
      setGeneratingTitles(prev => {
        const next = new Set(prev);
        next.delete(materialId);
        return next;
      });
    }
  }, [weekMaterials, weekPautas, pautas, updateMaterial]);

  // Fallback: generate placeholder titles (no AI)
  const generateTitlesPlaceholder = (materialId: string) => {
    const options: TitleOption[] = [
      { text: 'Título estilo clickbait aqui', style: 'clickbait' },
      { text: 'Título estilo curiosidade aqui', style: 'curiosidade' },
      { text: 'Título estilo impacto aqui', style: 'impacto' },
    ];
    updateMaterial(materialId, { title_options_json: options as any });
  };

  const selectTitle = (materialId: string, index: number) => {
    updateMaterial(materialId, { selected_title_index: index });
  };

  const openCoverCreator = (daySlot: DaySlot) => {
    setCoverDaySlot(daySlot);
    setImageUrl('');
    setCoverPreview(null);
    setCoverDialogOpen(true);
  };

  const generateCover = () => {
    if (!imageUrl || !coverDaySlot || !selectedWeek) return;
    const mat = weekMaterials.find(m => m.slot_key === coverDaySlot);
    if (!mat) return;

    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1a0e2e';
    ctx.fillRect(0, 0, 1080, 1080);

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.drawImage(img, 40, 40, 1000, 600);
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(0, 650, 1080, 6);
      ctx.fillStyle = '#C8A2C8'; ctx.font = 'bold 28px sans-serif'; ctx.fillText('Heavynauta', 50, 710);
      ctx.fillStyle = '#e8d5f5'; ctx.font = 'bold 42px sans-serif';
      ctx.fillText(getTitle(mat) || `Episódio ${coverDaySlot}`, 50, 800, 900);
      ctx.fillStyle = '#8a7a9a'; ctx.font = '22px sans-serif';
      ctx.fillText('Papo Sério Sobre Música Pesada', 50, 860);
      const dataUrl = canvas.toDataURL('image/png');
      setCoverPreview(dataUrl);
      updateMaterial(mat.id, { cover_url: dataUrl });
    };
    img.onerror = () => {
      ctx.fillStyle = '#C8A2C8'; ctx.font = 'bold 28px sans-serif'; ctx.fillText('Heavynauta', 50, 710);
      ctx.fillStyle = '#e8d5f5'; ctx.font = 'bold 42px sans-serif';
      ctx.fillText(getTitle(mat) || 'Episódio', 50, 800, 900);
      const dataUrl = canvas.toDataURL('image/png');
      setCoverPreview(dataUrl);
      updateMaterial(mat.id, { cover_url: dataUrl });
    };
    img.src = imageUrl;
  };

  const searchQuery = (daySlot: DaySlot) => {
    const mat = weekMaterials.find(m => m.slot_key === daySlot);
    const title = mat ? getTitle(mat) : '';
    return encodeURIComponent(parseProperNouns(title) || 'metal band');
  };

  // Sunday compilation: generate summary from week's pautas
  const generateSundayContent = (mat: EpisodeMaterial) => {
    const finalized = weekPautas.filter(p => p.week_id === mat.week_id && p.pauta_type !== 'sunday' && (p.status === 'finalized' || p.status === 'generated'));
    if (finalized.length === 0) {
      toast.warning('Nenhuma pauta pronta para compilação');
      return;
    }
    const summary = finalized.map(p => {
      const sections = (p.sections_json || {}) as Record<string, string>;
      const mainContent = Object.values(sections).filter(Boolean).join(' ').slice(0, 200);
      return `${p.publication_date}: ${mainContent}...`;
    }).join('\n\n');
    updateMaterial(mat.id, { description_html: `<h3>Compilação Semanal</h3>\n${summary}` });
    toast.success('Compilação semanal gerada');
  };

  const handleBulkTitles = async () => {
    const readyMaterials = weekMaterials.filter(m => isPautaReady(m) && m.slot_key !== 'sunday');
    if (readyMaterials.length === 0) {
      toast.warning('Nenhuma pauta pronta para gerar títulos');
      return;
    }
    setGeneratingAllTitles(true);
    for (const mat of readyMaterials) {
      await generateTitlesAI(mat.id);
    }
    setGeneratingAllTitles(false);
    toast.success('Geração de títulos concluída');
  };

  const handleBulkDescriptions = () => {
    weekMaterials.forEach(m => {
      if (m.slot_key === 'sunday') {
        generateSundayContent(m);
      }
    });
    toast.info('Descrições em lote: use o prompt para gerar conteúdo personalizado');
  };

  const handleExportMaterials = (format: 'json' | 'clipboard' | 'per-episode') => {
    if (format === 'per-episode') {
      weekMaterials.forEach(m => {
        const content = `Título: ${getTitle(m)}\nDescrição: ${m.description_html || ''}\nSpotify: ${m.spotify_link || 'Não agendado'}`;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `material_${m.slot_key}_${m.episode_date}.txt`; a.click();
        URL.revokeObjectURL(url);
      });
      return;
    }
    const data = weekMaterials.map(m => ({
      slot: m.slot_key, date: m.episode_date, title: getTitle(m),
      description: m.description_html, cover: m.cover_url ? '(gerada)' : null, spotify: m.spotify_link,
    }));
    if (format === 'clipboard') {
      const text = data.map(d => `${d.slot} (${d.date}): ${d.title}\n${d.description || 'Sem descrição'}`).join('\n\n---\n\n');
      navigator.clipboard.writeText(text);
      toast.success('Copiado para clipboard');
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `materiais_${selectedWeek?.start_date}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const matLight = (mat: { selected_title_index: number | null; description_html: string | null; cover_url: string | null; spotify_link: string | null }) => {
    const count = [mat.selected_title_index != null, !!mat.description_html, !!mat.cover_url, !!mat.spotify_link].filter(Boolean).length;
    if (count >= 3) return 'bg-emerald-500';
    if (count >= 1) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (weeks.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Palette className="h-6 w-6 text-primary" />
            Materiais
          </h1>
          <p className="text-muted-foreground mt-1">Títulos, descrições e capas dos episódios</p>
        </div>
        <Card><CardContent className="flex flex-col items-center justify-center py-16">
          <Palette className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">Crie uma semana na aba Pautas primeiro.</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Palette className="h-6 w-6 text-primary" />
            Materiais
          </h1>
          <p className="text-muted-foreground mt-1">Títulos, descrições e capas dos episódios</p>
        </div>
        {selectedWeek && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => handleExportMaterials('clipboard')}>
              <Copy className="h-3.5 w-3.5" /> Clipboard
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => handleExportMaterials('json')}>
              <Download className="h-3.5 w-3.5" /> JSON
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => handleExportMaterials('per-episode')}>
              <Download className="h-3.5 w-3.5" /> Por Episódio
            </Button>
          </div>
        )}
      </div>

      {weeks.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {weeks.map(w => (
            <Button key={w.id} variant={selectedWeek?.id === w.id ? 'default' : 'outline'} size="sm" onClick={() => setSelectedWeekId(w.id)}>
              {new Date(w.start_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </Button>
          ))}
        </div>
      )}

      {selectedWeek && weekMaterials.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Palette className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-muted-foreground">Materiais não encontrados para esta semana. Criando automaticamente...</p>
            <Button onClick={repairMaterials} disabled={repairing} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${repairing ? 'animate-spin' : ''}`} />
              {repairing ? 'Criando...' : 'Criar Materiais'}
            </Button>
          </CardContent>
        </Card>
      )}

      {weekMaterials.length > 0 && (
      <Tabs defaultValue="titles" className="space-y-4">
        <TabsList>
          <TabsTrigger value="titles">Títulos</TabsTrigger>
          <TabsTrigger value="descriptions">Descrições</TabsTrigger>
          <TabsTrigger value="covers">Capas</TabsTrigger>
        </TabsList>

        <TabsContent value="titles">
          <WorkspaceShell
            weekLabel="Títulos da Semana"
            actions={
              <Button size="sm" onClick={handleBulkTitles} disabled={generatingAllTitles}>
                {generatingAllTitles ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                {generatingAllTitles ? 'Gerando...' : 'Gerar Todos (IA)'}
              </Button>
            }
            renderDay={(day) => {
              const mat = weekMaterials.find(m => m.slot_key === day.key);
              if (!mat) return null;
              const opts = mat.title_options_json as TitleOption[];
              const ready = isPautaReady(mat);
              const isGenerating = generatingTitles.has(mat.id);
              return (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`h-2 w-2 rounded-full ${matLight(mat)}`} />
                    <span className="text-[10px] text-muted-foreground">{mat.episode_date}</span>
                    {ready && <Badge variant="outline" className="text-[8px] text-emerald-400 border-emerald-400/30">Pauta OK</Badge>}
                    {!ready && <Badge variant="outline" className="text-[8px] text-orange-400 border-orange-400/30">Pauta não pronta</Badge>}
                  </div>
                  {isGenerating ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground ml-2">Gerando títulos...</span>
                    </div>
                  ) : opts.length > 0 ? (
                    opts.map((opt, i) => (
                      <button key={i} className={`w-full text-left p-2 rounded-md text-xs border transition-colors ${
                        mat.selected_title_index === i ? 'border-primary bg-primary/10 text-foreground' : 'border-border hover:border-primary/30 text-muted-foreground'
                      }`} onClick={() => selectTitle(mat.id, i)}>
                        <Badge variant="secondary" className="text-[9px] mb-1">{opt.style}</Badge>
                        <p>{opt.text}</p>
                      </button>
                    ))
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Sem títulos gerados</p>
                      <Button size="sm" variant="outline" className="w-full text-xs gap-1" onClick={() => generateTitlesAI(mat.id)} disabled={!ready}>
                        <Sparkles className="h-3 w-3" /> Gerar via IA
                      </Button>
                    </div>
                  )}
                  {opts.length > 0 && (
                    <Button size="sm" variant="ghost" className="w-full text-[10px] gap-1" onClick={() => generateTitlesAI(mat.id)} disabled={!ready || isGenerating}>
                      <RefreshCw className="h-3 w-3" /> Regenerar
                    </Button>
                  )}
                  {mat.selected_title_index != null && (
                    <div className="mt-2 p-2 rounded bg-primary/5 border border-primary/20">
                      <p className="text-[10px] text-primary font-medium">Selecionado:</p>
                      <p className="text-xs">{getTitle(mat)}</p>
                    </div>
                  )}
                </div>
              );
            }}
          />
        </TabsContent>

        <TabsContent value="descriptions">
          <WorkspaceShell
            weekLabel="Descrições da Semana"
            actions={<Button size="sm" onClick={handleBulkDescriptions}><Sparkles className="h-4 w-4 mr-1" /> Gerar Todas</Button>}
            renderDay={(day) => {
              const mat = weekMaterials.find(m => m.slot_key === day.key);
              if (!mat) return null;
              const isSunday = day.key === 'sunday';
              return (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`h-2 w-2 rounded-full ${matLight(mat)}`} />
                    <span className="text-[10px] text-muted-foreground">{mat.episode_date}</span>
                  </div>
                  {isSunday && (
                    <Button size="sm" variant="outline" className="w-full text-xs mb-2" onClick={() => generateSundayContent(mat)}>
                      <Sparkles className="h-3 w-3 mr-1" /> Compilar Semana
                    </Button>
                  )}
                  <Textarea
                    className="min-h-[120px] text-xs resize-none"
                    placeholder="Descrição HTML do episódio..."
                    value={mat.description_html || ''}
                    onChange={e => updateMaterial(mat.id, { description_html: e.target.value })}
                  />
                </div>
              );
            }}
          />
        </TabsContent>

        <TabsContent value="covers">
          <WorkspaceShell
            weekLabel="Capas da Semana"
            actions={<Button size="sm"><Image className="h-4 w-4 mr-1" /> Criar Todas</Button>}
            renderDay={(day) => {
              const mat = weekMaterials.find(m => m.slot_key === day.key);
              if (!mat) return null;
              return (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`h-2 w-2 rounded-full ${matLight(mat)}`} />
                    <span className="text-[10px] text-muted-foreground">{mat.episode_date}</span>
                  </div>
                  {mat.cover_url ? (
                    <div className="space-y-2">
                      <img src={mat.cover_url} alt="Capa" className="w-full aspect-square rounded-md object-cover" />
                      <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => openCoverCreator(day.key)}>
                        Refazer Capa
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" className="w-full h-24 flex-col gap-2" onClick={() => openCoverCreator(day.key)}>
                      <Image className="h-6 w-6 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Criar Capa</span>
                    </Button>
                  )}
                </div>
              );
            }}
          />
        </TabsContent>
      </Tabs>
      )}

      {/* Cover Creator Dialog */}
      <Dialog open={coverDialogOpen} onOpenChange={setCoverDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Criar Capa</DialogTitle>
            <DialogDescription>Busque uma imagem e gere a capa proceduralmente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => {
                if (coverDaySlot) window.open(`https://images.google.com/search?q=${searchQuery(coverDaySlot)}&tbm=isch`, '_blank');
              }}>
                <ExternalLink className="h-3.5 w-3.5" /> Buscar Imagens
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>URL da Imagem</Label>
              <Input placeholder="Cole aqui a URL da imagem..." value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
            </div>
            {imageUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <img src={imageUrl} alt="Preview" className="w-full aspect-video rounded-md object-cover bg-muted" onError={e => (e.target as HTMLImageElement).style.display = 'none'} />
              </div>
            )}
            <Button onClick={generateCover} disabled={!imageUrl} className="w-full gap-2">
              <Sparkles className="h-4 w-4" /> Gerar Capa
            </Button>
            {coverPreview && (
              <div className="space-y-2">
                <Label>Capa Gerada</Label>
                <img src={coverPreview} alt="Capa final" className="w-full max-w-[300px] mx-auto aspect-square rounded-md" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCoverDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
