/**
 * PromptBuilderRegistry — snakepit.manual.v1
 *
 * 6 famílias de prompt:
 *   1. build_week_prompt       — semana inteira
 *   2. build_day_prompt        — dia isolado
 *   3. build_section_prompt    — seção isolada
 *   4. build_material_titles_prompt   — títulos de materiais
 *   5. build_material_descriptions_prompt — descrições HTML
 *   6. build_tone_probe_prompt — laboratório de tom
 */

import { Pauta, Release, EpisodeMaterial, DaySlot, AppSettings } from './types';
import { getSectionsForDay, WEEKDAY_SECTIONS, SATURDAY_SECTIONS } from './constants';

// ─── Constants ───────────────────────────────────────────────────────────────

export const PROMPT_SCHEMA_VERSION = 'snakepit.manual.v1';
export const MIN_LONGFORM_SECTION_WORDS = 500;
export const DEFAULT_BRAND_TONE_TEMPERATURE = 55;

// ─── Tone profiles ──────────────────────────────────────────────────────────

export interface ToneProfile {
  label: string;
  description: string;
  style_directives: string[];
}

export function toneProfileForTemperature(temp: number): ToneProfile {
  if (temp <= 20) return {
    label: 'Cirúrgico',
    description: 'Extremamente preciso e direto. Mínimo de adjetivos, foco absoluto em dados e fatos.',
    style_directives: [
      'Use frases curtas e declarativas',
      'Evite adjetivos e advérbios desnecessários',
      'Priorize dados, datas e fatos verificáveis',
      'Tom jornalístico frio e objetivo',
    ],
  };
  if (temp <= 40) return {
    label: 'Sóbrio',
    description: 'Informativo e equilibrado. Tom jornalístico respeitoso com toques de personalidade.',
    style_directives: [
      'Tom informativo com autoridade',
      'Permita adjetivos moderados quando justificados',
      'Mantenha distância editorial sem ser impessoal',
      'Pode usar uma ou duas expressões de entusiasmo por bloco',
    ],
  };
  if (temp <= 60) return {
    label: 'Equilibrado',
    description: 'Informativo com personalidade. O padrão Heavynauta — preciso mas envolvente.',
    style_directives: [
      'Equilíbrio entre informação e entretenimento',
      'Use linguagem acessível mas precisa',
      'Permita entusiasmo genuíno quando o conteúdo merece',
      'Pode usar metáforas e comparações musicais',
      'Tom de conversa entre conhecedores',
    ],
  };
  if (temp <= 80) return {
    label: 'Quente',
    description: 'Empolgante e envolvente. Paixão pelo metal evidente em cada frase.',
    style_directives: [
      'Demonstre paixão evidente pelo assunto',
      'Use linguagem mais visceral e expressiva',
      'Permita exclamações e ênfases',
      'Pode usar gírias e expressões do universo metal',
      'Tom de entusiasta falando com amigos',
    ],
  };
  return {
    label: 'Incendiário',
    description: 'Máximo entusiasmo e energia. Linguagem visceral, intensa e arrebatadora.',
    style_directives: [
      'Máxima intensidade em cada frase',
      'Use linguagem visceral e impactante',
      'Permita hipérboles controladas',
      'Exclamações e ênfases são bem-vindas',
      'Tom de fã apaixonado que sabe do que fala',
      'Pode usar metáforas extremas do universo metal',
    ],
  };
}

// ─── Section playbooks ───────────────────────────────────────────────────────

