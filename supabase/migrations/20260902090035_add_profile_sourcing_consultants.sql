-- Create profile_sourcing and consultants lookup tables
-- Add foreign keys to candidates table
BEGIN;

-- Create profile_sourcing lookup table
CREATE TABLE IF NOT EXISTS public.profile_sourcing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create consultants lookup table
CREATE TABLE IF NOT EXISTS public.consultants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add columns to candidates table
ALTER TABLE IF EXISTS public.candidates
  ADD COLUMN IF NOT EXISTS profile_sourcing_id UUID NULL,
  ADD COLUMN IF NOT EXISTS consultant_id UUID NULL;

-- Add foreign key constraints (use IF NOT EXISTS pattern via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'candidates' AND tc.constraint_name = 'candidates_profile_sourcing_id_fkey'
  ) THEN
    ALTER TABLE public.candidates ADD CONSTRAINT candidates_profile_sourcing_id_fkey FOREIGN KEY (profile_sourcing_id) REFERENCES public.profile_sourcing(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'candidates' AND tc.constraint_name = 'candidates_consultant_id_fkey'
  ) THEN
    ALTER TABLE public.candidates ADD CONSTRAINT candidates_consultant_id_fkey FOREIGN KEY (consultant_id) REFERENCES public.consultants(id) ON DELETE SET NULL;
  END IF;
END$$;

-- Indexes for lookups
CREATE INDEX IF NOT EXISTS idx_candidates_profile_sourcing_id ON public.candidates(profile_sourcing_id);
CREATE INDEX IF NOT EXISTS idx_candidates_consultant_id ON public.candidates(consultant_id);

-- Seed common profile sourcing values (idempotent)
INSERT INTO public.profile_sourcing (name, is_active)
SELECT v.name, v.is_active FROM (VALUES
  ('Consultant', TRUE),
  ('LinkedIn', TRUE),
  ('Naukri', TRUE),
  ('Referral', TRUE),
  ('Direct Application', TRUE),
  ('Job Portal', TRUE),
  ('Other', TRUE)
) AS v(name, is_active)
ON CONFLICT (name) DO UPDATE SET is_active = EXCLUDED.is_active;

-- Seed some consultant names (idempotent)
INSERT INTO public.consultants (name, is_active)
SELECT v.name, v.is_active FROM (VALUES
  ('ABC Consultants', TRUE),
  ('TalentBridge', TRUE),
  ('TopRecruiters Pvt Ltd', TRUE),
  ('Staffing Solutions', TRUE),
  ('XYZ Recruiters', TRUE)
) AS v(name, is_active)
ON CONFLICT (name) DO UPDATE SET is_active = EXCLUDED.is_active;

COMMIT;

-- Enable RLS and create simple SELECT policies so authenticated users can read lookup tables
BEGIN;
ALTER TABLE IF EXISTS public.profile_sourcing ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profile_sourcing' AND policyname = 'profile_sourcing_select_auth_or_service') THEN
    CREATE POLICY profile_sourcing_select_auth_or_service
      ON public.profile_sourcing FOR SELECT
      USING ( auth.role() = 'service_role' OR auth.role() = 'authenticated' );
  END IF;
END$$;

ALTER TABLE IF EXISTS public.consultants ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consultants' AND policyname = 'consultants_select_auth_or_service') THEN
    CREATE POLICY consultants_select_auth_or_service
      ON public.consultants FOR SELECT
      USING ( auth.role() = 'service_role' OR auth.role() = 'authenticated' );
  END IF;
END$$;

COMMIT;
