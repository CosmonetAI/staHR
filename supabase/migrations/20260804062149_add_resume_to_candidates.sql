-- 20260804_add_resume_to_candidates.sql

-- Add resume fields to candidates
ALTER TABLE IF EXISTS public.candidates
  ADD COLUMN IF NOT EXISTS resume_url text;

ALTER TABLE IF EXISTS public.candidates
  ADD COLUMN IF NOT EXISTS resume_path text;

-- Optional index for quick lookup by resume_path
CREATE INDEX IF NOT EXISTS idx_candidates_resume_path ON public.candidates (resume_path);
