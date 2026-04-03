import { useState, useEffect, useCallback } from 'react';
import { Palette, Sparkles, Image, ExternalLink, Download, Copy, RefreshCw, Loader2 } from 'lucide-react';
import heavynautaLogo from '@/assets/heavynauta-logo.jpg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { useApp } from '@/contexts/AppContext';
import { TitleOption, DaySlot, EpisodeMaterial, Pauta, Release } from '@/lib/types';
import { DAY_SLOTS } from '@/lib/constants';
import { getPromptText } from '@/lib/prompt-defaults';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

function parseProperNouns(title: string): string {
  return title
    .split(' ')
    .filter((word) => word.length > 2 && word[0] === word[0]?.toUpperCase())
    .join(' ')
    .trim();
}

function cleanAiResponse(value: string): string {
  return value
    .trim()
    .replace(/^```(?:html|md|markdown|txt)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function toPlainText(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractSseText(raw: string): string {
  const lines = raw.split('\n');
  let fullText = '';

  for (const line of lines) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
    try {
      const json = JSON.parse(line.slice(6));
      fullText += json.choices?.[0]?.delta?.content || '';
    } catch {
      // ignore malformed partial chunks
    }
  }

  return fullText.trim();
}

export default function Materials() {
  const { weeks, materials, pautas, releases, settings, getMaterialsForWeek, getPautasForWeek, updateMaterial } = useApp();
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);
  const [coverDaySlot, setCoverDaySlot] = useState<DaySlot | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [generatingTitles, setGeneratingTitles] = useState<Set<string>>(new Set());
  const [generatingDescriptions, setGeneratingDescriptions] = useState<Set<string>>(new Set());
  const [generatingAllTitles, setGeneratingAllTitles] = useState(false);
  const [generatingAllDescriptions, setGeneratingAllDescriptions] = useState(false);

  const selectedWeek = weeks.find((w) => w.id === selectedWeekId) || weeks[0];
  const weekMaterials = selectedWeek ? getMaterialsForWeek(selectedWeek.id) : [];
  const weekPautas = selectedWeek ? getPautasForWeek(selectedWeek.id) : [];
  const promptOverrides = (settings.prompt_overrides_json || {}) as Record<string, string>;

  const repairMaterials = async () => {
    if (!selectedWeek) return;

    setRepairing(true);
    const existing = new Set(weekMaterials.map((m) => m.slot_key));
    const weekPautasList = getPautasForWeek(selectedWeek.id);
    const newMaterials: EpisodeMaterial[] = [];

    for (let i = 0; i < DAY_SLOTS.length; i++) {
      const slot = DAY_SLOTS[i];
      if (existing.has(slot.key)) continue;

      const epDate = new Date(selectedWeek.start_date);
      epDate.setDate(epDate.getDate() + i);
      const dateStr = epDate.toISOString().slice(0, 10);

      const pauta =
        weekPautasList.find((p) => p.publication_date === dateStr) ||
        weekPautasList.find((p) => {
          const d = new Date(`${p.publication_date}T12:00:00`);
          const wd = d.getDay();
          const slotMap: Record<number, string> = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };
          return slotMap[wd] === slot.key;
        }) ||
        null;

      newMaterials.push({
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
      });
    }

    if (newMaterials.length > 0) {
      await supabase.from('episode_materials' as any).insert(newMaterials as any);
      toast.success(`${newMaterials.length} materiais recriados`);
      window.location.reload();
      return;
    }

    toast.success('Nenhum reparo necessário');
    setRepairing(false);
  };

  useEffect(() => {
    if (selectedWeek && weekPautas.length > 0 && weekMaterials.length === 0) {
      repairMaterials();
    }
  }, [selectedWeek?.id, weekPautas.length, weekMaterials.length]);

  const getTitleOptions = (mat: EpisodeMaterial) => (Array.isArray(mat.title_options_json) ? (mat.title_options_json as TitleOption[]) : []);

  const getTitle = (mat: Pick<EpisodeMaterial, 'title_options_json' | 'selected_title_index'>) => {
    const options = Array.isArray(mat.title_options_json) ? (mat.title_options_json as TitleOption[]) : [];
    if (mat.selected_title_index != null && options[mat.selected_title_index]) {
      return options[mat.selected_title_index]?.text || '';
    }
    return options[0]?.text || '';
  };

  const getPautaForMaterial = (mat: EpisodeMaterial) => {
    if (mat.source_pauta_id) {
      const byId = pautas.find((p) => p.id === mat.source_pauta_id);
      if (byId) return byId;
    }

    const byDate = weekPautas.find((p) => p.publication_date === mat.episode_date);
    if (byDate) return byDate;

    return weekPautas.find((p) => {
      const d = new Date(`${p.publication_date}T12:00:00`);
      const wd = d.getDay();
      const slotMap: Record<number, string> = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };
      return slotMap[wd] === mat.slot_key;
    });
  };

  const getReleaseFromPauta = (pauta: Pauta | undefined, inputKey: 'review_rafa_id' | 'review_kilton_id'): Release | undefined => {
    const inputs = ((pauta?.raw_inputs_json || {}) as Record<string, any>);
    return releases.find((release) => release.id === inputs[inputKey]);
  };

  const isPautaReady = (mat: EpisodeMaterial) => {
    const pauta = getPautaForMaterial(mat);
    return Boolean(pauta && (pauta.status === 'generated' || pauta.status === 'finalized' || pauta.status === 'needs_review'));
  };

  const runAIPrompt = useCallback(async (prompt: string) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pauta`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ prompt, bannedTerms: settings.banned_terms_text ? settings.banned_terms_text.split('\n').filter(Boolean) : [] }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Erro ao chamar a IA' }));
      throw new Error(error.error || `Erro ${response.status}`);
    }

    const raw = await response.text();
    const text = extractSseText(raw);
    return cleanAiResponse(text || raw);
  }, []);

  const buildEpisodeContext = (mat: EpisodeMaterial, pauta: Pauta) => {
    const sections = (pauta.sections_json || {}) as Record<string, string>;
    const inputs = (pauta.raw_inputs_json || {}) as Record<string, any>;
    const reviewRafa = getReleaseFromPauta(pauta, 'review_rafa_id');
    const reviewKilton = getReleaseFromPauta(pauta, 'review_kilton_id');
    const dayLabel = DAY_SLOTS.find((day) => day.key === mat.slot_key)?.label || mat.slot_key;

    return {
      dayLabel,
      sections,
      inputs,
      reviewRafa,
      reviewKilton,
      summary: [
        inputs.anniversary ? `Aniversário: ${inputs.anniversary}` : '',
        reviewRafa ? `Review Rafa: ${reviewRafa.artist} - ${reviewRafa.album}` : '',
        sections.news ? `Notícias: ${toPlainText(sections.news).slice(0, 500)}` : '',
        reviewKilton ? `Review Kilton: ${reviewKilton.artist} - ${reviewKilton.album}` : '',
        sections.next_week_releases ? `Lançamentos da semana: ${toPlainText(sections.next_week_releases).slice(0, 500)}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  };

  const buildTitlePrompt = (mat: EpisodeMaterial, pauta: Pauta): string => {
    const context = buildEpisodeContext(mat, pauta);
    const instructions = getPromptText('material_titles_instructions', promptOverrides);

    return `🔥 Títulos otimizados para YOUTUBE/PODCAST\n\n${instructions}\n\nCONTEXTO DO EPISÓDIO:\nDia: ${context.dayLabel}\nData: ${mat.episode_date}\n${context.summary}\n\nREGRAS OBRIGATÓRIAS:\n- responder SEMPRE em português do Brasil\n- não usar code block\n- não explicar o raciocínio\n- os títulos devem soar fortes, editoriais e prontos para publicação\n- se houver banda/álbum no contexto, priorize esses nomes\n\nFORMATO DE RESPOSTA EXATO:\nTITULO_1_CLICKBAIT: [texto]\nTITULO_2_CURIOSIDADE: [texto]\nTITULO_3_IMPACTO: [texto]`;
  };

  const parseTitleResponse = (rawText: string): TitleOption[] => {
    const fullText = cleanAiResponse(rawText);
    const options: TitleOption[] = [];
    const styles = [
      { pattern: /TITULO_1_CLICKBAIT:\s*(.+)/i, style: 'clickbait' as const },
      { pattern: /TITULO_2_CURIOSIDADE:\s*(.+)/i, style: 'curiosidade' as const },
      { pattern: /TITULO_3_IMPACTO:\s*(.+)/i, style: 'impacto' as const },
    ];

    for (const { pattern, style } of styles) {
      const match = fullText.match(pattern);
      if (match?.[1]?.trim()) {
        options.push({ text: match[1].trim(), style });
      }
    }

    if (options.length > 0) return options;

    const lines = fullText
      .split('\n')
      .map((line) => line.replace(/^[\d\-\*\•\.\)\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 3);

    return lines.map((line, index) => ({
      text: line,
      style: (['clickbait', 'curiosidade', 'impacto'][index] || 'clickbait') as TitleOption['style'],
    }));
  };

  const generateTitlesAI = useCallback(async (materialId: string) => {
    const mat = weekMaterials.find((material) => material.id === materialId);
    if (!mat) return;

    // Sunday: use other episodes as context instead of pauta
    if (mat.slot_key === 'sunday') {
      const otherMats = weekMaterials.filter((m) => m.slot_key !== 'sunday');
      const otherTitles = otherMats.map((m) => getTitle(m)).filter(Boolean);
      if (otherTitles.length === 0) {
        toast.warning('Gere os títulos dos outros episódios primeiro');
        return;
      }
      setGeneratingTitles((prev) => new Set(prev).add(materialId));
      try {
        const prompt = `🔥 Títulos otimizados para YOUTUBE/PODCAST — COMPILAÇÃO SEMANAL\n\nEste é o episódio de DOMINGO do Heavynauta, um podcast longo que compila todos os 6 episódios da semana.\n\nTÍTULOS DOS EPISÓDIOS DA SEMANA:\n${otherTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nGere EXATAMENTE 3 títulos que capturem os destaques da semana de forma compilada.\n\nFORMATO:\nTITULO_1_CLICKBAIT: [texto]\nTITULO_2_CURIOSIDADE: [texto]\nTITULO_3_IMPACTO: [texto]`;
        const aiText = await runAIPrompt(prompt);
        const options = parseTitleResponse(aiText);
        if (options.length) {
          updateMaterial(materialId, { title_options_json: options as any, selected_title_index: 0 });
          toast.success(`${options.length} títulos gerados para domingo`);
        }
      } catch (err: any) {
        toast.error(err.message || 'Erro ao gerar títulos');
      } finally {
        setGeneratingTitles((prev) => { const next = new Set(prev); next.delete(materialId); return next; });
      }
      return;
    }

    const pauta = getPautaForMaterial(mat);
    if (!pauta) {
      toast.error('Pauta não encontrada para este episódio');
      return;
    }

    setGeneratingTitles((prev) => new Set(prev).add(materialId));

    try {
      const prompt = buildTitlePrompt(mat, pauta);
      const aiText = await runAIPrompt(prompt);
      const options = parseTitleResponse(aiText);

      if (!options.length) {
        throw new Error('A IA respondeu, mas não retornou os 3 títulos esperados');
      }

      updateMaterial(materialId, {
        title_options_json: options as any,
        selected_title_index: mat.selected_title_index ?? 0,
      });
      toast.success(`${options.length} títulos gerados`);
    } catch (err: any) {
      console.error('Title generation error:', err);
      toast.error(err.message || 'Erro ao gerar títulos');
    } finally {
      setGeneratingTitles((prev) => {
        const next = new Set(prev);
        next.delete(materialId);
        return next;
      });
    }
  }, [runAIPrompt, weekMaterials, weekPautas, pautas, releases, settings]);

  const buildDescriptionPrompt = (mat: EpisodeMaterial, pauta: Pauta): string => {
    const context = buildEpisodeContext(mat, pauta);
    const selectedTitle = getTitle(mat) || `Snakepit ${context.dayLabel}`;
    const descriptionInstructions = getPromptText('material_descriptions_instructions', promptOverrides);
    const brandBlock = getPromptText('material_brand_block', promptOverrides);
    const template = settings.description_template_html || '';

    const lines = [
      'Você vai escrever a descrição HTML de um episódio do podcast Heavynauta.',
      '',
      'REGRAS:',
      descriptionInstructions,
      '- responder APENAS com HTML válido',
      '- nunca usar markdown nem code block',
      '- manter um tom editorial, direto e legível',
      '- usar o título selecionado como gancho da abertura',
      '- se houver Spotify agendado, incluir um link em HTML com o URL informado',
    ];

    if (template) {
      lines.push('', 'TEMPLATE FIXO (respeite a estrutura, substitua os placeholders):');
      lines.push(template);
      lines.push('', 'SUBSTITUA <<<title>>> pelo título selecionado.');
      lines.push('SUBSTITUA <<<generated content>>> pelo conteúdo editorial gerado.');
    }

    lines.push(
      '',
      'TÍTULO SELECIONADO:',
      selectedTitle,
      '',
      'SPOTIFY AGENDADO:',
      mat.spotify_link || 'ainda não informado',
      '',
      'CONTEXTO DO EPISÓDIO:',
      `Dia: ${context.dayLabel}`,
      `Data: ${mat.episode_date}`,
      context.summary,
      '',
      'BLOCO INSTITUCIONAL PARA INCLUIR NO FINAL EXATAMENTE UMA VEZ:',
      brandBlock,
      '',
      'FORMATO ESPERADO:',
      template ? '- Siga o template fixo acima' : '- 1 parágrafo de abertura',
      '- 1 ou 2 parágrafos resumindo os destaques',
      '- 1 lista curta com highlights do episódio',
      '- bloco institucional',
      '- CTA final em HTML',
    );

    return lines.join('\n');
  };

  const generateDescriptionAI = useCallback(async (materialId: string) => {
    const mat = weekMaterials.find((material) => material.id === materialId);
    if (!mat) return;

    if (mat.slot_key === 'sunday') {
      generateSundayContent(mat);
      return;
    }

    const pauta = getPautaForMaterial(mat);
    if (!pauta) {
      toast.error('Pauta não encontrada para este episódio');
      return;
    }

    setGeneratingDescriptions((prev) => new Set(prev).add(materialId));

    try {
      const prompt = buildDescriptionPrompt(mat, pauta);
      const rawHtml = await runAIPrompt(prompt);
      let html = cleanAiResponse(rawHtml);

      if (!html.startsWith('<')) {
        html = `<p>${html.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br />')}</p>`;
      }

      // Apply fixed template if available
      const template = settings.description_template_html || '';
      if (template && !html.includes('<<<')) {
        const selectedTitle = getTitle(mat) || `Episódio ${mat.slot_key}`;
        const finalHtml = template
          .replace(/<<<title>>>/g, selectedTitle)
          .replace(/<<<generated content>>>/g, html);
        html = finalHtml;
      }

      const brandBlock = getPromptText('material_brand_block', promptOverrides);
      if (!html.includes('Heavynauta')) {
        html = `${html}\n${brandBlock}`;
      }

      updateMaterial(materialId, { description_html: html });
      toast.success('Descrição gerada');
    } catch (err: any) {
      console.error('Description generation error:', err);
      toast.error(err.message || 'Erro ao gerar descrição');
    } finally {
      setGeneratingDescriptions((prev) => {
        const next = new Set(prev);
        next.delete(materialId);
        return next;
      });
    }
  }, [runAIPrompt, weekMaterials, weekPautas, pautas, releases, settings]);

  const selectTitle = (materialId: string, index: number) => {
    updateMaterial(materialId, { selected_title_index: index });
  };

  const openCoverCreator = (daySlot: DaySlot) => {
    setCoverDaySlot(daySlot);
    setImageUrl('');
    setCoverPreview(null);
    setCoverDialogOpen(true);
  };

  const buildCoverSearchQuery = (daySlot: DaySlot) => {
    const mat = weekMaterials.find((material) => material.slot_key === daySlot);
    if (!mat) return 'heavy metal album cover';

    const pauta = getPautaForMaterial(mat);
    const inputs = ((pauta?.raw_inputs_json || {}) as Record<string, any>);
    const selectedTitle = getTitle(mat);
    const anniversary = typeof inputs.anniversary === 'string' ? inputs.anniversary.trim() : '';
    const reviewRelease = getReleaseFromPauta(pauta, 'review_rafa_id') || getReleaseFromPauta(pauta, 'review_kilton_id');

    if (anniversary) return `${anniversary} band promo`;
    if (reviewRelease) return `${reviewRelease.artist} ${reviewRelease.album} band promo`;

    const textPool = [
      selectedTitle,
      typeof pauta?.sections_json?.news === 'string' ? pauta.sections_json.news : '',
      typeof pauta?.sections_json?.review_rafa === 'string' ? pauta.sections_json.review_rafa : '',
      typeof pauta?.sections_json?.review_kilton === 'string' ? pauta.sections_json.review_kilton : '',
    ]
      .filter(Boolean)
      .join(' ');

    const proper = parseProperNouns(textPool);
    return proper ? `${proper} band promo photo` : `${selectedTitle || 'heavy metal'} band photo`;
  };

  const fetchCanvasSafeImageUrl = useCallback(async (url: string) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      return { src: url, revoke: () => undefined };
    }

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-remote-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Não foi possível baixar a imagem remota' }));
      throw new Error(error.error || 'Não foi possível baixar a imagem remota');
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    return {
      src: objectUrl,
      revoke: () => URL.revokeObjectURL(objectUrl),
    };
  }, []);

  const drawWrappedText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    maxLines: number,
  ) => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let currentLine = '';

    words.forEach((word) => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width <= maxWidth) {
        currentLine = testLine;
        return;
      }

      if (currentLine) lines.push(currentLine);
      currentLine = word;
    });

    if (currentLine) lines.push(currentLine);

    const visibleLines = lines.slice(0, maxLines).map((line, index, arr) => {
      if (index !== arr.length - 1 || lines.length <= maxLines) return line;
      let trimmed = line;
      while (ctx.measureText(`${trimmed}…`).width > maxWidth && trimmed.length > 0) {
        trimmed = trimmed.slice(0, -1).trim();
      }
      return `${trimmed}…`;
    });

    visibleLines.forEach((line, index) => {
      ctx.fillText(line, x, y + index * lineHeight);
    });
  };

  const generateCover = async () => {
    if (!imageUrl || !coverDaySlot || !selectedWeek) return;
    const mat = weekMaterials.find((material) => material.slot_key === coverDaySlot);
    if (!mat) return;

    setCoverPreview(null);

    const SIZE = 3000;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#1a0e2e';
    ctx.fillRect(0, 0, SIZE, SIZE);

    const exportCover = () => {
      try {
        const dataUrl = canvas.toDataURL('image/png');
        setCoverPreview(dataUrl);
        updateMaterial(mat.id, { cover_url: dataUrl });
        toast.success('Capa gerada (3000×3000)');
      } catch (error) {
        console.error('Cover export error:', error);
        toast.error('A capa não pôde ser exportada. Tente outra imagem.');
      }
    };

    const drawCoverImage = (img: HTMLImageElement) => {
      // Image takes up ~65% of vertical space, with a subtle frame
      const frameMargin = 80;
      const frameTop = 40;
      const imageAreaW = SIZE - frameMargin * 2;
      const imageAreaH = Math.round(SIZE * 0.62);

      // Draw dark border/frame lines (like the reference covers)
      ctx.strokeStyle = 'rgba(200, 200, 200, 0.15)';
      ctx.lineWidth = 3;
      // Hexagonal/angular clip path inspired by reference
      const clipInset = 30;
      const cornerCut = 60;
      ctx.beginPath();
      ctx.moveTo(frameMargin + cornerCut, frameTop + clipInset);
      ctx.lineTo(SIZE - frameMargin - cornerCut, frameTop + clipInset);
      ctx.lineTo(SIZE - frameMargin - clipInset, frameTop + cornerCut);
      ctx.lineTo(SIZE - frameMargin - clipInset, frameTop + imageAreaH - cornerCut);
      ctx.lineTo(SIZE - frameMargin - cornerCut, frameTop + imageAreaH - clipInset);
      ctx.lineTo(frameMargin + cornerCut, frameTop + imageAreaH - clipInset);
      ctx.lineTo(frameMargin + clipInset, frameTop + imageAreaH - cornerCut);
      ctx.lineTo(frameMargin + clipInset, frameTop + cornerCut);
      ctx.closePath();
      ctx.stroke();

      // Clip image to the angular frame
      ctx.save();
      ctx.clip();

      const imageRatio = img.width / img.height;
      const targetRatio = imageAreaW / imageAreaH;
      let drawWidth = imageAreaW;
      let drawHeight = imageAreaH;
      let offsetX = frameMargin;
      let offsetY = frameTop;

      if (imageRatio > targetRatio) {
        drawHeight = imageAreaH;
        drawWidth = drawHeight * imageRatio;
        offsetX = frameMargin - (drawWidth - imageAreaW) / 2;
      } else {
        drawWidth = imageAreaW;
        drawHeight = drawWidth / imageRatio;
        offsetY = frameTop - (drawHeight - imageAreaH) / 2;
      }

      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
      ctx.restore();
    };

    const drawOverlay = () => {
      const title = getTitle(mat) || `Episódio ${coverDaySlot}`;
      const imageAreaH = Math.round(SIZE * 0.62);
      const panelTop = imageAreaH + 80;

      // Gradient fade from image to panel
      const grad = ctx.createLinearGradient(0, panelTop - 200, 0, panelTop + 100);
      grad.addColorStop(0, 'rgba(26, 14, 46, 0)');
      grad.addColorStop(1, 'rgba(26, 14, 46, 0.98)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, panelTop - 200, SIZE, 400);

      // Solid panel below
      ctx.fillStyle = 'rgba(220, 210, 230, 0.95)';
      ctx.fillRect(0, panelTop + 100, SIZE, SIZE - panelTop - 100);

      // Grey horizontal bar (like reference)
      ctx.fillStyle = '#8a8a8a';
      ctx.fillRect(0, panelTop + 100, SIZE, 20);

      // "Heavynauta" label with purple highlight background
      const labelY = panelTop + 200;
      ctx.fillStyle = '#C8A2C8';
      ctx.fillRect(100, labelY - 60, 620, 90);
      ctx.fillStyle = '#1a0e2e';
      ctx.font = 'bold 72px sans-serif';
      ctx.fillText('Heavynauta', 120, labelY + 8);

      // Title in bold purple
      ctx.fillStyle = '#4a1a7a';
      ctx.font = 'bold 100px sans-serif';
      drawWrappedText(ctx, title, 100, panelTop + 420, 2100, 120, 3);

      // Accent bar under title
      ctx.fillStyle = '#4a1a4a';
      ctx.fillRect(100, panelTop + 780, 1200, 12);

      // Tagline
      ctx.fillStyle = '#3a2a4a';
      ctx.font = 'italic 58px sans-serif';
      ctx.fillText('Papo Sério Sobre Música Pesada', 100 + 800, panelTop + 870);

      // Purple side accent
      ctx.fillStyle = '#4a1a5e';
      ctx.fillRect(0, panelTop + 100, 16, SIZE - panelTop - 100);

      // Logo in bottom-right
      const logo = new window.Image();
      logo.onload = () => {
        const logoSize = 580;
        ctx.drawImage(logo, SIZE - logoSize - 80, SIZE - logoSize - 60, logoSize, logoSize);
        exportCover();
      };
      logo.onerror = () => exportCover();
      logo.src = heavynautaLogo;
    };

    try {
      const proxiedImage = await fetchCanvasSafeImageUrl(imageUrl);
      const img = new window.Image();
      img.onload = () => {
        drawCoverImage(img);
        proxiedImage.revoke();
        drawOverlay();
      };
      img.onerror = () => {
        proxiedImage.revoke();
        toast.error('Não foi possível carregar essa imagem para montar a capa.');
      };
      img.src = proxiedImage.src;
    } catch (error: any) {
      console.error('Cover generation error:', error);
      toast.error(error.message || 'Erro ao preparar imagem da capa');
    }
  };

  const generateSundayContent = async (mat: EpisodeMaterial) => {
    const otherMats = weekMaterials.filter((m) => m.week_id === mat.week_id && m.slot_key !== 'sunday');
    const readyMats = otherMats.filter((m) => getTitle(m) || m.description_html);

    if (readyMats.length === 0) {
      toast.warning('Nenhum episódio com título ou descrição para compilar');
      return;
    }

    // Build context from other episodes' titles and descriptions
    const episodesSummary = readyMats
      .map((m) => {
        const dayLabel = DAY_SLOTS.find((d) => d.key === m.slot_key)?.label || m.slot_key;
        const title = getTitle(m) || 'Sem título';
        const desc = m.description_html ? toPlainText(m.description_html).slice(0, 300) : '';
        return `${dayLabel} (${m.episode_date}): ${title}${desc ? ' — ' + desc : ''}`;
      })
      .join('\n');

    setGeneratingDescriptions((prev) => new Set(prev).add(mat.id));

    try {
      const prompt = [
        'Você vai escrever o título e a descrição HTML do episódio COMPILAÇÃO SEMANAL do podcast Heavynauta.',
        'Este é o episódio de DOMINGO — um podcast longo que junta todos os 6 episódios da semana.',
        '',
        'EPISÓDIOS DA SEMANA (títulos e resumos):',
        episodesSummary,
        '',
        'REGRAS:',
        '- Responda APENAS com HTML válido',
        '- Nunca usar markdown nem code block',
        '- O título deve refletir os destaques da semana de forma compilada',
        '- A descrição deve resumir todos os episódios com destaque para os temas principais',
        '- Inclua uma lista dos episódios com seus títulos',
        '- Tom editorial Heavynauta',
        '',
        'FORMATO DE RESPOSTA:',
        'TITULO_COMPILACAO: [texto do título]',
        '',
        '[HTML da descrição em seguida]',
      ].join('\n');

      const aiText = await runAIPrompt(prompt);
      const cleaned = cleanAiResponse(aiText);

      // Parse title
      const titleMatch = cleaned.match(/TITULO_COMPILACAO:\s*(.+?)(?:\n|$)/i);
      if (titleMatch?.[1]) {
        const sundayTitle: TitleOption[] = [
          { text: titleMatch[1].trim(), style: 'impacto' },
        ];
        updateMaterial(mat.id, { title_options_json: sundayTitle as any, selected_title_index: 0 });
      }

      // Parse description (everything after the title line)
      let html = cleaned.replace(/TITULO_COMPILACAO:\s*.+?\n/i, '').trim();
      if (!html.startsWith('<')) {
        html = `<p>${html.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br />')}</p>`;
      }

      // Apply fixed template if available
      const template = settings.description_template_html || '';
      if (template) {
        const selectedTitle = titleMatch?.[1]?.trim() || getTitle(mat) || 'Compilação Semanal';
        html = template
          .replace(/<<<title>>>/g, selectedTitle)
          .replace(/<<<generated content>>>/g, html);
      }

      const brandBlock = getPromptText('material_brand_block', promptOverrides);
      if (!html.includes('Heavynauta')) {
        html = `${html}\n${brandBlock}`;
      }

      updateMaterial(mat.id, { description_html: html });
      toast.success('Compilação semanal gerada com IA');
    } catch (err: any) {
      console.error('Sunday generation error:', err);
      toast.error(err.message || 'Erro ao gerar compilação');
    } finally {
      setGeneratingDescriptions((prev) => {
        const next = new Set(prev);
        next.delete(mat.id);
        return next;
      });
    }
  };

  const handleBulkTitles = async () => {
    const readyMaterials = weekMaterials.filter((m) => isPautaReady(m) && m.slot_key !== 'sunday');
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

  const handleBulkDescriptions = async () => {
    const readyMaterials = weekMaterials.filter((m) => isPautaReady(m) || m.slot_key === 'sunday');
    if (readyMaterials.length === 0) {
      toast.warning('Nenhum episódio pronto para gerar descrições');
      return;
    }

    setGeneratingAllDescriptions(true);
    for (const mat of readyMaterials) {
      await generateDescriptionAI(mat.id);
    }
    setGeneratingAllDescriptions(false);
    toast.success('Geração de descrições concluída');
  };

  const handleExportMaterials = (format: 'json' | 'clipboard' | 'per-episode') => {
    if (format === 'per-episode') {
      weekMaterials.forEach((mat) => {
        const content = `Título: ${getTitle(mat)}\nDescrição: ${mat.description_html || ''}\nSpotify: ${mat.spotify_link || 'Não agendado'}`;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `material_${mat.slot_key}_${mat.episode_date}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      });
      return;
    }

    const data = weekMaterials.map((mat) => ({
      slot: mat.slot_key,
      date: mat.episode_date,
      title: getTitle(mat),
      description: mat.description_html,
      cover: mat.cover_url ? '(gerada)' : null,
      spotify: mat.spotify_link,
    }));

    if (format === 'clipboard') {
      const text = data.map((item) => `${item.slot} (${item.date}): ${item.title}\n${item.description || 'Sem descrição'}`).join('\n\n---\n\n');
      navigator.clipboard.writeText(text);
      toast.success('Copiado para clipboard');
      return;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `materiais_${selectedWeek?.start_date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const matLight = (mat: Pick<EpisodeMaterial, 'selected_title_index' | 'description_html' | 'cover_url' | 'spotify_link'>) => {
    const count = [mat.selected_title_index != null, !!mat.description_html, !!mat.cover_url, !!mat.spotify_link].filter(Boolean).length;
    if (count >= 3) return 'bg-primary';
    if (count >= 1) return 'bg-secondary';
    return 'bg-muted-foreground';
  };

  if (weeks.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Palette className="h-6 w-6 text-primary" />
            Materiais
          </h1>
          <p className="mt-1 text-muted-foreground">Títulos, descrições e capas dos episódios</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Palette className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <p className="text-muted-foreground">Crie uma semana na aba Pautas primeiro.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Palette className="h-6 w-6 text-primary" />
            Materiais
          </h1>
          <p className="mt-1 text-muted-foreground">Títulos, descrições e capas dos episódios</p>
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
        <div className="flex flex-wrap gap-2">
          {weeks.map((week) => (
            <Button key={week.id} variant={selectedWeek?.id === week.id ? 'default' : 'outline'} size="sm" onClick={() => setSelectedWeekId(week.id)}>
              {new Date(`${week.start_date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </Button>
          ))}
        </div>
      )}

      {selectedWeek && weekMaterials.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16">
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
                  {generatingAllTitles ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                  {generatingAllTitles ? 'Gerando...' : 'Gerar Todos (IA)'}
                </Button>
              }
              renderDay={(day) => {
                const mat = weekMaterials.find((material) => material.slot_key === day.key);
                if (!mat) return null;

                const opts = getTitleOptions(mat);
                const ready = isPautaReady(mat);
                const isGenerating = generatingTitles.has(mat.id);

                return (
                  <div className="space-y-3">
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${matLight(mat)}`} />
                      <span className="text-[10px] text-muted-foreground">{mat.episode_date}</span>
                      <Badge variant={ready ? 'secondary' : 'outline'} className="text-[9px]">
                        {ready ? 'Pauta pronta' : 'Aguardando pauta'}
                      </Badge>
                    </div>

                    <Button size="sm" variant={opts.length > 0 ? 'outline' : 'default'} className="w-full gap-2 text-xs" onClick={() => generateTitlesAI(mat.id)} disabled={!ready || isGenerating}>
                      {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : opts.length > 0 ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {isGenerating ? 'Gerando títulos...' : opts.length > 0 ? 'Regenerar títulos' : 'Gerar títulos'}
                    </Button>

                    {opts.length > 0 ? (
                      opts.map((opt, index) => (
                        <button
                          key={`${opt.style}-${index}`}
                          className={`w-full rounded-md border p-2 text-left text-xs transition-colors ${
                            mat.selected_title_index === index ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-primary/30'
                          }`}
                          onClick={() => selectTitle(mat.id, index)}
                        >
                          <Badge variant="secondary" className="mb-1 text-[9px]">{opt.style}</Badge>
                          <p>{opt.text}</p>
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">Sem títulos gerados</p>
                    )}

                    {mat.selected_title_index != null && (
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-2">
                        <p className="text-[10px] font-medium text-primary">Selecionado</p>
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
              actions={
                <Button size="sm" onClick={handleBulkDescriptions} disabled={generatingAllDescriptions}>
                  {generatingAllDescriptions ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                  {generatingAllDescriptions ? 'Gerando...' : 'Gerar Todas'}
                </Button>
              }
              renderDay={(day) => {
                const mat = weekMaterials.find((material) => material.slot_key === day.key);
                if (!mat) return null;
                const isSunday = day.key === 'sunday';
                const ready = isPautaReady(mat);
                const isGenerating = generatingDescriptions.has(mat.id);

                return (
                  <div className="space-y-2">
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${matLight(mat)}`} />
                      <span className="text-[10px] text-muted-foreground">{mat.episode_date}</span>
                      <Badge variant={ready || isSunday ? 'secondary' : 'outline'} className="text-[9px]">
                        {isSunday ? 'Resumo semanal' : ready ? 'Pauta pronta' : 'Aguardando pauta'}
                      </Badge>
                    </div>

                    <Button
                      size="sm"
                      variant={mat.description_html ? 'outline' : 'default'}
                      className="mb-2 w-full gap-2 text-xs"
                      onClick={() => (isSunday ? generateSundayContent(mat) : generateDescriptionAI(mat.id))}
                      disabled={(!ready && !isSunday) || isGenerating}
                    >
                      {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : mat.description_html ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {isSunday ? 'Compilar semana' : isGenerating ? 'Gerando HTML...' : mat.description_html ? 'Regenerar HTML' : 'Gerar HTML'}
                    </Button>

                    <Textarea
                      className="min-h-[160px] resize-none text-xs"
                      placeholder="Descrição HTML do episódio..."
                      value={mat.description_html || ''}
                      onChange={(e) => updateMaterial(mat.id, { description_html: e.target.value })}
                    />
                  </div>
                );
              }}
            />
          </TabsContent>

          <TabsContent value="covers">
            <WorkspaceShell
              weekLabel="Capas da Semana"
              renderDay={(day) => {
                const mat = weekMaterials.find((material) => material.slot_key === day.key);
                if (!mat) return null;

                return (
                  <div className="space-y-2">
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${matLight(mat)}`} />
                      <span className="text-[10px] text-muted-foreground">{mat.episode_date}</span>
                    </div>
                    {mat.cover_url ? (
                      <div className="space-y-2">
                        <img src={mat.cover_url} alt={`Capa do episódio ${getTitle(mat) || day.label}`} className="aspect-square w-full rounded-md object-cover" />
                        <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => openCoverCreator(day.key)}>
                          Refazer Capa
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" className="flex h-24 w-full flex-col gap-2" onClick={() => openCoverCreator(day.key)}>
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

      <Dialog open={coverDialogOpen} onOpenChange={setCoverDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Criar Capa</DialogTitle>
            <DialogDescription>A busca agora usa contexto real da pauta para sugerir imagens melhores.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {coverDaySlot && (
              <div className="space-y-1.5">
                <Label>Busca sugerida a partir da pauta</Label>
                <Input readOnly value={buildCoverSearchQuery(coverDaySlot)} />
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  if (!coverDaySlot) return;
                  const query = encodeURIComponent(buildCoverSearchQuery(coverDaySlot));
                  window.open(`https://images.google.com/search?q=${query}&tbm=isch`, '_blank');
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" /> Buscar Imagens
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>URL da Imagem</Label>
              <Input placeholder="Cole aqui a URL da imagem..." value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
            </div>
            {imageUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <img src={imageUrl} alt="Preview" className="aspect-video w-full rounded-md bg-muted object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
              </div>
            )}
            <Button onClick={generateCover} disabled={!imageUrl} className="w-full gap-2">
              <Sparkles className="h-4 w-4" /> Gerar Capa
            </Button>
            {coverPreview && (
              <div className="space-y-2">
                <Label>Preview da Capa</Label>
                <img src={coverPreview} alt="Capa final" className="mx-auto aspect-square w-full rounded-lg border border-border shadow-md" />
                <p className="text-center text-xs text-muted-foreground">3000 × 3000 px • PNG</p>
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
