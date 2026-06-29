CREATE TABLE public.preprod_pautas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_date date NOT NULL,
  kind text,
  status text NOT NULL DEFAULT 'draft',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_preprod_pautas_date ON public.preprod_pautas(publication_date);
CREATE INDEX idx_preprod_pautas_status ON public.preprod_pautas(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.preprod_pautas TO anon, authenticated;
GRANT ALL ON public.preprod_pautas TO service_role;

ALTER TABLE public.preprod_pautas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on preprod_pautas"
  ON public.preprod_pautas
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER trg_preprod_pautas_updated_at
  BEFORE UPDATE ON public.preprod_pautas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();