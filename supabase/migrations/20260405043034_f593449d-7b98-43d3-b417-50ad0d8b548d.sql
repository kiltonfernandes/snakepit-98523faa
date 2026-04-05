
-- Create pauta_templates table
CREATE TABLE public.pauta_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text DEFAULT '',
  sections_config jsonb NOT NULL DEFAULT '[]',
  segway_intro text DEFAULT '',
  segway_outro text DEFAULT '',
  created_at text NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  updated_at text NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
);

-- Enable RLS
ALTER TABLE public.pauta_templates ENABLE ROW LEVEL SECURITY;

-- Public access policy (no auth in this app)
CREATE POLICY "Allow all on pauta_templates" ON public.pauta_templates
  FOR ALL TO public USING (true) WITH CHECK (true);

-- Add template_id column to pautas
ALTER TABLE public.pautas ADD COLUMN template_id text DEFAULT NULL;

-- Seed default templates
INSERT INTO public.pauta_templates (id, name, description, sections_config) VALUES
  ('tpl_weekday', 'Notícias (Seg-Sex)', 'Template padrão para episódios de dias úteis', '[{"key":"anniversary","label":"Aniversário","enabled":true,"core_prompt":""},{"key":"review","label":"Review","enabled":true,"core_prompt":""},{"key":"news","label":"Notícias","enabled":true,"core_prompt":""},{"key":"releases","label":"Lançamentos","enabled":false,"core_prompt":""},{"key":"interview","label":"Entrevista","enabled":false,"core_prompt":""},{"key":"list","label":"Lista","enabled":false,"core_prompt":""}]'),
  ('tpl_saturday', 'Sábado', 'Template padrão para episódios de sábado', '[{"key":"anniversary","label":"Aniversário","enabled":true,"core_prompt":""},{"key":"review","label":"Review","enabled":false,"core_prompt":""},{"key":"news","label":"Notícias","enabled":false,"core_prompt":""},{"key":"releases","label":"Lançamentos","enabled":true,"core_prompt":""},{"key":"interview","label":"Entrevista","enabled":false,"core_prompt":""},{"key":"list","label":"Lista","enabled":false,"core_prompt":""}]');
