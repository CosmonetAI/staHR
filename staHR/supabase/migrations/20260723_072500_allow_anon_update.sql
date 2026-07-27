-- 20260723_072500_allow_anon_update.sql
-- Enable row level security and allow anon/authenticated/service_role to UPDATE (development only)

ALTER TABLE IF EXISTS public.candidates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'candidates' AND policyname = 'candidates_update_service_only'
  ) THEN
    -- if the restrictive policy exists, alter it to allow anon and authenticated as well (dev convenience)
    EXECUTE 'ALTER POLICY candidates_update_service_only ON public.candidates USING ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' OR auth.role() = ''anon'' ) WITH CHECK ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' OR auth.role() = ''anon'' )';
  ELSE
    -- create a permissive update policy if none exists
    CREATE POLICY candidates_update_allow_anon
      ON public.candidates
      FOR UPDATE
      USING ( auth.role() = 'service_role' OR auth.role() = 'authenticated' OR auth.role() = 'anon' )
      WITH CHECK ( auth.role() = 'service_role' OR auth.role() = 'authenticated' OR auth.role() = 'anon' );
  END IF;
END$$;
