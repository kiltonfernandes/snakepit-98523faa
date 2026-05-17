ALTER TABLE public.pautas
  ADD COLUMN IF NOT EXISTS is_standalone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS standalone_topics jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.episode_materials
  ADD COLUMN IF NOT EXISTS is_standalone boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pautas_is_standalone ON public.pautas(is_standalone);
CREATE INDEX IF NOT EXISTS idx_materials_is_standalone ON public.episode_materials(is_standalone);