function sectionPlaybook(section: string): string[] {
  switch (section) {
    case 'anniversary':
      return [
        'Gere a efeméride principal do dia com base no aniversário manual.',
        'Exige entrada no formato "Banda - Álbum" em raw_inputs.anniversary_target.',
        'Use anniversary_notes como direção editorial complementar.',
        'Pesquise amplamente: contexto histórico, recepção, impacto cultural.',
        'Abertura obrigatória: comece com a data e o fato celebrado.',
        `Mínimo de ${MIN_LONGFORM_SECTION_WORDS} palavras.`,
        'Se links de catálogo existirem, inclua bloco com YouTube, Spotify, Deezer e Metal Archives.',
        'Se input vier inválido ou ausente, use fallback honesto explicando a ausência.',
      ];
    case 'review_rafa':
      return [
        'Gere review pesquisado e granular para o disco selecionado.',
        'Use raw_inputs.review_rafa_release como alvo.',
        'Use review_rafa_notes como briefing complementar.',
        `Mínimo de ${MIN_LONGFORM_SECTION_WORDS} palavras.`,
        'Subestrutura sugerida: gênero, recepção, curiosidades, tema do disco.',
        'Exige links de catálogo do release focal.',
        'Se o release não estiver definido, use fallback honesto.',
      ];
    case 'news':
      return [
        'Transforme a notícia do dia em matéria aprofundada.',
        'Âncora primária em sources.news_items.',
        'Aceite ampliação por pesquisa online.',
        'Use news_notes como enquadramento editorial.',
        'Foque em uma única matéria do dia.',
        'Estrutura sugerida: título, subtítulo, o que aconteceu, envolvidos e quotes.',
        `Mínimo de ${MIN_LONGFORM_SECTION_WORDS} palavras.`,
      ];
    case 'review_kilton':
      return [
        'Gere análise aprofundada do disco com contexto, expectativa e relevância.',
        'Use raw_inputs.review_kilton_release como alvo.',
        'Use review_kilton_notes como ajuste de foco.',
        `Mínimo de ${MIN_LONGFORM_SECTION_WORDS} palavras.`,
        'Estrutura sugerida: contextualização, expectativas, citações, relevância e fontes.',
        'Exige links de catálogo do release.',
        'Se o release não estiver definido, use fallback honesto.',
      ];
    case 'next_week_releases':
      return [
        'Monte a seção de sábado com destaques da semana e demais lançamentos.',
        'Use raw_inputs.weekly_release_pool como grade completa.',
        'Use raw_inputs.selected_releases como destaques escolhidos manualmente.',
        'Separe obrigatoriamente em:',
        '  - ### Destaques da Semana',
        '  - ### Demais Lançamentos da Semana',
        'Exige links de catálogo para cada release citado.',
        `Mínimo de ${MIN_LONGFORM_SECTION_WORDS} palavras para a parte de destaque.`,
      ];
    default:
      return [];
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPautaSlot(pauta: Pauta): DaySlot {
  const d = new Date(pauta.publication_date + 'T12:00:00');
  const wd = d.getDay();
  const map: Record<number, DaySlot> = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };
  return map[wd] || 'monday';
}

function slotLabel(slot: DaySlot): string {
  const labels: Record<DaySlot, string> = {
    monday: 'Segunda-feira', tuesday: 'Terça-feira', wednesday: 'Quarta-feira',
    thursday: 'Quinta-feira', friday: 'Sexta-feira', saturday: 'Sábado', sunday: 'Domingo',
  };
  return labels[slot];
}

interface DayPayload {
  publication_date: string;
  display_date: string;
  pauta_label: string;
  is_saturday: boolean;
  is_sunday: boolean;
  required_sections: { key: string; label: string }[];
  current_sections: Record<string, string>;
  raw_inputs: Record<string, any>;
  sources: { news_items?: string[]; warnings?: string[] };
  formula_farois: Record<string, string>;
}

function buildDayPayload(
  pauta: Pauta,
  releases: Release[],
): DayPayload {
  const slot = getPautaSlot(pauta);
  const sections = getSectionsForDay(slot);
  const inputs = (pauta.raw_inputs_json || {}) as Record<string, any>;
  const currentSections = (pauta.sections_json || {}) as Record<string, string>;

  // Build sources
  const sources: DayPayload['sources'] = {};
  if (inputs.news_link) {
    sources.news_items = [inputs.news_link];
  }

  // Build farois
  const farois: Record<string, string> = {};
  if (slot !== 'saturday' && slot !== 'sunday') {
    farois['Farol Aniversário'] = inputs.anniversary ? 'ready' : 'missing';
    const rafaRelease = inputs.review_rafa_id ? releases.find(r => r.id === inputs.review_rafa_id) : null;
    farois['Farol Rafa'] = rafaRelease ? 'ready' : 'missing';
    farois['Farol Notícias'] = inputs.news_link ? 'ready' : 'missing';
    const kiltonRelease = inputs.review_kilton_id ? releases.find(r => r.id === inputs.review_kilton_id) : null;
    farois['Farol Kilton'] = kiltonRelease ? 'ready' : 'missing';
  }
  if (slot === 'saturday') {
    farois['Farol Aniversário'] = inputs.anniversary ? 'ready' : 'missing';
    farois['Farol Lançamentos'] = inputs.selected_release_ids?.length > 0 ? 'ready' : 'missing';
  }

  // Master farol
  const allReady = Object.values(farois).every(v => v === 'ready');
  const anyMissing = Object.values(farois).some(v => v === 'missing');
  farois['Farol Master'] = allReady ? 'ready' : anyMissing ? 'attention' : 'caution';

  // Enrich raw_inputs with resolved releases
  const enrichedInputs = { ...inputs };
  if (inputs.review_rafa_id) {
    const rel = releases.find(r => r.id === inputs.review_rafa_id);
    if (rel) enrichedInputs.review_rafa_release = `${rel.artist} - ${rel.album} (${rel.release_date})`;
  }
  if (inputs.review_kilton_id) {
    const rel = releases.find(r => r.id === inputs.review_kilton_id);
    if (rel) enrichedInputs.review_kilton_release = `${rel.artist} - ${rel.album} (${rel.release_date})`;
  }
  if (inputs.selected_release_ids?.length) {
    enrichedInputs.selected_releases = releases
      .filter(r => inputs.selected_release_ids.includes(r.id))
      .map(r => `${r.artist} - ${r.album} (${r.release_date})`);
  }

  return {
    publication_date: pauta.publication_date,
    display_date: new Date(pauta.publication_date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }),
    pauta_label: `Pauta ${slotLabel(slot)}`,
    is_saturday: slot === 'saturday',
    is_sunday: slot === 'sunday',
    required_sections: [...sections],
    current_sections: currentSections,
    raw_inputs: enrichedInputs,
    sources,
    formula_farois: farois,
  };
}

