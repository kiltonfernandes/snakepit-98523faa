ALTER TABLE public.youtube_channels ALTER COLUMN feed_url DROP NOT NULL;
ALTER TABLE public.youtube_channels ADD COLUMN IF NOT EXISTS channel_id text;