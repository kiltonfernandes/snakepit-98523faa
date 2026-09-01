import { addDays, format, getDay, startOfDay } from 'date-fns';

export const EDITORIAL_AUTOMATION_VERSION = 'editorial-v1';

export type EditorialStage =
  | 'planned'
  | 'researching'
  | 'writing'
  | 'ready'
  | 'blocked'
  | 'raw_available'
  | 'final_available'
  | 'scheduled';

export type EditorialBufferRole = 'active' | 'reserve' | 'planned' | 'completed';

export interface EditorialTitle {
  kind: 'curiosidade' | 'impacto' | 'clickbait' | string;
  text: string;
}

export interface EditorialAsset {
  file_id?: string | null;
  web_url?: string | null;
  download_url?: string | null;
  filename?: string | null;
  uploaded_at?: string | null;
}

export interface EditorialQueueData {
  automation_version?: string;
  artist?: string;
  album?: string;
  genre?: string;
  queue_position?: number;
  editorial_stage?: EditorialStage | string;
  buffer_role?: EditorialBufferRole | string;
  result_markdown?: string;
  titles?: EditorialTitle[];
  selected_title?: string;
  description_html?: string;
  mentioned?: string;
  title_locked?: boolean;
  raw_asset?: EditorialAsset;
  research_dossier?: unknown;
  research_sources?: Array<{ title?: string; url?: string }>;
  model_used?: string;
  research_model?: string;
  prompt_version?: string;
  last_error?: string;
  attempts?: number;
  processing_started_at?: string;
  completed_at?: string;
  [key: string]: unknown;
}

export interface EditorialPautaLike {
  id: string;
  publication_date: string;
  status: string;
  data: Record<string, unknown> | null;
}

export interface QueueAlbumInput {
  artist: string;
  album: string;
  genre: string;
}

export const EDITORIAL_STAGE_META: Record<string, { label: string; className: string }> = {
  planned: { label: 'Planejada', className: 'bg-slate-500/15 text-slate-700 dark:text-slate-300' },
  researching: { label: 'Pesquisando', className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  writing: { label: 'Produzindo pauta', className: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' },
  ready: { label: 'Pronta para gravar', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  blocked: { label: 'Precisa de decisão', className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
  raw_available: { label: 'Raw disponível', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  final_available: { label: 'MP3 final enviado', className: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' },
  scheduled: { label: 'Agendada no Spotify', className: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300' },
};

export function editorialData(item: Pick<EditorialPautaLike, 'data'>): EditorialQueueData {
  return (item.data && typeof item.data === 'object' ? item.data : {}) as EditorialQueueData;
}

export function isEditorialQueueItem(item: Pick<EditorialPautaLike, 'data'>): boolean {
  return editorialData(item).automation_version === EDITORIAL_AUTOMATION_VERSION;
}

export function editorialStage(item: Pick<EditorialPautaLike, 'data' | 'status'>): EditorialStage {
  const data = editorialData(item);
  if (data.raw_asset?.file_id && item.status === 'ready') return 'raw_available';
  if (data.editorial_stage) return data.editorial_stage as EditorialStage;
  if (item.status === 'scheduled') return 'scheduled';
  if (item.status === 'final') return 'final_available';
  return item.status as EditorialStage;
}

export function editorialStageMeta(item: Pick<EditorialPautaLike, 'data' | 'status'>) {
  return EDITORIAL_STAGE_META[editorialStage(item)] || EDITORIAL_STAGE_META.planned;
}

export function editorialLabel(item: Pick<EditorialPautaLike, 'data'>): string {
  const data = editorialData(item);
  return [data.artist, data.album].filter(Boolean).join(' — ') || 'Álbum sem identificação';
}

export function editorialTitles(item: Pick<EditorialPautaLike, 'data'>): EditorialTitle[] {
  const data = editorialData(item);
  return Array.isArray(data.titles)
    ? data.titles.filter((title): title is EditorialTitle => Boolean(title && typeof title.text === 'string' && title.text.trim()))
    : [];
}

export function selectedEditorialTitle(item: Pick<EditorialPautaLike, 'data'>): string {
  const data = editorialData(item);
  return String(data.selected_title || editorialTitles(item)[0]?.text || '').trim();
}

export function isSpotifyUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && /(^|\.)spotify\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function distributePublicationDates(startDate: string, publicationWeekdays: number[], count: number): string[] {
  if (!startDate || count <= 0) return [];
  const allowed = new Set(publicationWeekdays.length > 0 ? publicationWeekdays : [1, 2, 3, 4, 5]);
  const result: string[] = [];
  let cursor = startOfDay(new Date(`${startDate.slice(0, 10)}T12:00:00`));
  while (result.length < count) {
    if (allowed.has(getDay(cursor))) result.push(format(cursor, 'yyyy-MM-dd'));
    cursor = addDays(cursor, 1);
  }
  return result;
}


/**
 * Sorteia a ordem de uma nova lista antes de associá-la às datas de publicação.
 * A cópia impede que a ordem digitada no formulário seja alterada visualmente.
 */
export function shuffleEditorialQueue<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function buildEditorialQueueData(input: QueueAlbumInput, queuePosition: number): EditorialQueueData {
  return {
    automation_version: EDITORIAL_AUTOMATION_VERSION,
    artist: input.artist.trim(),
    album: input.album.trim(),
    genre: input.genre.trim(),
    queue_position: queuePosition,
    editorial_stage: 'planned',
    buffer_role: 'planned',
    titles: [],
    title_locked: false,
    attempts: 0,
    prompt_version: 'review_complete_v1',
  };
}

export function hasRawAsset(item: Pick<EditorialPautaLike, 'data'>): boolean {
  return Boolean(editorialData(item).raw_asset?.file_id || editorialData(item).raw_asset?.web_url);
}

export function isTitleLocked(item: Pick<EditorialPautaLike, 'data'>): boolean {
  return Boolean(editorialData(item).title_locked);
}