// ─── Block renderers ─────────────────────────────────────────────────────────

function renderCommonInstructions(bannedTerms: string[]): string {
  let text = `INSTRUÇÕES GLOBAIS DO PROTOCOLO SNAKEPIT
=========================================
- Responda APENAS com um bloco <snakepit_response> válido.
- Use schema_version="${PROMPT_SCHEMA_VERSION}".
- NÃO escreva texto fora do contrato.
- NÃO invente tags extras além das especificadas.
- Siga rigorosamente a identidade editorial do Heavynauta.
- Respeite o tom configurado no app.
- Nunca invente fatos, datas, quotes ou créditos técnicos.
- Se faltar insumo, use fallback honesto explicando a ausência.
- Seções densas precisam de no mínimo ${MIN_LONGFORM_SECTION_WORDS} palavras.
- Intro e Outro existem na pauta, mas NÃO entram no contrato — são tratados localmente.`;

  if (bannedTerms.length > 0) {
    text += `\n\nTERMOS BANIDOS (nunca use estas palavras/expressões):\n${bannedTerms.map(t => `- ${t}`).join('\n')}`;
  }
  return text;
}

function renderHeavynautaBrandVoice(tone: ToneProfile, temperature: number): string {
  return `IDENTIDADE EDITORIAL HEAVYNAUTA
================================
Público-alvo: Comunidade metal brasileira — de iniciantes curiosos a veteranos de mosh pit.
Missão: Informar com profundidade, entreter com autenticidade, conectar a comunidade.
Promessa editorial: Papo Sério Sobre Música Pesada.
Framework: Descobrir → Aprofundar → Conectar

Valores:
- Precisão factual acima de tudo
- Respeito a todos os subgêneros (death, black, doom, thrash, power, prog, etc.)
- Linguagem acessível mas informada
- Tom firme mas acolhedor
- Audio-first: o texto será lido em voz alta — priorize fluidez oral

Restrições permanentes:
- Nunca desmerecer gêneros ou bandas
- Nunca inventar informações
- Nunca usar linguagem excludente
- Nunca fazer clickbait enganoso

TOM EDITORIAL ATIVO: ${tone.label} (temperatura: ${temperature}/100)
${tone.description}

Diretivas de estilo:
${tone.style_directives.map(d => `- ${d}`).join('\n')}`;
}

