-- Add `job_id` column with human-friendly auto-generated values (job-1, job-2, ...)
DO $$ BEGIN
  -- ensure sequence exists
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'jobs_seq') THEN
    CREATE SEQUENCE public.jobs_seq START 1;
  END IF;
END$$;

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS job_id text;

-- If `job_ref` exists, copy it to `job_id` for existing rows
UPDATE public.jobs SET job_id = job_ref WHERE job_id IS NULL AND job_ref IS NOT NULL;

-- For any remaining rows, populate from sequence
UPDATE public.jobs SET job_id = 'job-' || nextval('jobs_seq')::text WHERE job_id IS NULL;

-- Set default for new rows
ALTER TABLE public.jobs ALTER COLUMN job_id SET DEFAULT ('job-' || nextval('jobs_seq')::text);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_job_id ON public.jobs (job_id);
