import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import type { Release } from '@/lib/types';

interface Props {
  release: Release | null | undefined;
  /** Optional label to show on the left side of the bar. */
  heading?: string;
}

/**
 * Renders a compact bar of dynamic external link buttons for a release
 * (Metal Archives, YouTube, Spotify, Deezer, Apple Music, Bandcamp).
 * Returns null when no release or no links are present.
 */
export function ReleaseLinkBar({ release, heading }: Props) {
  if (!release) return null;
  const links: Array<[string, string | null | undefined]> = [
    ['Metal Archives', release.metal_archives_url],
    ['YouTube', release.youtube_url],
    ['Spotify', release.spotify_url],
    ['Deezer', release.deezer_url],
    ['Apple Music', release.apple_music_url],
    ['Bandcamp', release.bandcamp_url],
  ];
  const active = links.filter(([, url]) => !!url) as Array<[string, string]>;
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 p-2">
      <span className="mr-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {heading ?? `${release.artist} — ${release.album}`}
      </span>
      {active.map(([label, url]) => (
        <Button
          key={label}
          size="sm"
          variant="outline"
          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink className="mr-1 h-3.5 w-3.5" />
          {label}
        </Button>
      ))}
    </div>
  );
}