function renderGlobalPlaybookRules(): string {
  return `REGRAS GLOBAIS DE PLAYBOOK
==========================
- O que antes era code block no Notion vira texto direto dentro da tag correta.
- Update de subpágina do Notion é reinterpretado como preencher a section certa.
- O modelo deve espelhar a lógica das fórmulas do Snakepit/Notion.
- Cada seção deve ter profundidade editorial real, não resumos rasos.
- Links de catálogo em formato markdown: [YouTube](...) | [Spotify](...) | [Deezer](...) | [Metal Archives](...)`;
}

function renderSectionPlaybooks(sections: { key: string; label: string }[]): string {
  return sections.map(s => {
    const rules = sectionPlaybook(s.key);
    if (rules.length === 0) return '';
    return `PLAYBOOK: ${s.label.toUpperCase()} (${s.key})\n${rules.map(r => `  - ${r}`).join('\n')}`;
  }).filter(Boolean).join('\n\n');
}

function renderContextXml(payload: DayPayload): string {
  const lines: string[] = ['<context>'];

  lines.push(`  <publication_date>${payload.publication_date}</publication_date>`);
  lines.push(`  <display_date>${payload.display_date}</display_date>`);
  lines.push(`  <pauta_label>${payload.pauta_label}</pauta_label>`);
  lines.push(`  <is_saturday>${payload.is_saturday}</is_saturday>`);

  // Raw inputs
  lines.push('  <raw_inputs>');
  for (const [k, v] of Object.entries(payload.raw_inputs)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      lines.push(`    <${k}>`);
      v.forEach((item: any) => lines.push(`      <item>${item}</item>`));
      lines.push(`    </${k}>`);
    } else {
      lines.push(`    <${k}>${v}</${k}>`);
    }
  }
  lines.push('  </raw_inputs>');

  // Sources
  if (payload.sources.news_items?.length) {
    lines.push('  <sources>');
    payload.sources.news_items.forEach(url => lines.push(`    <news_item url="${url}" />`));
    if (payload.sources.warnings?.length) {
      payload.sources.warnings.forEach(w => lines.push(`    <warning>${w}</warning>`));
    }
    lines.push('  </sources>');
  }

  // Current sections (for merge context)
  const filled = Object.entries(payload.current_sections).filter(([, v]) => v?.trim());
  if (filled.length > 0) {
    lines.push('  <current_sections>');
    filled.forEach(([k, v]) => {
      lines.push(`    <section name="${k}">${v.slice(0, 200)}${v.length > 200 ? '...' : ''}</section>`);
    });
    lines.push('  </current_sections>');
  }

  // Farois
  lines.push('  <formula_farois>');
  for (const [k, v] of Object.entries(payload.formula_farois)) {
    lines.push(`    <farol name="${k}" status="${v}" />`);
  }
  lines.push('  </formula_farois>');

  lines.push('</context>');
  return lines.join('\n');
}

// ─── Contract generators ────────────────────────────────────────────────────

function weekContractHtml(dayPayloads: DayPayload[]): string {
  const days = dayPayloads.map(dp => {
    const sectionTags = dp.required_sections
      .map(s => `    <section name="${s.key}">...[conteúdo da seção ${s.label}]...</section>`)
      .join('\n');
    return `  <day publication_date="${dp.publication_date}">\n${sectionTags}\n  </day>`;
  }).join('\n');

  return `CONTRATO DE RESPOSTA OBRIGATÓRIO
==================================
Responda EXATAMENTE neste formato:

<snakepit_response schema_version="${PROMPT_SCHEMA_VERSION}" scope="week">
  <target week_start="YYYY-MM-DD"></target>
${days}
</snakepit_response>

IMPORTANTE:
- Inclua TODOS os dias listados acima
- Inclua TODAS as seções obrigatórias de cada dia
- NÃO adicione seções extras (intro e outro são locais)
- Cada seção densa deve ter no mínimo ${MIN_LONGFORM_SECTION_WORDS} palavras`;
}

