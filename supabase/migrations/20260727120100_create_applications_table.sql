-- Create applications table linking jobs and candidates
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'application_status') THEN
    CREATE TYPE public.application_status AS ENUM ('applied','screening','interviewing','offered','selected','rejected','withdrawn');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  applied_at timestamptz NOT NULL DEFAULT now(),
  status public.application_status DEFAULT 'applied',
  stage text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applications_job_id ON public.applications (job_id);
CREATE INDEX IF NOT EXISTS idx_applications_candidate_id ON public.applications (candidate_id);

-- trigger to update updated_at
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at_applications()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_applications ON public.applications;
CREATE TRIGGER trg_set_updated_at_applications
BEFORE UPDATE ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_updated_at_applications();
