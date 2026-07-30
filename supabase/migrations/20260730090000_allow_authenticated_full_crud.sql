-- 20260730_090000_allow_authenticated_full_crud.sql

-- Grant full CRUD (SELECT, INSERT, UPDATE, DELETE) to authenticated users
-- for the main application tables. This is a permissive development policy
-- enabling any logged-in user to perform all operations. Use with caution
-- in production; adjust policies to enforce ownership or finer-grained rules.

DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY['candidates','uploads','jobs','applications','clients','profiles'];
BEGIN
  -- List of tables to apply permissive authenticated policies to
  FOREACH tbl IN ARRAY tbls LOOP
    -- Enable RLS on the table if not already
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY;', tbl);

    -- SELECT
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = tbl || '_select_auth') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' );', tbl || '_select_auth', tbl);
    ELSE
      EXECUTE format('ALTER POLICY %I ON public.%I USING ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' );', tbl || '_select_auth', tbl);
    END IF;

    -- INSERT
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = tbl || '_insert_auth') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' );', tbl || '_insert_auth', tbl);
    ELSE
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' );', tbl || '_insert_auth', tbl);
    END IF;

    -- UPDATE
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = tbl || '_update_auth') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' ) WITH CHECK ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' );', tbl || '_update_auth', tbl);
    ELSE
      EXECUTE format('ALTER POLICY %I ON public.%I USING ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' ) WITH CHECK ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' );', tbl || '_update_auth', tbl);
    END IF;

    -- DELETE
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = tbl || '_delete_auth') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' );', tbl || '_delete_auth', tbl);
    ELSE
      EXECUTE format('ALTER POLICY %I ON public.%I USING ( auth.role() = ''service_role'' OR auth.role() = ''authenticated'' );', tbl || '_delete_auth', tbl);
    END IF;
  END LOOP;
END$$;

-- Note: This migration intentionally grants broad privileges to any authenticated
-- user. For production, prefer policies that restrict UPDATE/DELETE to resource
-- owners or service roles and avoid exposing sensitive tables to all users.