function dayContractHtml(payload: DayPayload): string {
  const sectionTags = payload.required_sections
    .map(s => `  <section name="${s.key}">...[conteúdo da seção ${s.label}]...</section>`)
    .join('\n');

  return `CONTRATO DE RESPOSTA OBRIGATÓRIO
==================================
Responda EXATAMENTE neste formato:

<snakepit_response schema_version="${PROMPT_SCHEMA_VERSION}" scope="day">
  <target publication_date="${payload.publication_date}"></target>
${sectionTags}
</snakepit_response>

IMPORTANTE:
- Preencha TODAS as seções obrigatórias
- NÃO adicione seções extras
- Cada seção densa deve ter no mínimo ${MIN_LONGFORM_SECTION_WORDS} palavras`;
}

function sectionContractHtml(payload: DayPayload, sectionKey: string, sectionLabel: string): string {
  return `CONTRATO DE RESPOSTA OBRIGATÓRIO
==================================
Responda EXATAMENTE neste formato:

<snakepit_response schema_version="${PROMPT_SCHEMA_VERSION}" scope="section">
  <target publication_date="${payload.publication_date}" section="${sectionKey}"></target>
  <section name="${sectionKey}">...[conteúdo da seção ${sectionLabel}]...</section>
</snakepit_response>

IMPORTANTE:
- Preencha APENAS a seção alvo "${sectionLabel}"
- NÃO inclua outras seções
- A seção deve ter no mínimo ${MIN_LONGFORM_SECTION_WORDS} palavras`;
}

function materialTitlesContractHtml(weekStart: string, slots: { slot: string; date: string }[]): string {
  const episodes = slots.map(s => `  <episode slot="${s.slot}" publication_date="${s.date}">
    <title_option kind="clickbait">...</title_option>
    <title_option kind="curiosidade">...</title_option>
    <title_option kind="impacto">...</title_option>
  </episode>`).join('\n');

  return `CONTRATO DE RESPOSTA OBRIGATÓRIO
==================================
Responda EXATAMENTE neste formato:

<snakepit_response schema_version="${PROMPT_SCHEMA_VERSION}" scope="material_titles">
  <target week_start="${weekStart}"></target>
${episodes}
</snakepit_response>

REGRAS DE TÍTULOS:
- Exatamente 3 opções por episódio (clickbait, curiosidade, impacto)
- Máximo ~60-70 caracteres por título
- Caps lock em no máximo 1-2 palavras
- Nome da banda quando fizer sentido
- No máximo 2 emojis por título
- Nunca usar clickbait enganoso`;
}

function materialDescriptionsContractHtml(weekStart: string, slots: { slot: string; date: string }[]): string {
  const episodes = slots.map(s => `  <episode slot="${s.slot}" publication_date="${s.date}">
    <description_html><p>...</p></description_html>
  </episode>`).join('\n');

  return `CONTRATO DE RESPOSTA OBRIGATÓRIO
==================================
Responda EXATAMENTE neste formato:

<snakepit_response schema_version="${PROMPT_SCHEMA_VERSION}" scope="material_descriptions">
  <target week_start="${weekStart}"></target>
${episodes}
</snakepit_response>

REGRAS DE DESCRIÇÃO:
- HTML válido usando apenas: <p>, <b>, <i>, <a>, <br>, <ul>, <li>
- Use o título selecionado como âncora principal
- Priorize seção "Notícias" quando existir
- Não invente seções ausentes
- Inclua bloco institucional Heavynauta antes dos CTAs
- Inclua bloco final de CTAs (4-7 itens) com emoji + texto + hyperlink
- CTAs obrigatórios: "Ouça onde quiser" + links para YouTube, Spotify, Apple Podcasts, Deezer, Pod.link, Discord, WhatsApp`;
}

