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
