CREATE TABLE public.rivaldo_presets (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  audio_params_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_profile_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at text NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'::text),
  updated_at text NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'::text)
);

ALTER TABLE public.rivaldo_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on rivaldo_presets" ON public.rivaldo_presets
FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_rivaldo_presets_name ON public.rivaldo_presets(name);