// ─── Brand block + CTA block (hardcoded) ─────────────────────────────────────

const MATERIAL_DESCRIPTION_BRAND_BLOCK = `<p><b>Heavynauta — Papo Sério Sobre Música Pesada</b></p>
<p>Diariamente, o Heavynauta traz para você as notícias, reviews e análises mais relevantes do universo do heavy metal e suas vertentes. De clássicos atemporais a lançamentos frescos, nosso compromisso é com a informação de qualidade e a paixão pela música pesada.</p>`;

const MATERIAL_DESCRIPTION_CTA_BLOCK = `BLOCO CTA OBRIGATÓRIO (inclua ao final da descrição):
- 4 a 7 CTAs no formato: emoji + texto curto + hyperlink
- Link obrigatório: "🎧 Ouça onde quiser" → Pod.link
- Destinos fixos: YouTube, Spotify, Apple Podcasts, Deezer, Pod.link, Discord, WhatsApp
- Exemplo:
  🎧 Ouça onde quiser: <a href="https://pod.link/heavynauta">Pod.link</a>
  🎬 Assista no YouTube: <a href="https://youtube.com/@heavynauta">YouTube</a>
  💬 Grupo no Discord: <a href="https://discord.gg/heavynauta">Discord</a>`;

// ─── PUBLIC BUILDERS ─────────────────────────────────────────────────────────

export interface PromptBuildContext {
  settings: AppSettings;
  releases: Release[];
  bannedTerms: string[];
}

/**
 * 1. Prompt semanal de pautas
 */
export function buildWeekPrompt(
  weekStart: string,
  pautas: Pauta[],
  ctx: PromptBuildContext,
): string {
  const tone = toneProfileForTemperature(ctx.settings.brand_tone_temperature);
  const dayPayloads = pautas
    .filter(p => p.pauta_type !== 'sunday')
    .map(p => buildDayPayload(p, ctx.releases));

  const sectionKeys = new Set<string>();
  dayPayloads.forEach(dp => dp.required_sections.forEach(s => sectionKeys.add(s.key)));
  const allSections = [...sectionKeys].map(k => {
    const found = [...WEEKDAY_SECTIONS, ...SATURDAY_SECTIONS].find(s => s.key === k);
    return found || { key: k, label: k };
  });

  const blocks = [
    renderCommonInstructions(ctx.bannedTerms),
    renderHeavynautaBrandVoice(tone, ctx.settings.brand_tone_temperature),
    renderGlobalPlaybookRules(),
    `ESCOPO: SEMANA\nAlvo: week_start = ${weekStart}\nDias incluídos: ${dayPayloads.map(d => d.publication_date).join(', ')}\n\nRegra: preencha TODAS as seções obrigatórias de TODOS os dias da semana.`,
    renderSectionPlaybooks(allSections),
    weekContractHtml(dayPayloads),
    ...dayPayloads.map(dp => `--- CONTEXTO: ${dp.display_date} ---\n${renderContextXml(dp)}`),
  ];

  return blocks.join('\n\n');
}

/**
 * 2. Prompt diário de pauta
 */
export function buildDayPrompt(
  pauta: Pauta,
  ctx: PromptBuildContext,
): string {
  const tone = toneProfileForTemperature(ctx.settings.brand_tone_temperature);
  const payload = buildDayPayload(pauta, ctx.releases);

  const blocks = [
    renderCommonInstructions(ctx.bannedTerms),
    renderHeavynautaBrandVoice(tone, ctx.settings.brand_tone_temperature),
    renderGlobalPlaybookRules(),
    `ESCOPO: DIA\nAlvo: publication_date = ${pauta.publication_date}\n\nRegra: preencha TODAS as seções obrigatórias da pauta alvo.`,
    renderSectionPlaybooks(payload.required_sections),
    dayContractHtml(payload),
    renderContextXml(payload),
  ];

  return blocks.join('\n\n');
}

/**
 * 3. Prompt de seção isolada
 */
