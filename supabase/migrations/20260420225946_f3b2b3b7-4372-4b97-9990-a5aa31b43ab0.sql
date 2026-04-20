ALTER TABLE public.episode_materials
  ADD COLUMN IF NOT EXISTS repository_provider text,
  ADD COLUMN IF NOT EXISTS repository_uploaded_at text,
  ADD COLUMN IF NOT EXISTS repository_file_id text;