ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS rivaldo_agentic_v1_enabled boolean NOT NULL DEFAULT false;