export function buildSectionPrompt(
  pauta: Pauta,
  sectionKey: string,
  ctx: PromptBuildContext,
): string {
  const tone = toneProfileForTemperature(ctx.settings.brand_tone_temperature);
  const payload = buildDayPayload(pauta, ctx.releases);
  const section = payload.required_sections.find(s => s.key === sectionKey);
  const sectionLabel = section?.label || sectionKey;

  const blocks = [
    renderCommonInstructions(ctx.bannedTerms),
    renderHeavynautaBrandVoice(tone, ctx.settings.brand_tone_temperature),
    renderGlobalPlaybookRules(),
    `ESCOPO: SEÇÃO ISOLADA\nAlvo: publication_date = ${pauta.publication_date}, section = ${sectionKey}\n\nRegra: preencha SOMENTE a seção alvo "${sectionLabel}". NÃO inclua outras seções.`,
    renderSectionPlaybooks([{ key: sectionKey, label: sectionLabel }]),
    sectionContractHtml(payload, sectionKey, sectionLabel),
    renderContextXml(payload),
  ];

  return blocks.join('\n\n');
}

/**
 * 4. Prompt de títulos de materiais
 */
export function buildMaterialTitlesPrompt(
  weekStart: string,
  materials: EpisodeMaterial[],
  pautas: Pauta[],
  ctx: PromptBuildContext,
  slotKey?: DaySlot,
): string {
  const tone = toneProfileForTemperature(ctx.settings.brand_tone_temperature);
  const filtered = slotKey ? materials.filter(m => m.slot_key === slotKey) : materials;
  const slots = filtered.map(m => ({ slot: m.slot_key, date: m.episode_date }));

  // Build episode payloads with pauta context
  const episodeContexts = filtered.map(m => {
    const pauta = pautas.find(p => p.id === m.source_pauta_id);
    const sections = pauta ? (pauta.sections_json || {}) as Record<string, string> : {};
    const filledSections = Object.entries(sections)
      .filter(([, v]) => v?.trim())
      .map(([k, v]) => `    <editorial_section name="${k}">${v.slice(0, 300)}...</editorial_section>`)
      .join('\n');
    return `  <episode slot="${m.slot_key}" publication_date="${m.episode_date}">
${filledSections || '    <editorial_section name="none">Pauta não disponível</editorial_section>'}
  </episode>`;
  }).join('\n');

  const blocks = [
    `INSTRUÇÕES PARA GERAÇÃO DE TÍTULOS — PROTOCOLO SNAKEPIT
========================================================
- Responda APENAS com um bloco <snakepit_response> válido.
- Use schema_version="${PROMPT_SCHEMA_VERSION}".
- NÃO escreva texto fora do contrato.`,
    renderHeavynautaBrandVoice(tone, ctx.settings.brand_tone_temperature),
    ctx.bannedTerms.length > 0 ? `TERMOS BANIDOS:\n${ctx.bannedTerms.map(t => `- ${t}`).join('\n')}` : '',
    `ESCOPO: TÍTULOS DE MATERIAIS\nAlvo: week_start = ${weekStart}${slotKey ? `, slot = ${slotKey}` : ''}`,
    materialTitlesContractHtml(weekStart, slots),
    `CONTEXTO EDITORIAL DOS EPISÓDIOS\n================================\n<episodes_context>\n${episodeContexts}\n</episodes_context>`,
  ].filter(Boolean);

  return blocks.join('\n\n');
}

/**
 * 5. Prompt de descrições de materiais
 */
