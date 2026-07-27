-- Fix jobs sequence usage: ensure sequence increments once per job and job_id is sequential
DO $$ BEGIN
  -- create sequence if missing
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'jobs_seq') THEN
    CREATE SEQUENCE public.jobs_seq START 1;
  END IF;
END$$;

-- Ensure job_ref and job_id exist
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS job_ref text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS job_id text;

-- Populate missing job_ref from job_id or vice versa so we have numeric parts
UPDATE public.jobs SET job_ref = job_id WHERE job_ref IS NULL AND job_id IS NOT NULL;
UPDATE public.jobs SET job_id = job_ref WHERE job_id IS NULL AND job_ref IS NOT NULL;

-- Compute the current max numeric suffix used in job_id/job_ref
DO $$
DECLARE
  maxnum int := 0;
  v text;
BEGIN
  SELECT COALESCE(MAX((regexp_replace(coalesce(job_id, job_ref, ''), '\D', '', 'g'))::int), 0) INTO maxnum FROM public.jobs;
  IF maxnum < 1 THEN
    maxnum := 0;
  END IF;
  -- set sequence to maxnum so nextval returns maxnum+1
  PERFORM setval('public.jobs_seq', maxnum, true);
END$$;

-- Drop default on job_ref to avoid consuming sequence twice
ALTER TABLE public.jobs ALTER COLUMN job_ref DROP DEFAULT;

-- Ensure job_id default uses sequence
ALTER TABLE public.jobs ALTER COLUMN job_id SET DEFAULT ('job-' || nextval('public.jobs_seq')::text);

-- Populate missing job_id values using the sequence for any remaining rows
UPDATE public.jobs SET job_id = 'job-' || nextval('public.jobs_seq')::text WHERE job_id IS NULL OR job_id = '';

-- Create unique index if missing
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_job_id ON public.jobs (job_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_job_ref ON public.jobs (job_ref);

-- Optional: keep job_ref in sync for legacy usage (make job_ref default to job_id on insert via trigger)
-- Create or replace the trigger function, then create trigger only if missing
CREATE OR REPLACE FUNCTION public.jobs_sync_ref() RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  IF NEW.job_ref IS NULL THEN
    NEW.job_ref := NEW.job_id;
  END IF;
  RETURN NEW;
END;
$func$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'jobs_sync_ref_trigger') THEN
    EXECUTE 'CREATE TRIGGER jobs_sync_ref_trigger BEFORE INSERT ON public.jobs FOR EACH ROW EXECUTE PROCEDURE public.jobs_sync_ref()';
  END IF;
END$$;
