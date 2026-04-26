import type { EpisodeMaterial, Pauta, PautaStatus } from './types';

/**
 * Status efetivo do episódio:
 * Se o episódio tem link de agendamento (spotify_link) E hoje é depois da
 * data do episódio, ele é considerado "publicado" — mesmo que o status da
 * pauta no banco ainda esteja como "agendado", "criando_materiais" etc.
 *
 * Também marca como "agendado" se há spotify_link mas a data ainda não passou.
 */
export function getEffectivePautaStatus(
  pauta: Pick<Pauta, 'status' | 'publication_date'> | null | undefined,
  material?: Pick<EpisodeMaterial, 'spotify_link' | 'episode_date'> | null,
  today: Date = new Date(),
): PautaStatus | 'draft' {
  const baseStatus = (pauta?.status as PautaStatus | undefined) || 'draft';
  if (baseStatus === 'publicado') return 'publicado';

  const epDate = material?.episode_date || pauta?.publication_date;
  const hasScheduleLink = !!material?.spotify_link;
  if (!epDate || !hasScheduleLink) return baseStatus;

  // Compare YYYY-MM-DD strings; today > epDate => published.
  const todayStr = today.toISOString().slice(0, 10);
  if (todayStr > epDate) return 'publicado';
  if (baseStatus !== 'agendado') return 'agendado';
  return baseStatus;
}
