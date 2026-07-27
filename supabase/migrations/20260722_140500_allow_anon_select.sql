-- 20260722_140500_allow_anon_select.sql
-- Enable row level security and allow anon/authenticated/service_role to SELECT

ALTER TABLE IF EXISTS public.candidates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'candidates' AND policyname = 'candidates_select_allow_anon'
  ) THEN
    CREATE POLICY candidates_select_allow_anon
      ON public.candidates
      FOR SELECT
      USING ( auth.role() = 'service_role' OR auth.role() = 'authenticated' OR auth.role() = 'anon' );
  ELSE
    -- If policy already exists, update its USING clause to include anon
    EXECUTE 'ALTER POLICY candidates_select_allow_anon ON public.candidates USING ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' OR auth.role() = ''anon'' )';
  END IF;
END$$;
