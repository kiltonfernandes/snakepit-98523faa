/**
 * ResponseParser + MaterialsResponseParser — snakepit.manual.v1
 *
 * Validates and extracts structured data from AI responses
 * following the Snakepit contract format.
 */

import { PROMPT_SCHEMA_VERSION } from './prompt-builder';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParseResult {
  success: boolean;
  error?: string;
  scope?: string;
  target?: Record<string, string>;
}

export interface PautaParseResult extends ParseResult {
  /** scope = 'week': Record<publication_date, Record<section_name, content>> */
  days?: Record<string, Record<string, string>>;
  /** scope = 'day' | 'section': Record<section_name, content> */
  sections?: Record<string, string>;
}

export interface TitleOption {
  kind: string;
  text: string;
}

export interface MaterialTitlesParseResult extends ParseResult {
  episodes?: Record<string, TitleOption[]>; // slot → options
}

export interface MaterialDescriptionsParseResult extends ParseResult {
  episodes?: Record<string, string>; // slot → html
}

// ─── Aliases ─────────────────────────────────────────────────────────────────

const ROOT_ALIASES = ['snakepit_response', 'snakepitresponse', 'response'];
const TARGET_ALIASES = ['target', 'alvo'];
const DAY_ALIASES = ['day', 'pauta', 'dia'];
const SECTION_ALIASES = ['section', 'secao', 'seção', 'bloco'];
const SECTION_NAME_ALIASES: Record<string, string> = {
  'noticias': 'news',
  'notícias': 'news',
  'lancamentos_da_semana': 'next_week_releases',
  'lançamentos_da_semana': 'next_week_releases',
  'lancamentos': 'next_week_releases',
  'reviewrafa': 'review_rafa',
  'review_rafa': 'review_rafa',
  'reviewkilton': 'review_kilton',
  'review_kilton': 'review_kilton',
  'aniversario': 'anniversary',
  'aniversário': 'anniversary',
  'anniversary': 'anniversary',
  'news': 'news',
  'next_week_releases': 'next_week_releases',
};

const TITLE_KIND_ALIASES: Record<string, string> = {
  'clickbait': 'clickbait',
  'click_bait': 'clickbait',
  'curiosidade': 'curiosidade',
  'curiosity': 'curiosidade',
  'impacto': 'impacto',
  'impact': 'impacto',
};

// ─── XML-like parser helpers ─────────────────────────────────────────────────

