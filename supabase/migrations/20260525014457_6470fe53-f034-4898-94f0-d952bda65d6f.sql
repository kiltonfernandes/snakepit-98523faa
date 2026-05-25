ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS google_query_templates_json jsonb NOT NULL DEFAULT '{}'::jsonb;