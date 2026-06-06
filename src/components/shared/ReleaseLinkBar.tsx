import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import type { Release } from '@/lib/types';
import { resolveAllLinks } from '@/lib/dynamic-links';

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
  // Always render the full 6-platform bar. When no manual override is set,
  // we fall back to a search URL built from artist+album (see dynamic-links).
  const resolved = resolveAllLinks(release);
  const active: Array<[string, string]> = [
    ['Metal Archives', resolved.metal_archives],
    ['YouTube', resolved.youtube],
    ['Spotify', resolved.spotify],
    ['Deezer', resolved.deezer],
    ['Apple Music', resolved.apple_music],
    ['Bandcamp', resolved.bandcamp],
  ];
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