export type PreprodKind = 'review' | 'news' | string;

export interface PreprodPauta {
  id: string;
  publication_date: string;
  kind: PreprodKind | null;
  status: string;
  data: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export function normalizePreprodPauta(row: any): PreprodPauta {
  const normalized: PreprodPauta = {
    ...row,
    publication_date: preprodDate(row.publication_date),
    data: row.data && typeof row.data === 'object' ? row.data : {},
  };
  return {
    ...normalized,
    status: inferPreprodStatus(normalized),
  };
}

export const PREPROD_KIND_LABEL: Record<string, string> = {
  review: 'Review',
  news: 'Notícia',
};

export function preprodDate(value: string | Date): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

export function getPreprodLabel(item: Pick<PreprodPauta, 'kind' | 'data'>): string {
  const data = item.data || {};
  const releaseLabel = [data.artist, data.album].filter(Boolean).join(' — ');
  return (
    data.selected_title ||
    data.title ||
    releaseLabel ||
    PREPROD_KIND_LABEL[String(item.kind || '')] ||
    'Pré-produção'
  );
}

export function getPreprodStatusLabel(status?: string): string {
  switch (status) {
    case 'final':
    case 'finalized':
    case 'packaged':
      return 'Final';
    case 'description':
      return 'Descrição';
    case 'titles':
      return 'Títulos';
    case 'generated':
      return 'Gerada';
    case 'insumo':
      return 'Insumo';
    case 'research':
      return 'Pesquisa';
    default:
      return 'Rascunho';
  }
}

export function getPreprodStatusClass(status?: string): string {
  switch (status) {
    case 'final':
    case 'finalized':
    case 'packaged':
      return 'bg-primary';
    case 'description':
    case 'titles':
    case 'generated':
      return 'bg-accent';
    case 'insumo':
    case 'research':
      return 'bg-secondary';
    default:
      return 'bg-muted-foreground/40';
  }
}

export function inferPreprodStatus(item: Pick<PreprodPauta, 'status' | 'data'>): string {
  const data = item.data || {};
  if (data.cover_url || data.packaged_at || data.step === 'package') return 'packaged';
  if (data.description_html) return 'description';
  if (data.selected_title || (Array.isArray(data.titles) && data.titles.length > 0)) return 'titles';
  if (data.result_markdown) return 'generated';
  if (data.insumo) return 'insumo';
  if (data.research_query) return 'research';
  if (item.status && item.status !== 'draft') return item.status;
  return item.status || 'draft';
}

export function inferPreprodStep(data: Record<string, any>, kind: PreprodKind | null): string {
  const order = ['kind', 'release', 'research', 'insumo', 'config', 'result', 'titles', 'description', 'cover', 'package'];
  let inferred = 'kind';
  if (kind) inferred = 'release';
  if (data.release_id || data.research_query) inferred = 'research';
  if (data.insumo) inferred = 'config';
  if (data.result_markdown) inferred = 'titles';
  if (data.selected_title || (Array.isArray(data.titles) && data.titles.length > 0)) inferred = 'description';
  if (data.description_html || data.cover_source_url) inferred = 'cover';
  if (data.cover_url || data.packaged_at || data.step === 'package') inferred = 'package';

  const explicit = data.step ? String(data.step) : inferred;
  return order.indexOf(explicit) > order.indexOf(inferred) ? explicit : inferred;
}