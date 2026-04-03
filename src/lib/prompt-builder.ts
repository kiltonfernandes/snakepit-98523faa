/**
 * PromptBuilderRegistry — snakepit.manual.v1
 * Token-optimized version with override support.
 */

import { Pauta, Release, EpisodeMaterial, DaySlot, AppSettings } from './types';
import { getSectionsForDay, WEEKDAY_SECTIONS, SATURDAY_SECTIONS } from './constants';
import { getPromptText, type PromptOverrides } from './prompt-defaults';

export const PROMPT_SCHEMA_VERSION = 'snakepit.manual.v1';
export const MIN_LONGFORM_SECTION_WORDS = 500; // legacy default
export const SECTION_WORD_TARGETS: Record<string, number> = {
  anniversary: 200,
  review_rafa: 300,
  review_kilton: 300,
  news: 500,
  next_week_releases: 500,
};
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
    description: 'Preciso e direto. Foco em dados.',
    style_directives: ['Frases curtas e declarativas', 'Evite adjetivos desnecessários', 'Priorize dados e fatos', 'Tom jornalístico objetivo'],
  };
  if (temp <= 40) return {
    label: 'Sóbrio',
    description: 'Informativo e equilibrado.',
    style_directives: ['Tom informativo com autoridade', 'Adjetivos moderados', 'Distância editorial sem ser impessoal', '1-2 expressões de entusiasmo por bloco'],
  };
  if (temp <= 60) return {
    label: 'Equilibrado',
    description: 'O padrão Heavynauta — preciso e envolvente.',
    style_directives: ['Equilíbrio informação/entretenimento', 'Linguagem acessível e precisa', 'Entusiasmo genuíno quando merecido', 'Tom de conversa entre conhecedores'],
  };
  if (temp <= 80) return {
    label: 'Quente',
    description: 'Empolgante. Paixão pelo metal evidente.',
    style_directives: ['Paixão evidente', 'Linguagem visceral', 'Permita exclamações', 'Gírias do universo metal', 'Tom de entusiasta'],
  };
  return {
    label: 'Incendiário',
    description: 'Máxima intensidade e energia.',
    style_directives: ['Máxima intensidade', 'Linguagem visceral e impactante', 'Hipérboles controladas', 'Metáforas extremas do metal'],
  };
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
    monday: 'Segunda', tuesday: 'Terça', wednesday: 'Quarta',
    thursday: 'Quinta', friday: 'Sexta', saturday: 'Sábado', sunday: 'Domingo',
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

