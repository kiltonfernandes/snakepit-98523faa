ALTER TABLE public.prompt_templates ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS prompt_templates_sort_order_idx ON public.prompt_templates (topic_type, sort_order);

-- Initialize sort_order based on current name ordering within each topic_type
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY topic_type ORDER BY is_default DESC, name) * 10 AS rn
  FROM public.prompt_templates
)
UPDATE public.prompt_templates p
SET sort_order = ranked.rn
FROM ranked
WHERE ranked.id = p.id AND p.sort_order = 0;