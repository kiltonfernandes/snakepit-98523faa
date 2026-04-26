ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS ai_model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash';