import { DaySlot } from './types';

export const DAY_SLOTS: { key: DaySlot; label: string; short: string }[] = [
  { key: 'monday', label: 'Segunda', short: 'Seg' },
  { key: 'tuesday', label: 'Terça', short: 'Ter' },
  { key: 'wednesday', label: 'Quarta', short: 'Qua' },
  { key: 'thursday', label: 'Quinta', short: 'Qui' },
  { key: 'friday', label: 'Sexta', short: 'Sex' },
  { key: 'saturday', label: 'Sábado', short: 'Sáb' },
  { key: 'sunday', label: 'Domingo', short: 'Dom' },
];

export const WEEKDAY_SECTIONS = [
  { key: 'anniversary', label: 'Aniversário' },
  { key: 'review_rafa', label: 'Review Rafa' },
  { key: 'news', label: 'Notícias' },
  { key: 'review_kilton', label: 'Review Kilton' },
] as const;

export const SATURDAY_SECTIONS = [
  { key: 'anniversary', label: 'Aniversário' },
  { key: 'next_week_releases', label: 'Lançamentos da Semana' },
] as const;

export const ALL_SECTIONS = [
  ...WEEKDAY_SECTIONS,
  ...SATURDAY_SECTIONS,
] as const;

export function getSectionsForDay(day: DaySlot) {
  if (day === 'saturday') return SATURDAY_SECTIONS;
  return WEEKDAY_SECTIONS;
}
