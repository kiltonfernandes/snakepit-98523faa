import type { EpisodeMaterial } from '@/lib/types';
import { addDays, format, startOfWeek } from 'date-fns';
import { getPreprodLabel, preprodDate, type PreprodPauta } from '@/lib/preprod-calendar';

/** Every material mirrored from Pré-produção belongs in Rivaldo's Avulso tab. */
export function isRivaldoStandaloneMaterial(
  material: Pick<EpisodeMaterial, 'is_standalone' | 'preprod_pauta_id'>,
): boolean {
  return Boolean(material.is_standalone || material.preprod_pauta_id);
}

export interface RivaldoPreprodEpisode {
  id: string;
  value: string;
  label: string;
  date: string;
  preprodPautaId: string;
  materialId?: string;
  repositoryUrl?: string | null;
  genre?: string;
  rawDownloadUrl?: string | null;
  rawWebUrl?: string | null;
  rawFilename?: string | null;
  isStandalone: true;
  searchText: string;
}

export interface RivaldoPreprodWeekGroup {
  weekId: string;
  weekLabel: string;
  startDate: string;
  items: RivaldoPreprodEpisode[];
}

function searchablePreprodText(pauta: PreprodPauta, label: string): string {
  const data = pauta.data || {};
  return [
    label,
    pauta.kind,
    pauta.publication_date,
    data.selected_title,
    data.title,
    data.artist,
    data.album,
    data.news_subject,
  ]
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Uses Pré-produção itself as the picker source, so every pauta is represented. */
export function buildRivaldoPreprodGroups(
  pautas: PreprodPauta[],
  materials: EpisodeMaterial[],
): RivaldoPreprodWeekGroup[] {
  const materialByPauta = new Map(
    materials
      .filter((material) => material.preprod_pauta_id)
      .map((material) => [material.preprod_pauta_id as string, material]),
  );
  const groups = new Map<string, RivaldoPreprodWeekGroup>();

  for (const pauta of pautas) {
    const date = preprodDate(pauta.publication_date);
    const parsedDate = new Date(`${date}T12:00:00`);
    const weekStart = startOfWeek(parsedDate, { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 6);
    const weekId = format(weekStart, 'yyyy-MM-dd');
    const label = getPreprodLabel(pauta);
    const material = materialByPauta.get(pauta.id);
    const raw = (pauta.data || {}).raw_asset as Record<string, unknown> | undefined;

    if (!groups.has(weekId)) {
      groups.set(weekId, {
        weekId,
        weekLabel: `Semana de ${format(weekStart, 'dd/MM')} a ${format(weekEnd, 'dd/MM/yyyy')}`,
        startDate: weekId,
        items: [],
      });
    }

    groups.get(weekId)!.items.push({
      id: pauta.id,
      value: label,
      label,
      date,
      preprodPautaId: pauta.id,
      materialId: material?.id,
      repositoryUrl: material?.repository_url,
      genre: String((pauta.data || {}).genre || '') || undefined,
      rawDownloadUrl: typeof raw?.download_url === 'string' ? raw.download_url : null,
      rawWebUrl: typeof raw?.web_url === 'string' ? raw.web_url : null,
      rawFilename: typeof raw?.filename === 'string' ? raw.filename : null,
      isStandalone: true,
      searchText: searchablePreprodText(pauta, label),
    });
  }

  const result = Array.from(groups.values());
  result.sort((a, b) => b.startDate.localeCompare(a.startDate));
  for (const group of result) {
    group.items.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label, 'pt-BR'));
  }
  return result;
}