function extractRoot(text: string): string | null {
  // Try to find the snakepit_response block
  for (const alias of ROOT_ALIASES) {
    const pattern = new RegExp(`<${alias}[^>]*>([\\s\\S]*?)</${alias}>`, 'i');
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function extractAttribute(tag: string, attr: string): string | null {
  const pattern = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, 'i');
  const match = tag.match(pattern);
  return match ? match[1] : null;
}

function extractRootAttributes(rootBlock: string): { schemaVersion: string | null; scope: string | null } {
  const openTag = rootBlock.match(/<[^>]+>/)?.[0] || '';
  return {
    schemaVersion: extractAttribute(openTag, 'schema_version'),
    scope: extractAttribute(openTag, 'scope'),
  };
}

function extractTagContent(text: string, tagName: string): { attrs: string; content: string }[] {
  const results: { attrs: string; content: string }[] = [];
  const aliases = tagName === 'day' ? DAY_ALIASES
    : tagName === 'section' ? SECTION_ALIASES
    : tagName === 'target' ? TARGET_ALIASES
    : [tagName];

  for (const alias of aliases) {
    const pattern = new RegExp(`<${alias}([^>]*)>([\\s\\S]*?)</${alias}>`, 'gi');
    let match;
    while ((match = pattern.exec(text)) !== null) {
      results.push({ attrs: match[1], content: match[2].trim() });
    }
  }
  return results;
}

function normalizeSectionName(name: string): string {
  const lower = name.toLowerCase().trim();
  return SECTION_NAME_ALIASES[lower] || lower;
}

function normalizeKind(kind: string): string {
  const lower = kind.toLowerCase().trim();
  return TITLE_KIND_ALIASES[lower] || lower;
}

// ─── Pauta Response Parser ──────────────────────────────────────────────────

export function parsePautaResponse(
  responseText: string,
  expectedScope: 'week' | 'day' | 'section',
  expectedTarget: Record<string, string>,
  requiredSections?: string[],
): PautaParseResult {
  // 1. Extract root
  const rootBlock = extractRoot(responseText);
  if (!rootBlock) {
    return { success: false, error: 'Root <snakepit_response> não encontrado na resposta.' };
  }

  // 2. Validate schema_version
  const { schemaVersion, scope } = extractRootAttributes(rootBlock);
  if (schemaVersion && schemaVersion !== PROMPT_SCHEMA_VERSION) {
    return { success: false, error: `schema_version inválido: "${schemaVersion}". Esperado: "${PROMPT_SCHEMA_VERSION}".` };
  }

  // 3. Validate scope
  if (scope && scope !== expectedScope) {
    return { success: false, error: `Scope inválido: "${scope}". Esperado: "${expectedScope}".` };
  }

  // 4. Validate target
  const targets = extractTagContent(rootBlock, 'target');
  if (targets.length > 0) {
    const targetAttrs = targets[0].attrs;
    for (const [key, val] of Object.entries(expectedTarget)) {
      const found = extractAttribute(`<target${targetAttrs}>`, key);
      if (found && found !== val) {
        return { success: false, error: `Alvo incompatível: ${key}="${found}", esperado "${val}".` };
      }
    }
  }

  // 5. Parse based on scope
  if (expectedScope === 'week') {
    return parseWeekScope(rootBlock, requiredSections);
  } else if (expectedScope === 'day') {
    return parseDaySections(rootBlock, requiredSections);
  } else {
    return parseSingleSection(rootBlock, expectedTarget.section, requiredSections);
  }
}

function parseWeekScope(rootBlock: string, _requiredSections?: string[]): PautaParseResult {
  const days = extractTagContent(rootBlock, 'day');
  if (days.length === 0) {
    return { success: false, error: 'Nenhum <day> encontrado na resposta semanal.' };
  }

  const result: Record<string, Record<string, string>> = {};

  for (const day of days) {
    const pubDate = extractAttribute(`<day${day.attrs}>`, 'publication_date');
    if (!pubDate) {
      return { success: false, error: 'Um <day> sem publication_date na resposta.' };
    }

    const sections = extractTagContent(day.content, 'section');
    const sectionMap: Record<string, string> = {};

    for (const sec of sections) {
      const name = extractAttribute(`<section${sec.attrs}>`, 'name');
      if (!name) continue;
      const normalized = normalizeSectionName(name);
      if (sec.content.trim()) {
        sectionMap[normalized] = sec.content.trim();
      }
    }

    if (Object.keys(sectionMap).length === 0) {
      return { success: false, error: `Dia ${pubDate}: nenhuma seção encontrada.` };
    }

    result[pubDate] = sectionMap;
  }

  return { success: true, scope: 'week', days: result };
}

function parseDaySections(rootBlock: string, requiredSections?: string[]): PautaParseResult {
  const sections = extractTagContent(rootBlock, 'section');
  const sectionMap: Record<string, string> = {};

  for (const sec of sections) {
    const name = extractAttribute(`<section${sec.attrs}>`, 'name');
    if (!name) continue;
    const normalized = normalizeSectionName(name);
    if (sec.content.trim()) {
      sectionMap[normalized] = sec.content.trim();
    }
  }

  if (Object.keys(sectionMap).length === 0) {
    return { success: false, error: 'Nenhuma seção encontrada na resposta.' };
  }

  // Check required sections
  if (requiredSections) {
    const missing = requiredSections.filter(s => !sectionMap[s]?.trim());
    if (missing.length > 0) {
      return { success: false, error: `Seções faltando: ${missing.join(', ')}` };
    }
  }

  return { success: true, scope: 'day', sections: sectionMap };
}

function parseSingleSection(rootBlock: string, targetSection?: string, _requiredSections?: string[]): PautaParseResult {
  const sections = extractTagContent(rootBlock, 'section');

  if (sections.length === 0) {
    return { success: false, error: 'Nenhuma seção encontrada na resposta.' };
  }

  // For section scope, accept only the target section
  const sectionMap: Record<string, string> = {};

  for (const sec of sections) {
    const name = extractAttribute(`<section${sec.attrs}>`, 'name');
    if (!name) continue;
    const normalized = normalizeSectionName(name);

    if (targetSection && normalized !== normalizeSectionName(targetSection)) {
      return { success: false, error: `Seção inesperada "${normalized}". Esperada apenas "${targetSection}".` };
    }

    if (!sec.content.trim()) {
      return { success: false, error: `Seção "${normalized}" está vazia.` };
    }

    sectionMap[normalized] = sec.content.trim();
  }

  if (targetSection && !sectionMap[normalizeSectionName(targetSection)]) {
    return { success: false, error: `Seção alvo "${targetSection}" não encontrada ou vazia.` };
  }

  return { success: true, scope: 'section', sections: sectionMap };
}

// ─── Materials Response Parser ──────────────────────────────────────────────

export function parseMaterialTitlesResponse(
  responseText: string,
  expectedSlots: string[],
): MaterialTitlesParseResult {
  const rootBlock = extractRoot(responseText);
  if (!rootBlock) {
    return { success: false, error: 'Root <snakepit_response> não encontrado.' };
  }

  const { schemaVersion, scope } = extractRootAttributes(rootBlock);
  if (schemaVersion && schemaVersion !== PROMPT_SCHEMA_VERSION) {
    return { success: false, error: `schema_version inválido: "${schemaVersion}".` };
  }
  if (scope && scope !== 'material_titles') {
    return { success: false, error: `Scope inválido: "${scope}". Esperado: "material_titles".` };
  }

  const episodes = extractTagContent(rootBlock, 'episode');
  const result: Record<string, TitleOption[]> = {};

  for (const ep of episodes) {
    const slot = extractAttribute(`<episode${ep.attrs}>`, 'slot');
    if (!slot) continue;

    const titleOptions = extractTagContent(ep.content, 'title_option');
    const options: TitleOption[] = [];

    for (const opt of titleOptions) {
      const kind = extractAttribute(`<title_option${opt.attrs}>`, 'kind');
      if (!kind || !opt.content.trim()) continue;
      options.push({ kind: normalizeKind(kind), text: opt.content.trim() });
    }

    if (options.length === 0) {
      return { success: false, error: `Episódio "${slot}": nenhuma opção de título válida.` };
    }

    // Max 3 options
    result[slot] = options.slice(0, 3);
  }

  // Check expected slots
  const missing = expectedSlots.filter(s => !result[s] || result[s].length === 0);
  if (missing.length > 0) {
    return { success: false, error: `Episódios faltando: ${missing.join(', ')}` };
  }

  return { success: true, scope: 'material_titles', episodes: result };
}

export function parseMaterialDescriptionsResponse(
  responseText: string,
  expectedSlots: string[],
): MaterialDescriptionsParseResult {
  const rootBlock = extractRoot(responseText);
  if (!rootBlock) {
    return { success: false, error: 'Root <snakepit_response> não encontrado.' };
  }

  const { schemaVersion, scope } = extractRootAttributes(rootBlock);
  if (schemaVersion && schemaVersion !== PROMPT_SCHEMA_VERSION) {
    return { success: false, error: `schema_version inválido: "${schemaVersion}".` };
  }
  if (scope && scope !== 'material_descriptions') {
    return { success: false, error: `Scope inválido: "${scope}". Esperado: "material_descriptions".` };
  }

  const episodes = extractTagContent(rootBlock, 'episode');
  const result: Record<string, string> = {};

  for (const ep of episodes) {
    const slot = extractAttribute(`<episode${ep.attrs}>`, 'slot');
    if (!slot) continue;

    const descBlocks = extractTagContent(ep.content, 'description_html');
    if (descBlocks.length === 0 || !descBlocks[0].content.trim()) {
      return { success: false, error: `Episódio "${slot}": <description_html> ausente ou vazio.` };
    }

    result[slot] = sanitizeDescriptionHtml(descBlocks[0].content.trim());
  }

  const missing = expectedSlots.filter(s => !result[s]);
  if (missing.length > 0) {
    return { success: false, error: `Episódios faltando: ${missing.join(', ')}` };
  }

  return { success: true, scope: 'material_descriptions', episodes: result };
}

// ─── HTML Sanitizer ─────────────────────────────────────────────────────────

const ALLOWED_TAGS = new Set(['p', 'b', 'i', 'a', 'br', 'ul', 'li', 'strong', 'em']);

function sanitizeDescriptionHtml(html: string): string {
  // Simple sanitizer: remove disallowed tags but keep content
  // Replace <strong> with <b>, <em> with <i>
  let clean = html
    .replace(/<strong([^>]*)>/gi, '<b$1>')
    .replace(/<\/strong>/gi, '</b>')
    .replace(/<em([^>]*)>/gi, '<i$1>')
    .replace(/<\/em>/gi, '</i>');

  // Remove tags not in allowlist (keep content)
  clean = clean.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g, (match, tag) => {
    const lower = tag.toLowerCase();
    if (ALLOWED_TAGS.has(lower)) return match;
    return ''; // Strip disallowed tags
  });

  // For <a> tags, keep only href
  clean = clean.replace(/<a\s+[^>]*>/gi, (match) => {
    const href = match.match(/href\s*=\s*"([^"]*)"/i);
    return href ? `<a href="${href[1]}">` : '<a>';
  });

  return clean.trim();
}
