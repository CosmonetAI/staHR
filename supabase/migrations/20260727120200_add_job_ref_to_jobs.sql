-- Add human-readable job_ref column with sequence-based defaults
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'jobs_seq') THEN
    CREATE SEQUENCE public.jobs_seq START 1;
  END IF;
END$$;

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS job_ref text;

-- Populate existing rows with job_ref if missing
UPDATE public.jobs SET job_ref = 'job-' || nextval('jobs_seq')::text WHERE job_ref IS NULL;

-- Set default for new rows
ALTER TABLE public.jobs ALTER COLUMN job_ref SET DEFAULT ('job-' || nextval('jobs_seq')::text);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_job_ref ON public.jobs (job_ref);
