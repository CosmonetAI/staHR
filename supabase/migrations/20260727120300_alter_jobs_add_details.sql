-- Add detailed job fields to jobs table
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS employment_type text,
  ADD COLUMN IF NOT EXISTS experience_min integer,
  ADD COLUMN IF NOT EXISTS experience_max integer,
  ADD COLUMN IF NOT EXISTS work_mode text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS responsibilities text,
  ADD COLUMN IF NOT EXISTS technical_skills jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS qualifications text,
  ADD COLUMN IF NOT EXISTS preferred_skills text,
  -- removed: soft_skills, daily_responsibilities, benefits
  ADD COLUMN IF NOT EXISTS nice_to_have text;

-- Backfill summary from description if missing
UPDATE public.jobs SET summary = description WHERE summary IS NULL AND description IS NOT NULL;

-- Create GIN index for technical_skills search
CREATE INDEX IF NOT EXISTS idx_jobs_technical_skills ON public.jobs USING gin (technical_skills);
