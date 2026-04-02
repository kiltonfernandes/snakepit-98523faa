
ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pautas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pauta_news_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pauta_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episode_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on releases" ON public.releases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on release_genres" ON public.release_genres FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on editorial_weeks" ON public.editorial_weeks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on pautas" ON public.pautas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on pauta_news_links" ON public.pauta_news_links FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on pauta_releases" ON public.pauta_releases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on episode_materials" ON public.episode_materials FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on app_settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on activity_logs" ON public.activity_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on prompt_sessions" ON public.prompt_sessions FOR ALL USING (true) WITH CHECK (true);
