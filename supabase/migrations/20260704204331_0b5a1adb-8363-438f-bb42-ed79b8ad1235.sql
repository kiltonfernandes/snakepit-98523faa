-- youtube_channels: cadastro dos canais monitorados
CREATE TABLE public.youtube_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  channel_url text NOT NULL,
  feed_url text NOT NULL,
  monitor_days integer NOT NULL DEFAULT 5,
  active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.youtube_channels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.youtube_channels TO anon;
GRANT ALL ON public.youtube_channels TO service_role;

ALTER TABLE public.youtube_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "youtube_channels_all" ON public.youtube_channels
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER youtube_channels_updated_at
  BEFORE UPDATE ON public.youtube_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- singles_videos: cache de vídeos + enriquecimento IA + insumo editorial
CREATE TABLE public.singles_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.youtube_channels(id) ON DELETE CASCADE,
  video_id text NOT NULL UNIQUE,
  video_url text NOT NULL,
  title text NOT NULL,
  description text,
  published_at timestamptz,
  band text,
  single text,
  one_liner text,
  enriched_at timestamptz,
  insumo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX singles_videos_channel_idx ON public.singles_videos (channel_id, published_at DESC);
CREATE INDEX singles_videos_published_idx ON public.singles_videos (published_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.singles_videos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.singles_videos TO anon;
GRANT ALL ON public.singles_videos TO service_role;

ALTER TABLE public.singles_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "singles_videos_all" ON public.singles_videos
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER singles_videos_updated_at
  BEFORE UPDATE ON public.singles_videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();