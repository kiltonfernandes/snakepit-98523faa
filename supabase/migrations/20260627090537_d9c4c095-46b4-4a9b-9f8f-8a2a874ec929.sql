DROP POLICY IF EXISTS "bgm_tracks insertable by authenticated" ON public.bgm_tracks;
DROP POLICY IF EXISTS "bgm_tracks updatable by authenticated" ON public.bgm_tracks;
DROP POLICY IF EXISTS "bgm_tracks deletable by authenticated" ON public.bgm_tracks;

CREATE POLICY "bgm_tracks insertable by anyone" ON public.bgm_tracks FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "bgm_tracks updatable by anyone" ON public.bgm_tracks FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "bgm_tracks deletable by anyone" ON public.bgm_tracks FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bgm_tracks TO anon, authenticated;
GRANT ALL ON public.bgm_tracks TO service_role;

-- Storage policies for bgm bucket
DROP POLICY IF EXISTS "bgm read" ON storage.objects;
DROP POLICY IF EXISTS "bgm insert" ON storage.objects;
DROP POLICY IF EXISTS "bgm update" ON storage.objects;
DROP POLICY IF EXISTS "bgm delete" ON storage.objects;

CREATE POLICY "bgm read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'bgm');
CREATE POLICY "bgm insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'bgm');
CREATE POLICY "bgm update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'bgm') WITH CHECK (bucket_id = 'bgm');
CREATE POLICY "bgm delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'bgm');