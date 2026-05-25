-- Add components_json column to support sub-prompts per component
ALTER TABLE public.prompt_templates
  ADD COLUMN IF NOT EXISTS components_json jsonb NOT NULL DEFAULT '{}'::jsonb;

-- For each builtin "main" row per pauta type, fill components_json with __BUILTIN__
-- so the runtime resolves to the hardcoded prompts in standalone-prompts.ts.
UPDATE public.prompt_templates
SET components_json = jsonb_build_object(
  'pauta_completa', '__BUILTIN__',
  'capa',           '__BUILTIN__',
  'titulo',         '__BUILTIN__',
  'descricao',      '__BUILTIN__',
  'segway',         '',
  'custom',         ''
)
WHERE id IN (
  'builtin-anniversary-default',
  'builtin-review-default',
  'builtin-news-default',
  'builtin-interview-default'
);

-- Migrate user custom templates: their existing template_text is the "pauta completa" body.
UPDATE public.prompt_templates
SET components_json = jsonb_build_object(
  'pauta_completa', template_text,
  'capa',           '__BUILTIN__',
  'titulo',         '__BUILTIN__',
  'descricao',      '__BUILTIN__',
  'segway',         '',
  'custom',         ''
)
WHERE is_builtin = false
  AND topic_type IN ('anniversary','review','news','interview','custom');

-- Delete per-component builtin duplicates (consolidation).
DELETE FROM public.prompt_templates
WHERE id LIKE 'builtin-cover-%'
   OR id LIKE 'builtin-title-%'
   OR id LIKE 'builtin-description-%';

-- Normalize names of the surviving builtin "main" rows.
UPDATE public.prompt_templates SET name = 'Aniversário (padrão)'        WHERE id = 'builtin-anniversary-default';
UPDATE public.prompt_templates SET name = 'Review (padrão)'             WHERE id = 'builtin-review-default';
UPDATE public.prompt_templates SET name = 'Notícia (padrão)'            WHERE id = 'builtin-news-default';
UPDATE public.prompt_templates SET name = 'Entrevista (padrão)'         WHERE id = 'builtin-interview-default';

-- Reset sort_order so they come first within each topic_type.
UPDATE public.prompt_templates SET sort_order = 0
WHERE id IN (
  'builtin-anniversary-default',
  'builtin-review-default',
  'builtin-news-default',
  'builtin-interview-default'
);