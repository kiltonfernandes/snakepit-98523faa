import { describe, expect, it } from 'vitest';
import { getEpisodeCardVisualState } from '@/lib/episode-card-visual-state';

describe('episode card visual state', () => {
  it('uses the blue state when OneDrive is populated', () => {
    const result = getEpisodeCardVisualState({
      repository_url: 'https://1drv.ms/u/example',
      repository_file_id: 'file-1',
      spotify_link: null,
    });

    expect(result.state).toBe('onedrive');
    expect(result.hasOneDrive).toBe(true);
    expect(result.haloClass).toContain('#1e90ff');
  });

  it('uses the green state after Spotify is populated', () => {
    const result = getEpisodeCardVisualState({
      repository_url: 'https://1drv.ms/u/example',
      repository_file_id: 'file-1',
      spotify_link: 'https://open.spotify.com/episode/example',
    });

    expect(result.state).toBe('spotify');
    expect(result.hasSpotify).toBe(true);
    expect(result.haloClass).toContain('#39ff14');
  });
});