function buildDayPayload(pauta: Pauta, releases: Release[]): DayPayload {
  const slot = getPautaSlot(pauta);
  const sections = getSectionsForDay(slot);
  const inputs = (pauta.raw_inputs_json || {}) as Record<string, any>;
  const currentSections = (pauta.sections_json || {}) as Record<string, string>;

  const sources: DayPayload['sources'] = {};
  if (inputs.news_link) sources.news_items = [inputs.news_link];

  const farois: Record<string, string> = {};
  if (slot !== 'saturday' && slot !== 'sunday') {
    farois['anniversary'] = inputs.anniversary ? '✓' : '✗';
    farois['rafa'] = inputs.review_rafa_id ? '✓' : '✗';
    farois['news'] = inputs.news_link ? '✓' : '✗';
    farois['kilton'] = inputs.review_kilton_id ? '✓' : '✗';
  }
  if (slot === 'saturday') {
    farois['anniversary'] = inputs.anniversary ? '✓' : '✗';
    farois['releases'] = inputs.selected_release_ids?.length > 0 ? '✓' : '✗';
  }

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
    display_date: new Date(pauta.publication_date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
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

// ─── Block renderers (token-optimized) ──────────────────────────────────────

function renderInstructions(bannedTerms: string[], overrides: PromptOverrides): string {
  let text = getPromptText('common_instructions', overrides);
  if (bannedTerms.length > 0) {
    text += `\n\nTERMOS BANIDOS:\n${bannedTerms.join(', ')}`;
  }
  return text;
}

function renderBrandVoice(tone: ToneProfile, temperature: number, overrides: PromptOverrides): string {
  const base = getPromptText('brand_voice', overrides);
  return `${base}\n\nTOM: ${tone.label} (${temperature}/100)\n${tone.style_directives.map(d => `- ${d}`).join('\n')}`;
}

function renderPlaybook(overrides: PromptOverrides): string {
  return getPromptText('global_playbook', overrides);
}

function renderSectionPlaybooks(sections: { key: string; label: string }[], overrides: PromptOverrides): string {
  return sections.map(s => {
    const text = getPromptText(`playbook_${s.key}`, overrides);
    if (!text) return '';
    return `[${s.label.toUpperCase()}]\n${text}`;
  }).filter(Boolean).join('\n\n');
}

function renderContextXml(payload: DayPayload): string {
  const lines: string[] = [`<ctx date="${payload.publication_date}" label="${payload.pauta_label}">`];

  // Only non-empty raw inputs (compact)
  const ri = payload.raw_inputs;
  for (const [k, v] of Object.entries(ri)) {
    if (v === undefined || v === null || v === '') continue;
    if (k.endsWith('_id')) continue; // skip IDs, resolved values are present
    if (Array.isArray(v)) {
      lines.push(`  <${k}>${v.join('; ')}</${k}>`);
    } else {
      lines.push(`  <${k}>${v}</${k}>`);
    }
  }

  // Sources (compact)
  if (payload.sources.news_items?.length) {
    lines.push(`  <news_url>${payload.sources.news_items[0]}</news_url>`);
  }

  // Farois (single line)
  const farolStr = Object.entries(payload.formula_farois).map(([k, v]) => `${k}:${v}`).join(' ');
  if (farolStr) lines.push(`  <farois>${farolStr}</farois>`);

  lines.push('</ctx>');
  return lines.join('\n');
}

// ─── Contracts (token-optimized) ────────────────────────────────────────────

function weekContractHtml(dayPayloads: DayPayload[]): string {
  const days = dayPayloads.map(dp => {
    const tags = dp.required_sections.map(s => `    <section name="${s.key}">...</section>`).join('\n');
    return `  <day publication_date="${dp.publication_date}">\n${tags}\n  </day>`;
  }).join('\n');

  return `CONTRATO:
<snakepit_response schema_version="${PROMPT_SCHEMA_VERSION}" scope="week">
  <target week_start="YYYY-MM-DD"></target>
${days}
</snakepit_response>
Todas seções obrigatórias. Mín ${MIN_LONGFORM_SECTION_WORDS} palavras/seção densa.`;
}

function dayContractHtml(payload: DayPayload): string {
  const tags = payload.required_sections.map(s => `  <section name="${s.key}">...</section>`).join('\n');
  return `CONTRATO:
<snakepit_response schema_version="${PROMPT_SCHEMA_VERSION}" scope="day">
  <target publication_date="${payload.publication_date}"></target>
${tags}
</snakepit_response>
Todas seções obrigatórias. Mín ${MIN_LONGFORM_SECTION_WORDS} palavras/seção densa.`;
}

function sectionContractHtml(payload: DayPayload, sectionKey: string, sectionLabel: string): string {
  return `CONTRATO:
<snakepit_response schema_version="${PROMPT_SCHEMA_VERSION}" scope="section">
  <target publication_date="${payload.publication_date}" section="${sectionKey}"></target>
  <section name="${sectionKey}">...</section>
</snakepit_response>
Apenas "${sectionLabel}". Mín ${MIN_LONGFORM_SECTION_WORDS} palavras.`;
}

function materialTitlesContract(weekStart: string, slots: { slot: string; date: string }[]): string {
  const eps = slots.map(s => `  <episode slot="${s.slot}" publication_date="${s.date}">
    <title_option kind="clickbait">...</title_option>
    <title_option kind="curiosidade">...</title_option>
    <title_option kind="impacto">...</title_option>
  </episode>`).join('\n');

  return `CONTRATO:
<snakepit_response schema_version="${PROMPT_SCHEMA_VERSION}" scope="material_titles">
  <target week_start="${weekStart}"></target>
${eps}
</snakepit_response>`;
}

function materialDescriptionsContract(weekStart: string, slots: { slot: string; date: string }[]): string {
  const eps = slots.map(s => `  <episode slot="${s.slot}" publication_date="${s.date}">
    <description_html><p>...</p></description_html>
  </episode>`).join('\n');

  return `CONTRATO:
<snakepit_response schema_version="${PROMPT_SCHEMA_VERSION}" scope="material_descriptions">
  <target week_start="${weekStart}"></target>
${eps}
</snakepit_response>`;
}

// ─── PUBLIC BUILDERS ─────────────────────────────────────────────────────────

export interface PromptBuildContext {
  settings: AppSettings;
  releases: Release[];
  bannedTerms: string[];
}

function getOverrides(ctx: PromptBuildContext): PromptOverrides {
  return (ctx.settings.prompt_overrides_json || {}) as PromptOverrides;
}

export function buildWeekPrompt(weekStart: string, pautas: Pauta[], ctx: PromptBuildContext): string {
  const overrides = getOverrides(ctx);
  const tone = toneProfileForTemperature(ctx.settings.brand_tone_temperature);
  const dayPayloads = pautas.filter(p => p.pauta_type !== 'sunday').map(p => buildDayPayload(p, ctx.releases));

  const sectionKeys = new Set<string>();
  dayPayloads.forEach(dp => dp.required_sections.forEach(s => sectionKeys.add(s.key)));
  const allSections = [...sectionKeys].map(k => {
    const found = [...WEEKDAY_SECTIONS, ...SATURDAY_SECTIONS].find(s => s.key === k);
    return found || { key: k, label: k };
  });

  return [
    renderInstructions(ctx.bannedTerms, overrides),
    renderBrandVoice(tone, ctx.settings.brand_tone_temperature, overrides),
    renderPlaybook(overrides),
    `ESCOPO: SEMANA ${weekStart}\nDias: ${dayPayloads.map(d => d.publication_date).join(', ')}`,
    renderSectionPlaybooks(allSections, overrides),
    weekContractHtml(dayPayloads),
    ...dayPayloads.map(dp => renderContextXml(dp)),
  ].join('\n\n');
}

export function buildDayPrompt(pauta: Pauta, ctx: PromptBuildContext): string {
  const overrides = getOverrides(ctx);
  const tone = toneProfileForTemperature(ctx.settings.brand_tone_temperature);
  const payload = buildDayPayload(pauta, ctx.releases);

  return [
    renderInstructions(ctx.bannedTerms, overrides),
    renderBrandVoice(tone, ctx.settings.brand_tone_temperature, overrides),
    renderPlaybook(overrides),
    `ESCOPO: DIA ${pauta.publication_date}`,
    renderSectionPlaybooks(payload.required_sections, overrides),
    dayContractHtml(payload),
    renderContextXml(payload),
  ].join('\n\n');
}

export function buildSectionPrompt(pauta: Pauta, sectionKey: string, ctx: PromptBuildContext): string {
  const overrides = getOverrides(ctx);
  const tone = toneProfileForTemperature(ctx.settings.brand_tone_temperature);
  const payload = buildDayPayload(pauta, ctx.releases);
  const section = payload.required_sections.find(s => s.key === sectionKey);
  const sectionLabel = section?.label || sectionKey;

  return [
    renderInstructions(ctx.bannedTerms, overrides),
    renderBrandVoice(tone, ctx.settings.brand_tone_temperature, overrides),
    `ESCOPO: SEÇÃO "${sectionLabel}" de ${pauta.publication_date}`,
    renderSectionPlaybooks([{ key: sectionKey, label: sectionLabel }], overrides),
    sectionContractHtml(payload, sectionKey, sectionLabel),
    renderContextXml(payload),
  ].join('\n\n');
}

export function buildMaterialTitlesPrompt(
  weekStart: string, materials: EpisodeMaterial[], pautas: Pauta[], ctx: PromptBuildContext, slotKey?: DaySlot,
): string {
  const overrides = getOverrides(ctx);
  const tone = toneProfileForTemperature(ctx.settings.brand_tone_temperature);
  const filtered = slotKey ? materials.filter(m => m.slot_key === slotKey) : materials;
  const slots = filtered.map(m => ({ slot: m.slot_key, date: m.episode_date }));

  const episodeCtx = filtered.map(m => {
    const pauta = pautas.find(p => p.id === m.source_pauta_id);
    const sections = pauta ? (pauta.sections_json || {}) as Record<string, string> : {};
    const filled = Object.entries(sections).filter(([, v]) => v?.trim())
      .map(([k, v]) => `  <s name="${k}">${v.slice(0, 150)}</s>`).join('\n');
    return `<ep slot="${m.slot_key}" date="${m.episode_date}">\n${filled || '  <s name="none">N/A</s>'}\n</ep>`;
  }).join('\n');

  return [
    renderInstructions(ctx.bannedTerms, overrides),
    renderBrandVoice(tone, ctx.settings.brand_tone_temperature, overrides),
    `ESCOPO: TÍTULOS week=${weekStart}${slotKey ? ` slot=${slotKey}` : ''}`,
    getPromptText('material_titles_instructions', overrides),
    materialTitlesContract(weekStart, slots),
    episodeCtx,
  ].join('\n\n');
}

export function buildMaterialDescriptionsPrompt(
  weekStart: string, materials: EpisodeMaterial[], pautas: Pauta[], ctx: PromptBuildContext, slotKey?: DaySlot,
): string {
  const overrides = getOverrides(ctx);
  const tone = toneProfileForTemperature(ctx.settings.brand_tone_temperature);
  const filtered = slotKey ? materials.filter(m => m.slot_key === slotKey) : materials;
  const slots = filtered.map(m => ({ slot: m.slot_key, date: m.episode_date }));

  const episodeCtx = filtered.map(m => {
    const pauta = pautas.find(p => p.id === m.source_pauta_id);
    const sections = pauta ? (pauta.sections_json || {}) as Record<string, string> : {};
    const selTitle = m.selected_title_index != null && m.title_options_json[m.selected_title_index]
      ? (m.title_options_json[m.selected_title_index] as any)?.text || '' : '';
    const filled = Object.entries(sections).filter(([, v]) => v?.trim())
      .map(([k, v]) => `  <s name="${k}">${v.slice(0, 200)}</s>`).join('\n');
    return `<ep slot="${m.slot_key}" date="${m.episode_date}" title="${selTitle}">\n${filled || '  <s name="none">N/A</s>'}\n</ep>`;
  }).join('\n');

  return [
    renderInstructions(ctx.bannedTerms, overrides),
    renderBrandVoice(tone, ctx.settings.brand_tone_temperature, overrides),
    `ESCOPO: DESCRIÇÕES week=${weekStart}${slotKey ? ` slot=${slotKey}` : ''}`,
    getPromptText('material_descriptions_instructions', overrides),
    `BLOCO INSTITUCIONAL:\n${getPromptText('material_brand_block', overrides)}`,
    materialDescriptionsContract(weekStart, slots),
    episodeCtx,
  ].join('\n\n');
}

export function buildToneProbePrompt(settings: AppSettings): string {
  const tone = toneProfileForTemperature(settings.brand_tone_temperature);
  const overrides = (settings.prompt_overrides_json || {}) as PromptOverrides;
  const bannedTerms = settings.banned_terms_text ? settings.banned_terms_text.split('\n').filter(Boolean) : [];

  const baseText = `O Cannibal Corpse lançou seu décimo sexto álbum de estúdio, "Chaos Horrific", em setembro de 2023 pela Metal Blade Records. Produzido por Erik Rutan no Mana Recording Studios, o disco marca a continuação da formação estabilizada com Erik Rutan na guitarra, substituindo Pat O'Brien. O álbum estreou na posição 62 da Billboard 200.`;

  return `LAB DE TOM — HEAVYNAUTA
${renderBrandVoice(tone, settings.brand_tone_temperature, overrides)}
${bannedTerms.length > 0 ? `\nBANIDOS: ${bannedTerms.join(', ')}\n` : ''}
TAREFA: Reescreva mantendo 100% do sentido factual, aplicando tom "${tone.label}" (${settings.brand_tone_temperature}/100).

TEXTO-BASE:
${baseText}

Regras: Um parágrafo, sem título, sem bullets, sem metacomentários. Mantenha todos os fatos.`;
}
