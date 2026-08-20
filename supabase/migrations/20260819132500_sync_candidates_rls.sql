-- Sync candidates RLS policies to match main branch (idempotent)
-- This migration ensures the dev database has the same candidate policies
-- as the main branch by creating or altering policies as needed.

-- Enable row level security if not already
ALTER TABLE IF EXISTS public.candidates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'candidates' AND policyname = 'candidates_select_auth_or_service'
  ) THEN
    CREATE POLICY candidates_select_auth_or_service
      ON public.candidates
      FOR SELECT
      USING ( auth.role() = 'service_role' OR auth.role() = 'authenticated' );
  ELSE
    EXECUTE 'ALTER POLICY candidates_select_auth_or_service ON public.candidates USING ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' )';
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'candidates' AND policyname = 'candidates_insert_auth_or_service'
  ) THEN
    CREATE POLICY candidates_insert_auth_or_service
      ON public.candidates
      FOR INSERT
      WITH CHECK ( auth.role() = 'service_role' OR auth.role() = 'authenticated' );
  ELSE
    EXECUTE 'ALTER POLICY candidates_insert_auth_or_service ON public.candidates WITH CHECK ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' )';
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'candidates' AND policyname = 'candidates_update_service_only'
  ) THEN
    CREATE POLICY candidates_update_service_only
      ON public.candidates
      FOR UPDATE
      USING ( auth.role() = 'service_role' OR auth.role() = 'authenticated' OR auth.role() = 'anon' );
  ELSE
    EXECUTE 'ALTER POLICY candidates_update_service_only ON public.candidates USING ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' OR auth.role() = ''anon'' )';
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'candidates' AND policyname = 'candidates_delete_service_only'
  ) THEN
    CREATE POLICY candidates_delete_service_only
      ON public.candidates
      FOR DELETE
      USING ( auth.role() = 'service_role' OR auth.role() = 'authenticated' OR auth.role() = 'anon' );
  ELSE
    EXECUTE 'ALTER POLICY candidates_delete_service_only ON public.candidates USING ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' OR auth.role() = ''anon'' )';
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'candidates' AND policyname = 'candidates_select_allow_anon'
  ) THEN
    CREATE POLICY candidates_select_allow_anon
      ON public.candidates
      FOR SELECT
      USING ( auth.role() = 'service_role' OR auth.role() = 'authenticated' OR auth.role() = 'anon' );
  ELSE
    EXECUTE 'ALTER POLICY candidates_select_allow_anon ON public.candidates USING ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' OR auth.role() = ''anon'' )';
  END IF;
END$$;

-- Also ensure permissive auth policies exist mirroring main branch
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'candidates' AND policyname = 'candidates_update_auth'
  ) THEN
    CREATE POLICY candidates_update_auth
      ON public.candidates
      FOR UPDATE
      USING ( auth.role() = 'service_role' OR auth.role() = 'authenticated' )
      WITH CHECK ( auth.role() = 'service_role' OR auth.role() = 'authenticated' );
  ELSE
    EXECUTE 'ALTER POLICY candidates_update_auth ON public.candidates USING ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' ) WITH CHECK ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' )';
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'candidates' AND policyname = 'candidates_delete_auth'
  ) THEN
    CREATE POLICY candidates_delete_auth
      ON public.candidates
      FOR DELETE
      USING ( auth.role() = 'service_role' OR auth.role() = 'authenticated' );
  ELSE
    EXECUTE 'ALTER POLICY candidates_delete_auth ON public.candidates USING ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' )';
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'candidates' AND policyname = 'candidates_select_auth'
  ) THEN
    CREATE POLICY candidates_select_auth
      ON public.candidates
      FOR SELECT
      USING ( auth.role() = 'service_role' OR auth.role() = 'authenticated' );
  ELSE
    EXECUTE 'ALTER POLICY candidates_select_auth ON public.candidates USING ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' )';
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'candidates' AND policyname = 'candidates_insert_auth'
  ) THEN
    CREATE POLICY candidates_insert_auth
      ON public.candidates
      FOR INSERT
      WITH CHECK ( auth.role() = 'service_role' OR auth.role() = 'authenticated' );
  ELSE
    EXECUTE 'ALTER POLICY candidates_insert_auth ON public.candidates WITH CHECK ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' )';
  END IF;
END$$;
