
CREATE POLICY "bgm objects readable by everyone"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'bgm');

CREATE POLICY "bgm objects writable by authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bgm');

CREATE POLICY "bgm objects updatable by authenticated"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'bgm') WITH CHECK (bucket_id = 'bgm');

CREATE POLICY "bgm objects deletable by authenticated"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bgm');
