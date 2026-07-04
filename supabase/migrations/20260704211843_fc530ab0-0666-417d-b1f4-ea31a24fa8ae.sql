
-- Purge singles_videos older than 30 days (daily at 04:15 UTC)
SELECT cron.unschedule('purge-old-singles-videos') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='purge-old-singles-videos');

SELECT cron.schedule(
  'purge-old-singles-videos',
  '15 4 * * *',
  $$DELETE FROM public.singles_videos WHERE COALESCE(published_at, created_at) < now() - interval '30 days'$$
);
