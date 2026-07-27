-- 20260723_074000_allow_anon_delete.sql
-- Enable row level security and allow anon/authenticated/service_role to DELETE (development only)

ALTER TABLE IF EXISTS public.candidates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'candidates' AND policyname = 'candidates_delete_service_only'
  ) THEN
    -- if the restrictive policy exists, alter it to allow anon and authenticated as well (dev convenience)
    EXECUTE 'ALTER POLICY candidates_delete_service_only ON public.candidates USING ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' OR auth.role() = ''anon'' )';
  ELSE
    -- create a permissive delete policy if none exists
    CREATE POLICY candidates_delete_allow_anon
      ON public.candidates
      FOR DELETE
      USING ( auth.role() = 'service_role' OR auth.role() = 'authenticated' OR auth.role() = 'anon' );
  END IF;
END$$;
