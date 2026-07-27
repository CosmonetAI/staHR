-- 20260722_131500_candidates_rls_policies.sql

-- Ensure row level security is enabled (Supabase may enable it by default)
ALTER TABLE IF EXISTS public.candidates ENABLE ROW LEVEL SECURITY;

-- Allow SELECT for authenticated users and service role (so UI can list candidates)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'candidates' AND policyname = 'candidates_select_auth_or_service'
  ) THEN
    CREATE POLICY candidates_select_auth_or_service
      ON public.candidates
      FOR SELECT
      -- Allow service_role, authenticated users, and anon (frontend) to SELECT for dev convenience
      USING ( auth.role() = 'service_role' OR auth.role() = 'authenticated' OR auth.role() = 'anon' );
  END IF;
END$$;

-- Allow INSERT for authenticated users (frontend) and service role (edge functions)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'candidates' AND policyname = 'candidates_insert_auth_or_service'
  ) THEN
    CREATE POLICY candidates_insert_auth_or_service
      ON public.candidates
      FOR INSERT
      WITH CHECK ( auth.role() = 'service_role' OR auth.role() = 'authenticated' );
  END IF;
END$$;

-- Allow UPDATE only for service role by default (prevent arbitrary frontend edits)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'candidates' AND policyname = 'candidates_update_service_only'
  ) THEN
    CREATE POLICY candidates_update_service_only
      ON public.candidates
      FOR UPDATE
      USING ( auth.role() = 'service_role' ) ;
  END IF;
END$$;

-- Allow DELETE only for service role
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'candidates' AND policyname = 'candidates_delete_service_only'
  ) THEN
    CREATE POLICY candidates_delete_service_only
      ON public.candidates
      FOR DELETE
      USING ( auth.role() = 'service_role' );
  END IF;
END$$;

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
