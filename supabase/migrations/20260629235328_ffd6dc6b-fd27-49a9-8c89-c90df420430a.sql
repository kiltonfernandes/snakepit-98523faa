DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'preprod_pautas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.preprod_pautas;
  END IF;
END $$;