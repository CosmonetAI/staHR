-- Fix jobs sequence usage:
-- Ensure the sequence increments once per job and job_id remains sequential.

-- 1. Create sequence if it does not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relname = 'jobs_seq'
      AND relkind = 'S'
  ) THEN
    CREATE SEQUENCE public.jobs_seq START WITH 1;
  END IF;
END $$;


-- 2. Ensure job_ref and job_id columns exist
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS job_ref text;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS job_id text;


-- 3. Populate missing job_ref from existing job_id
UPDATE public.jobs
SET job_ref = job_id
WHERE job_ref IS NULL
  AND job_id IS NOT NULL;


-- 4. Populate missing job_id from existing job_ref
UPDATE public.jobs
SET job_id = job_ref
WHERE job_id IS NULL
  AND job_ref IS NOT NULL;


-- 5. Find the highest numeric value currently used
--    and position the sequence correctly.
DO $$
DECLARE
  maxnum bigint := 0;
BEGIN

  SELECT COALESCE(
    MAX(
      NULLIF(
        regexp_replace(
          COALESCE(job_id, job_ref, ''),
          '\D',
          '',
          'g'
        ),
        ''
      )::bigint
    ),
    0
  )
  INTO maxnum
  FROM public.jobs;

  IF maxnum < 1 THEN

    -- No existing numeric job IDs.
    -- Set sequence so the next nextval() returns 1.
    PERFORM setval(
      'public.jobs_seq',
      1,
      false
    );

  ELSE

    -- Existing jobs found.
    -- The next nextval() will return maxnum + 1.
    PERFORM setval(
      'public.jobs_seq',
      maxnum,
      true
    );

  END IF;

END $$;


-- 6. Remove any existing default from job_ref.
--    job_ref will be synchronized from job_id by the trigger.
ALTER TABLE public.jobs
  ALTER COLUMN job_ref DROP DEFAULT;


-- 7. Ensure job_id uses the sequence.
ALTER TABLE public.jobs
  ALTER COLUMN job_id
  SET DEFAULT ('job-' || nextval('public.jobs_seq')::text);


-- 8. Populate missing job_id values.
--    Each missing row receives exactly one sequence value.
UPDATE public.jobs
SET job_id = 'job-' || nextval('public.jobs_seq')::text
WHERE job_id IS NULL
   OR job_id = '';


-- 9. Populate job_ref for rows that received a job_id.
UPDATE public.jobs
SET job_ref = job_id
WHERE job_ref IS NULL
   OR job_ref = '';


-- 10. Create unique indexes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_job_id
  ON public.jobs (job_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_job_ref
  ON public.jobs (job_ref);


-- 11. Keep job_ref synchronized with job_id for new records.
CREATE OR REPLACE FUNCTION public.jobs_sync_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
BEGIN

  IF NEW.job_ref IS NULL OR NEW.job_ref = '' THEN
    NEW.job_ref := NEW.job_id;
  END IF;

  RETURN NEW;

END;
$func$;


-- 12. Create synchronization trigger if it doesn't already exist.
DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'jobs_sync_ref_trigger'
  ) THEN

    EXECUTE '
      CREATE TRIGGER jobs_sync_ref_trigger
      BEFORE INSERT ON public.jobs
      FOR EACH ROW
      EXECUTE FUNCTION public.jobs_sync_ref()
    ';

  END IF;

END $$;