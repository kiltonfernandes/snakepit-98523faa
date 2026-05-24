CREATE TABLE public.prompt_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  topic_type text NOT NULL,
  template_text text NOT NULL,
  description text DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  is_builtin boolean NOT NULL DEFAULT false,
  created_at text NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  updated_at text NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
);

CREATE INDEX idx_prompt_templates_type ON public.prompt_templates(topic_type);

ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on prompt_templates"
ON public.prompt_templates
FOR ALL
USING (true)
WITH CHECK (true);