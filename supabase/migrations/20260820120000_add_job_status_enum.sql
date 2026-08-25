BEGIN;

-- 1. Remove the existing default before changing the column type
ALTER TABLE public.jobs
ALTER COLUMN status DROP DEFAULT;

-- 2. Normalize existing status values and cast back to enum (if enum exists)
-- 2. Normalize existing status values to allowed enum labels (keep as text for now)
-- Map any unknown/legacy values to 'open' as a safe default
UPDATE public.jobs
SET status = CASE
    WHEN lower(trim(status::text)) IN ('draft','open','closed') THEN lower(trim(status::text))
    WHEN status IS NULL THEN NULL
    ELSE 'open'
END
WHERE status IS NOT NULL;

-- 3. Create enum type if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'job_status'
    ) THEN
        CREATE TYPE public.job_status AS ENUM (
            'draft',
            'open',
            'closed'
        );
    END IF;
END
$$;

-- 4. Convert status column from text to enum
ALTER TABLE public.jobs
ALTER COLUMN status TYPE public.job_status
USING status::public.job_status;

-- 5. Set enum default
ALTER TABLE public.jobs
ALTER COLUMN status SET DEFAULT 'open'::public.job_status;

COMMIT;