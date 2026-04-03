ALTER TABLE public.releases
  ADD COLUMN IF NOT EXISTS youtube_url text,
  ADD COLUMN IF NOT EXISTS spotify_url text,
  ADD COLUMN IF NOT EXISTS deezer_url text,
  ADD COLUMN IF NOT EXISTS apple_music_url text,
  ADD COLUMN IF NOT EXISTS bandcamp_url text,
  ADD COLUMN IF NOT EXISTS metal_archives_url text;