/**
 * Editable Google search query templates per section/topic type.
 *
 * Templates use `{{placeholder}}` interpolation. Unknown placeholders resolve
 * to empty strings. After interpolation, sequences of whitespace are collapsed
 * and the result is trimmed.
 *
 * Overrides come from `app_settings.google_query_templates_json` and are
 * pushed into this module by `AppContext` whenever settings change. We keep a
 * module-level cache so pure helpers (like `buildSectionSearchQuery`) can stay
 * synchronous and prop-free.
 */

export type QueryTemplateKey =
  // Weekday pauta sections
  | 'weekday.anniversary'
  | 'weekday.news'
  | 'weekday.review_rafa'
  | 'weekday.review_kilton'
  | 'weekday.next_week_releases'
  // Standalone topics — with release context
  | 'standalone.review.with_release'
  | 'standalone.anniversary.with_release'
  | 'standalone.interview.with_release'
  | 'standalone.news.with_release'
  | 'standalone.custom.with_release'
  // Standalone topics — URL/notes only
  | 'standalone.review.url'
  | 'standalone.anniversary.url'
  | 'standalone.interview.url'
  | 'standalone.news.url'
  | 'standalone.custom.url';

export interface QueryTemplateMeta {
  key: QueryTemplateKey;
  label: string;
  group: 'Pautas semanais' | 'Avulso (com release)' | 'Avulso (URL/notas)';
  placeholders: string[];
  default: string;
  hint?: string;
}

export const QUERY_TEMPLATES: QueryTemplateMeta[] = [
  {
    key: 'weekday.anniversary',
    label: 'Aniversário',
    group: 'Pautas semanais',
    placeholders: ['anniversary'],
    default: 'história detalhes curiosidades recepção entrevistas {{anniversary}}',
  },
  {
    key: 'weekday.news',
    label: 'Notícia',
    group: 'Pautas semanais',
    placeholders: ['newsLink'],
    default: 'o que aconteceu {{newsLink}}',
  },
  {
    key: 'weekday.review_rafa',
    label: 'Review Rafa',
    group: 'Pautas semanais',
    placeholders: ['artist', 'album'],
    default: 'review do disco e entrevistas {{album}} {{artist}}',
  },
  {
    key: 'weekday.review_kilton',
    label: 'Review Kilton',
    group: 'Pautas semanais',
    placeholders: ['artist', 'album'],
    default: 'review do disco e entrevistas {{album}} {{artist}}',
  },
  {
    key: 'weekday.next_week_releases',
    label: 'Lançamentos da próxima semana',
    group: 'Pautas semanais',
    placeholders: ['publicationDate'],
    default: 'lançamentos heavy metal semana de {{publicationDate}} review',
  },

  {
    key: 'standalone.review.with_release',
    label: 'Review (com release)',
    group: 'Avulso (com release)',
    placeholders: ['artist', 'album', 'year', 'notes'],
    default: '"{{artist}}" "{{album}}" review {{year}} site:metal-archives.com OR site:loudwire.com OR site:angrymetalguy.com',
  },
  {
    key: 'standalone.anniversary.with_release',
    label: 'Aniversário (com release)',
    group: 'Avulso (com release)',
    placeholders: ['artist', 'album', 'year', 'notes'],
    default: '"{{artist}}" "{{album}}" anniversary OR aniversário {{year}} history making of',
  },
  {
    key: 'standalone.interview.with_release',
    label: 'Entrevista (com release)',
    group: 'Avulso (com release)',
    placeholders: ['artist', 'album', 'year', 'notes'],
    default: '"{{artist}}" "{{album}}" interview track by track {{year}}',
  },
  {
    key: 'standalone.news.with_release',
    label: 'Notícia (com release)',
    group: 'Avulso (com release)',
    placeholders: ['artist', 'album', 'notes'],
    default: '"{{artist}}" "{{album}}" {{notes}} metal news',
  },
  {
    key: 'standalone.custom.with_release',
    label: 'Outro (com release)',
    group: 'Avulso (com release)',
    placeholders: ['artist', 'album', 'notes'],
    default: '"{{artist}}" "{{album}}" {{notes}}',
  },

  {
    key: 'standalone.review.url',
    label: 'Review (URL/notas)',
    group: 'Avulso (URL/notas)',
    placeholders: ['slug', 'notes', 'host'],
    default: '{{slug}} {{notes}} album review',
  },
  {
    key: 'standalone.anniversary.url',
    label: 'Aniversário (URL/notas)',
    group: 'Avulso (URL/notas)',
    placeholders: ['slug', 'notes', 'host'],
    default: '{{slug}} {{notes}} album anniversary history',
  },
  {
    key: 'standalone.interview.url',
    label: 'Entrevista (URL/notas)',
    group: 'Avulso (URL/notas)',
    placeholders: ['slug', 'notes', 'host'],
    default: '{{slug}} {{notes}} interview track by track',
  },
  {
    key: 'standalone.news.url',
    label: 'Notícia (URL/notas)',
    group: 'Avulso (URL/notas)',
    placeholders: ['slug', 'notes', 'host'],
    default: '{{slug}} {{notes}} -site:{{host}} metal news',
  },
  {
    key: 'standalone.custom.url',
    label: 'Outro (URL/notas)',
    group: 'Avulso (URL/notas)',
    placeholders: ['slug', 'notes', 'host'],
    default: '{{slug}} {{notes}}',
  },
];

const DEFAULTS_MAP: Record<string, string> = Object.fromEntries(
  QUERY_TEMPLATES.map(t => [t.key, t.default]),
);

let overrides: Record<string, string> = {};

/** Push the user overrides from settings into this module. */
export function setQueryTemplateOverrides(map: Record<string, string> | null | undefined) {
  overrides = map && typeof map === 'object' ? map : {};
}

/** Resolve the active template (override → default → empty). */
export function getQueryTemplate(key: QueryTemplateKey | string): string {
  const o = overrides[key];
  if (typeof o === 'string' && o.trim()) return o;
  return DEFAULTS_MAP[key] || '';
}

/** Render a template with placeholder values. Unknown vars become empty. */
export function renderQueryTemplate(
  key: QueryTemplateKey | string,
  vars: Record<string, string | number | undefined | null>,
): string {
  const tpl = getQueryTemplate(key);
  if (!tpl) return '';
  const out = tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => {
    const v = vars[name];
    return v == null ? '' : String(v);
  });
  return out.replace(/\s+/g, ' ').trim();
}