CREATE TABLE public.ai_usage_logs (
  id text NOT NULL PRIMARY KEY,
  created_at text NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'::text),
  scope text NOT NULL DEFAULT 'general',
  episode_date text,
  week_id text,
  tokens_input integer NOT NULL DEFAULT 0,
  tokens_output integer NOT NULL DEFAULT 0,
  model text NOT NULL DEFAULT 'unknown',
  estimated_cost real NOT NULL DEFAULT 0
);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on ai_usage_logs"
  ON public.ai_usage_logs
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);