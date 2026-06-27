ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS shortlist boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_releases_shortlist ON public.releases(shortlist) WHERE shortlist = true;