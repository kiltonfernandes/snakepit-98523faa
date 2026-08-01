import type { EpisodeMaterial } from '@/lib/types';

type EpisodeCardMaterial = Pick<
  EpisodeMaterial,
  'repository_url' | 'repository_file_id' | 'spotify_link'
>;

export type EpisodeCardVisualState = 'spotify' | 'onedrive' | 'empty';

export const EPISODE_CARD_HALO_CLASS: Record<EpisodeCardVisualState, string> = {
  spotify: 'ring-2 ring-[#39ff14] border-[#39ff14] shadow-[0_0_8px_#39ff14aa]',
  onedrive: 'ring-2 ring-[#1e90ff] border-[#1e90ff] shadow-[0_0_8px_#1e90ffaa]',
  empty: '',
};

export function getEpisodeCardVisualState(material: EpisodeCardMaterial | null): {
  state: EpisodeCardVisualState;
  hasOneDrive: boolean;
  hasSpotify: boolean;
  haloClass: string;
} {
  const hasOneDrive = Boolean(material?.repository_url || material?.repository_file_id);
  const hasSpotify = Boolean(material?.spotify_link);
  const state: EpisodeCardVisualState = hasSpotify ? 'spotify' : hasOneDrive ? 'onedrive' : 'empty';
  return { state, hasOneDrive, hasSpotify, haloClass: EPISODE_CARD_HALO_CLASS[state] };
}
