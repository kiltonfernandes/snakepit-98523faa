import { DaySlot } from './types';

export const DAY_SLOTS: { key: DaySlot; label: string; short: string }[] = [
  { key: 'monday', label: 'Segunda', short: 'Seg' },
  { key: 'tuesday', label: 'Terça', short: 'Ter' },
  { key: 'wednesday', label: 'Quarta', short: 'Qua' },
  { key: 'thursday', label: 'Quinta', short: 'Qui' },
  { key: 'friday', label: 'Sexta', short: 'Sex' },
  { key: 'saturday', label: 'Sábado', short: 'Sáb' },
];

export const PAUTA_SECTIONS = [
  { key: 'intro', label: 'Introdução' },
  { key: 'research', label: 'Pesquisa' },
  { key: 'consolidation', label: 'Consolidação' },
  { key: 'content', label: 'Conteúdo' },
  { key: 'description', label: 'Descrição' },
] as const;
