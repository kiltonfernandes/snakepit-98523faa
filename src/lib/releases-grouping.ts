import type { Release } from '@/lib/types';
import { normalizeCountryCode } from '@/lib/country-utils';

export type SortField = 'release_date' | 'artist' | 'album' | 'rating' | 'country' | 'genre';
export type SortRule = { field: SortField; dir: 'asc' | 'desc' };

export type GroupField =
  | 'release_year'
  | 'release_month'
  | 'release_decade'
  | 'country'
  | 'genre'
  | 'rating'
  | 'has_review';
export type GroupRule = { field: GroupField; dir: 'asc' | 'desc' };

export const SORT_FIELD_LABELS: Record<SortField, string> = {
  release_date: 'Data de lançamento',
  artist: 'Artista',
  album: 'Álbum',
  rating: 'Rating',
  country: 'País',
  genre: 'Gênero (primeiro)',
};

export const GROUP_FIELD_LABELS: Record<GroupField, string> = {
  release_year: 'Ano',
  release_month: 'Ano-Mês',
  release_decade: 'Década',
  country: 'País',
  genre: 'Gênero (primeiro)',
  rating: 'Rating',
  has_review: 'Tem review',
};

const EMPTY = '—';

function firstGenre(r: Release): string {
  return (r.genres || []).find(g => g && !/^\d+(\.\d+)?$/.test(g.trim())) || EMPTY;
}

function sortValueOf(r: Release, field: SortField): string | number {
  switch (field) {
    case 'release_date': return r.release_date || '';
    case 'artist': return (r.artist || '').toLowerCase();
    case 'album': return (r.album || '').toLowerCase();
    case 'rating': return r.rating ?? -1;
    case 'country': return (r.country || '').toLowerCase();
    case 'genre': return firstGenre(r).toLowerCase();
  }
}

function fieldCompare(a: Release, b: Release, field: SortField): number {
  const va = sortValueOf(a, field);
  const vb = sortValueOf(b, field);
  if (typeof va === 'number' && typeof vb === 'number') return va - vb;
  return String(va).localeCompare(String(vb));
}

export function compareWithRules(a: Release, b: Release, rules: SortRule[]): number {
  for (const r of rules) {
    const cmp = fieldCompare(a, b, r.field);
    if (cmp !== 0) return r.dir === 'desc' ? -cmp : cmp;
  }
  return 0;
}

export function groupValueOf(r: Release, field: GroupField, reviewIds?: Set<string>): string {
  switch (field) {
    case 'release_year': return r.release_date ? r.release_date.slice(0, 4) : EMPTY;
    case 'release_month': return r.release_date ? r.release_date.slice(0, 7) : EMPTY;
    case 'release_decade': {
      if (!r.release_date) return EMPTY;
      const y = parseInt(r.release_date.slice(0, 4), 10);
      if (Number.isNaN(y)) return EMPTY;
      return `${Math.floor(y / 10) * 10}s`;
    }
    case 'country': {
      if (!r.country) return EMPTY;
      return normalizeCountryCode(r.country) || r.country;
    }
    case 'genre': return firstGenre(r);
    case 'rating': return r.rating != null ? `${r.rating}` : EMPTY;
    case 'has_review': return reviewIds?.has(r.id) ? 'Sim' : 'Não';
  }
}

export interface GroupNode {
  key: string;
  label: string;
  value: string;
  field: GroupField;
  level: number;
  count: number;
  itemIds: string[]; // all release ids under this node (recursive)
  children?: GroupNode[];
  items?: Release[]; // populated only at leaf
}

export function buildGroups(
  items: Release[],
  rules: GroupRule[],
  sortRules: SortRule[],
  reviewIds?: Set<string>,
  level = 0,
  parentKey = '',
): GroupNode[] {
  if (rules.length === 0) return [];
  const rule = rules[level];
  const buckets = new Map<string, Release[]>();
  for (const it of items) {
    const k = groupValueOf(it, rule.field, reviewIds);
    const arr = buckets.get(k);
    if (arr) arr.push(it); else buckets.set(k, [it]);
  }
  const sorted = Array.from(buckets.entries()).sort(([a], [b]) => {
    // Try numeric compare for year/decade/rating-like values
    const na = Number(a.replace(/s$/, ''));
    const nb = Number(b.replace(/s$/, ''));
    let cmp: number;
    if (!Number.isNaN(na) && !Number.isNaN(nb)) cmp = na - nb;
    else cmp = a.localeCompare(b);
    return rule.dir === 'desc' ? -cmp : cmp;
  });
  return sorted.map(([k, arr]) => {
    const key = `${parentKey}/${rule.field}=${k}`;
    const isLeaf = level === rules.length - 1;
    const sortedItems = [...arr].sort((a, b) => compareWithRules(a, b, sortRules));
    const node: GroupNode = {
      key,
      value: k,
      field: rule.field,
      label: `${GROUP_FIELD_LABELS[rule.field]}: ${k}`,
      level,
      count: arr.length,
      itemIds: arr.map(r => r.id),
    };
    if (isLeaf) {
      node.items = sortedItems;
    } else {
      node.children = buildGroups(arr, rules, sortRules, reviewIds, level + 1, key);
    }
    return node;
  });
}

export function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
