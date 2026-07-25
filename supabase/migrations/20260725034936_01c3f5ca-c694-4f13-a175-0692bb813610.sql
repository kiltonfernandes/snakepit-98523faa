
CREATE TABLE public.preprod_pauta_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pauta_id UUID NOT NULL REFERENCES public.preprod_pautas(id) ON DELETE CASCADE,
  selected_text TEXT NOT NULL DEFAULT '',
  comment_html TEXT NOT NULL DEFAULT '',
  author TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX preprod_pauta_comments_pauta_id_idx ON public.preprod_pauta_comments(pauta_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.preprod_pauta_comments TO anon, authenticated;
GRANT ALL ON public.preprod_pauta_comments TO service_role;

ALTER TABLE public.preprod_pauta_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read comments" ON public.preprod_pauta_comments FOR SELECT USING (true);
CREATE POLICY "Public insert comments" ON public.preprod_pauta_comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update comments" ON public.preprod_pauta_comments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete comments" ON public.preprod_pauta_comments FOR DELETE USING (true);

CREATE TRIGGER update_preprod_pauta_comments_updated_at
  BEFORE UPDATE ON public.preprod_pauta_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
