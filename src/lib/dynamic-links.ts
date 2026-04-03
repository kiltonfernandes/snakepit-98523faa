/**
 * Dynamic link generation for releases.
 * Layer 1: Auto-generated search URLs from artist+album.
 * Layer 2: Manual override URLs stored per release.
 * Layer 3: If official URL exists, use it; otherwise fallback to dynamic.
 */

export interface PlatformLinks {
  youtube: string;
  spotify: string;
  deezer: string;
  apple_music: string;
  bandcamp: string;
  metal_archives: string;
}

export interface ReleaseWithLinks {
  artist: string;
  album: string;
  youtube_url?: string | null;
  spotify_url?: string | null;
  deezer_url?: string | null;
  apple_music_url?: string | null;
  bandcamp_url?: string | null;
  metal_archives_url?: string | null;
}

function encodeSearch(artist: string, album: string): string {
  return encodeURIComponent(`${artist} ${album}`);
}

function buildDynamicLink(artist: string, album: string, platform: keyof PlatformLinks): string {
  const q = encodeSearch(artist, album);
  switch (platform) {
    case 'youtube':
      return `https://www.youtube.com/results?search_query=${q}`;
    case 'spotify':
      return `https://open.spotify.com/search/${q}`;
    case 'deezer':
      return `https://www.deezer.com/search/${q}`;
    case 'apple_music':
      return `https://music.apple.com/search?term=${q}`;
    case 'bandcamp':
      return `https://bandcamp.com/search?q=${q}`;
    case 'metal_archives': {
      const slug = (s: string) => s.replace(/\s+/g, '_');
      return `https://www.metal-archives.com/albums/${slug(artist)}/${slug(album)}`;
    }
  }
}

/**
 * Resolve the display link for a platform.
 * Priority: manual override > dynamic fallback.
 */
export function resolveLink(release: ReleaseWithLinks, platform: keyof PlatformLinks): string {
  const overrideKey = `${platform}_url` as keyof ReleaseWithLinks;
  const override = release[overrideKey];
  if (override && typeof override === 'string' && override.trim()) {
    return override.trim();
  }
  return buildDynamicLink(release.artist, release.album, platform);
}

/**
 * Get all resolved links for a release.
 */
export function resolveAllLinks(release: ReleaseWithLinks): PlatformLinks {
  return {
    youtube: resolveLink(release, 'youtube'),
    spotify: resolveLink(release, 'spotify'),
    deezer: resolveLink(release, 'deezer'),
    apple_music: resolveLink(release, 'apple_music'),
    bandcamp: resolveLink(release, 'bandcamp'),
    metal_archives: resolveLink(release, 'metal_archives'),
  };
}

/**
 * Check if a link is a manual override (not auto-generated).
 */
export function isManualLink(release: ReleaseWithLinks, platform: keyof PlatformLinks): boolean {
  const overrideKey = `${platform}_url` as keyof ReleaseWithLinks;
  const override = release[overrideKey];
  return !!(override && typeof override === 'string' && override.trim());
}

/**
 * Format links as markdown for use in prompts/exports.
 */
export function linksToMarkdown(release: ReleaseWithLinks): string {
  const links = resolveAllLinks(release);
  return `[YouTube](${links.youtube}) | [Spotify](${links.spotify}) | [Deezer](${links.deezer}) | [Apple Music](${links.apple_music}) | [Metal Archives](${links.metal_archives})`;
}

/**
 * Platform display labels and icons.
 */
export const PLATFORM_CONFIG: Record<keyof PlatformLinks, { label: string; color: string }> = {
  youtube: { label: 'YouTube', color: 'text-red-500' },
  spotify: { label: 'Spotify', color: 'text-green-500' },
  deezer: { label: 'Deezer', color: 'text-purple-500' },
  apple_music: { label: 'Apple Music', color: 'text-pink-500' },
  bandcamp: { label: 'Bandcamp', color: 'text-cyan-500' },
  metal_archives: { label: 'Metal Archives', color: 'text-orange-500' },
};
