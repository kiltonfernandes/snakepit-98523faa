import { describe, expect, it } from 'vitest';
import { distributePublicationDates, isSpotifyUrl } from './editorial-queue';

describe('editorial queue dates', () => {
  it('keeps the supplied order and skips weekends with the weekday default', () => {
    expect(distributePublicationDates('2026-09-10', [1, 2, 3, 4, 5], 4)).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-14',
      '2026-09-15',
    ]);
  });

  it('advances an initial weekend date to the next allowed day', () => {
    expect(distributePublicationDates('2026-09-12', [1, 3, 5], 3)).toEqual([
      '2026-09-14',
      '2026-09-16',
      '2026-09-18',
    ]);
  });
});

describe('Spotify publication link', () => {
  it('accepts Spotify links and rejects unrelated URLs', () => {
    expect(isSpotifyUrl('https://open.spotify.com/episode/abc')).toBe(true);
    expect(isSpotifyUrl('https://spotify.com/show/abc')).toBe(true);
    expect(isSpotifyUrl('https://example.com/spotify')).toBe(false);
  });
});
