-- 20260722_130000_init_schema.sql

-- Consolidated initial schema: candidates + uploads + enums + triggers

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'candidate_selstatus') THEN
    CREATE TYPE public.candidate_selstatus AS ENUM ('progress','hold','selected','rejected','dropped');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'uploads_status') THEN
    CREATE TYPE public.uploads_status AS ENUM ('pending','processing','succeeded','failed');
  END IF;
END$$;

-- Uploads/ingest records (create first so candidates can reference uploads)
CREATE TABLE IF NOT EXISTS public.uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_date timestamptz NOT NULL DEFAULT now(),
  total_records integer DEFAULT 0,
  successful_records integer DEFAULT 0,
  failed_records integer DEFAULT 0,
  report jsonb DEFAULT '{}'::jsonb,
  status public.uploads_status DEFAULT 'pending'
);

-- Candidates table
CREATE TABLE IF NOT EXISTS public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Fields matching the Add Candidate UI
  name text NOT NULL,
  role text,
  date date,
  exp text,
  cctc text,
  ectc text,
  email text,
  phone text,
  linkedin text,
  location text,
  np text,
  availability text,
  intstatus text,
  selstatus public.candidate_selstatus DEFAULT 'progress',
  remarks text,
  f2f text,
  upload_id uuid REFERENCES public.uploads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.candidates;
CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.candidates
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_candidates_created_at ON public.candidates (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_uploads_uploaded_date ON public.uploads (uploaded_date DESC);
