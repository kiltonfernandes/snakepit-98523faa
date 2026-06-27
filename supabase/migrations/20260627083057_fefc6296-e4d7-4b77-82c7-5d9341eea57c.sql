
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.bgm_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  genres text[] NOT NULL DEFAULT '{}',
  storage_path text NOT NULL,
  duration_seconds numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bgm_tracks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bgm_tracks TO authenticated;
GRANT ALL ON public.bgm_tracks TO service_role;

ALTER TABLE public.bgm_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bgm_tracks readable by everyone" ON public.bgm_tracks FOR SELECT USING (true);
CREATE POLICY "bgm_tracks insertable by authenticated" ON public.bgm_tracks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "bgm_tracks updatable by authenticated" ON public.bgm_tracks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "bgm_tracks deletable by authenticated" ON public.bgm_tracks FOR DELETE TO authenticated USING (true);

CREATE INDEX bgm_tracks_genres_gin ON public.bgm_tracks USING GIN (genres);
CREATE INDEX bgm_tracks_created_idx ON public.bgm_tracks (created_at DESC);

CREATE TRIGGER bgm_tracks_set_updated_at
  BEFORE UPDATE ON public.bgm_tracks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
