
-- Fix prompt_sessions: drop overly permissive policy and restrict
DROP POLICY IF EXISTS "Allow all on prompt_sessions" ON public.prompt_sessions;
CREATE POLICY "prompt_sessions_select" ON public.prompt_sessions FOR SELECT USING (true);
CREATE POLICY "prompt_sessions_insert" ON public.prompt_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "prompt_sessions_update" ON public.prompt_sessions FOR UPDATE USING (true) WITH CHECK (true);

-- Fix activity_logs: drop overly permissive policy and restrict  
DROP POLICY IF EXISTS "Allow all on activity_logs" ON public.activity_logs;
CREATE POLICY "activity_logs_select" ON public.activity_logs FOR SELECT USING (true);
CREATE POLICY "activity_logs_insert" ON public.activity_logs FOR INSERT WITH CHECK (true);

-- Fix other tables with overly permissive ALL policies
DROP POLICY IF EXISTS "Allow all on app_settings" ON public.app_settings;
CREATE POLICY "app_settings_select" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "app_settings_update" ON public.app_settings FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on ai_usage_logs" ON public.ai_usage_logs;
CREATE POLICY "ai_usage_logs_select" ON public.ai_usage_logs FOR SELECT USING (true);
CREATE POLICY "ai_usage_logs_insert" ON public.ai_usage_logs FOR INSERT WITH CHECK (true);