export function buildMaterialDescriptionsPrompt(
  weekStart: string,
  materials: EpisodeMaterial[],
  pautas: Pauta[],
  ctx: PromptBuildContext,
  slotKey?: DaySlot,
): string {
  const tone = toneProfileForTemperature(ctx.settings.brand_tone_temperature);
  const filtered = slotKey ? materials.filter(m => m.slot_key === slotKey) : materials;
  const slots = filtered.map(m => ({ slot: m.slot_key, date: m.episode_date }));

  const episodeContexts = filtered.map(m => {
    const pauta = pautas.find(p => p.id === m.source_pauta_id);
    const sections = pauta ? (pauta.sections_json || {}) as Record<string, string> : {};
    const selectedTitle = m.selected_title_index != null && m.title_options_json[m.selected_title_index]
      ? (m.title_options_json[m.selected_title_index] as any)?.text || ''
      : '';

    const filledSections = Object.entries(sections)
      .filter(([, v]) => v?.trim())
      .map(([k, v]) => `    <editorial_section name="${k}">${v.slice(0, 500)}...</editorial_section>`)
      .join('\n');

    return `  <episode slot="${m.slot_key}" publication_date="${m.episode_date}">
    <selected_title>${selectedTitle || 'Sem título selecionado'}</selected_title>
${filledSections || '    <editorial_section name="none">Pauta não disponível</editorial_section>'}
  </episode>`;
  }).join('\n');

  const blocks = [
    `INSTRUÇÕES PARA GERAÇÃO DE DESCRIÇÕES — PROTOCOLO SNAKEPIT
============================================================
- Responda APENAS com um bloco <snakepit_response> válido.
- Use schema_version="${PROMPT_SCHEMA_VERSION}".
- Gere descrição completa em HTML.
- Use apenas tags permitidas: <p>, <b>, <i>, <a>, <br>, <ul>, <li>.
- Use o selected_title como âncora principal quando existir.
- Priorize "Notícias" quando existir como base factual.
- Não invente seções ausentes.
- Não baseie a descrição em apenas um review se houver outros blocos válidos.`,
    renderHeavynautaBrandVoice(tone, ctx.settings.brand_tone_temperature),
    ctx.bannedTerms.length > 0 ? `TERMOS BANIDOS:\n${ctx.bannedTerms.map(t => `- ${t}`).join('\n')}` : '',
    `ESCOPO: DESCRIÇÕES DE MATERIAIS\nAlvo: week_start = ${weekStart}${slotKey ? `, slot = ${slotKey}` : ''}`,
    `BLOCO INSTITUCIONAL OBRIGATÓRIO (incluir antes dos CTAs):\n${MATERIAL_DESCRIPTION_BRAND_BLOCK}`,
    MATERIAL_DESCRIPTION_CTA_BLOCK,
    materialDescriptionsContractHtml(weekStart, slots),
    `CONTEXTO EDITORIAL DOS EPISÓDIOS\n================================\n<episodes_context>\n${episodeContexts}\n</episodes_context>`,
  ].filter(Boolean);

  return blocks.join('\n\n');
}

/**
 * 6. Prompt de laboratório de tom
 */
export function buildToneProbePrompt(settings: AppSettings): string {
  const tone = toneProfileForTemperature(settings.brand_tone_temperature);
  const bannedTerms = settings.banned_terms_text ? settings.banned_terms_text.split('\n').filter(Boolean) : [];

  const baseText = `O Cannibal Corpse lançou seu décimo sexto álbum de estúdio, "Chaos Horrific", em setembro de 2023 pela Metal Blade Records. Produzido por Erik Rutan no Mana Recording Studios, o disco marca a continuação da formação estabilizada com Erik Rutan na guitarra, substituindo Pat O'Brien. O álbum estreou na posição 62 da Billboard 200.`;

  return `LABORATÓRIO DE TOM — HEAVYNAUTA
=================================
${renderHeavynautaBrandVoice(tone, settings.brand_tone_temperature)}

${bannedTerms.length > 0 ? `TERMOS BANIDOS:\n${bannedTerms.map(t => `- ${t}`).join('\n')}\n` : ''}
TAREFA:
Reescreva o texto-base abaixo mantendo 100% do sentido factual, mas aplicando o tom "${tone.label}" (temperatura ${settings.brand_tone_temperature}/100) conforme as diretivas de estilo acima.

TEXTO-BASE:
${baseText}

REGRAS:
- Produza um único parágrafo
- Sem título
- Sem bullets
- Sem metacomentários (não diga "aqui está o texto reescrito")
- Mantenha todos os fatos, datas, nomes e números
- Aplique APENAS a mudança de tom/estilo`;
}
