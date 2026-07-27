-- Add applied_job_id and applied_job_title to candidates
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS applied_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS applied_job_title text;

CREATE INDEX IF NOT EXISTS idx_candidates_applied_job_id ON public.candidates (applied_job_id);
