CREATE INDEX IF NOT EXISTS idx_releases_country ON public.releases(country);
CREATE INDEX IF NOT EXISTS idx_pauta_releases_release_id ON public.pauta_releases(release_id);
CREATE INDEX IF NOT EXISTS idx_pauta_releases_pauta_id ON public.pauta_releases(pauta_id);
CREATE INDEX IF NOT EXISTS idx_pautas_status ON public.pautas(status);
CREATE INDEX IF NOT EXISTS idx_episode_materials_episode_date ON public.episode_materials(episode_date);