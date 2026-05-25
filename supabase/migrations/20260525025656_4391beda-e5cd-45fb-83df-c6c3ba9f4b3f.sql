ALTER TABLE public.prompt_templates ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'content';
CREATE INDEX IF NOT EXISTS prompt_templates_stage_idx ON public.prompt_templates (topic_type, stage, sort_order);

-- Seed built-in title/description/cover per topic type (content stage already seeded historically)
INSERT INTO public.prompt_templates (id, name, topic_type, stage, template_text, description, google_query, google_images_query, sort_order, is_default, is_builtin, created_at, updated_at)
SELECT
  'builtin-' || stage_key || '-' || tt AS id,
  CASE stage_key
    WHEN 'title' THEN label || ' · Título (padrão)'
    WHEN 'description' THEN label || ' · Descrição (padrão)'
    WHEN 'cover' THEN label || ' · Capa (padrão)'
  END,
  tt,
  stage_key,
  '__BUILTIN__',
  CASE stage_key
    WHEN 'title' THEN 'Gera 3 opções de título a partir do conteúdo do episódio.'
    WHEN 'description' THEN 'Gera o HTML da descrição do episódio.'
    WHEN 'cover' THEN 'Gera a direção visual da capa 3000×3000.'
  END,
  '', '', 0, true, true,
  to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"')
FROM (VALUES
  ('anniversary','🎂 Aniversário'),
  ('review','💿 Review'),
  ('news','📰 Notícia'),
  ('interview','🎙️ Entrevista'),
  ('custom','✨ Outro')
) AS t(tt, label)
CROSS JOIN (VALUES ('title'), ('description'), ('cover')) AS s(stage_key)
ON CONFLICT (id) DO NOTHING;