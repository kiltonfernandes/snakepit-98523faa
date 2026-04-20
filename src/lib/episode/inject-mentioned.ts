/**
 * Helpers to inject (and remove) the "Mencionado neste episódio" section
 * inside the episode description HTML.
 *
 * The section is rendered as:
 *   <h3>🎙️ Mencionado neste episódio</h3>
 *   <ul>...</ul>
 *
 * It is placed BEFORE the institutional Heavynauta block when present,
 * otherwise prepended to the description. Re-inserting replaces any
 * existing block (idempotent).
 */

const SECTION_START_RE =
  /<h3>\s*🎙️\s*Mencionado neste episódio\s*<\/h3>\s*<ul[\s\S]*?<\/ul>/i;

const INSTITUTIONAL_MARKER =
  '<p><b>Heavynauta — Papo Sério Sobre Música Pesada</b></p>';

/**
 * Flexible regex: matches any <p> (with or without <b>) that mentions
 * "Heavynauta" + "Papo Sério" — covers both the strict marker and the
 * "⛧ Heavynauta, Papo Sério Sobre Música Pesada" variant the AI emits.
 */
const INSTITUTIONAL_RE =
  /<p[^>]*>[\s\S]*?Heavynauta[^<]*Papo\s+Sério[\s\S]*?<\/p>/i;

/** Removes any existing "Mencionado neste episódio" section. */
export function stripMentionedSection(html: string): string {
  if (!html) return '';
  return html.replace(SECTION_START_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Inserts (or replaces) the mentioned section in the description HTML.
 * - `sectionHtml` should be the fully rendered `<h3>...</h3><ul>...</ul>`.
 * - If institutional block is present, the section is inserted BEFORE it.
 * - Otherwise prepended to the top.
 * - If `sectionHtml` is empty, the existing section is just stripped.
 */
export function injectMentionedSection(html: string, sectionHtml: string): string {
  const cleaned = stripMentionedSection(html || '');
  const trimmedSection = (sectionHtml || '').trim();
  if (!trimmedSection) return cleaned;

  // Try strict marker first (exact AI-generated block)
  if (cleaned.includes(INSTITUTIONAL_MARKER)) {
    return cleaned.replace(
      INSTITUTIONAL_MARKER,
      `${trimmedSection}\n\n${INSTITUTIONAL_MARKER}`,
    );
  }
  // Fallback: flexible match for variants like "⛧ Heavynauta, Papo Sério..."
  const match = cleaned.match(INSTITUTIONAL_RE);
  if (match) {
    return cleaned.replace(match[0], `${trimmedSection}\n\n${match[0]}`);
  }
  return `${trimmedSection}\n\n${cleaned}`.trim();
}

export const MENTIONED_SECTION_MARKER = INSTITUTIONAL_MARKER;