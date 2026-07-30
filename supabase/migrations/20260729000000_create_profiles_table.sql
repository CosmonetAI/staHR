-- Create profiles table to store user profile details linked to auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable row level security to allow controlled access if desired
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow service_role and authenticated users to select their profile (example policy)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_auth_or_service') THEN
    CREATE POLICY profiles_select_auth_or_service
      ON public.profiles
      FOR SELECT
      USING (auth.role() = 'service_role' OR auth.role() = 'authenticated' OR auth.role() = 'anon');
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- ignore on platforms that don't support runtimes
  RAISE NOTICE 'Could not create policy for profiles: %', SQLERRM;
END$$;

-- Optional: ensure email uniqueness if you want one profile per email
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'profiles' AND indexname = 'profiles_email_idx') THEN
    BEGIN
      EXECUTE 'CREATE UNIQUE INDEX profiles_email_idx ON public.profiles(email)';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not create profiles email index: %', SQLERRM;
    END;
  END IF;
END$$;
