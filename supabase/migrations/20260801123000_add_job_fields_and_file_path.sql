-- Add additional job fields and a file_path to store uploaded job description files
ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS employment_type text,
  ADD COLUMN IF NOT EXISTS experience_min integer,
  ADD COLUMN IF NOT EXISTS experience_max integer,
  ADD COLUMN IF NOT EXISTS work_mode text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS responsibilities text,
  ADD COLUMN IF NOT EXISTS technical_skills text[],
  ADD COLUMN IF NOT EXISTS qualifications text,
  ADD COLUMN IF NOT EXISTS preferred_skills text[],
  ADD COLUMN IF NOT EXISTS nice_to_have text,
  ADD COLUMN IF NOT EXISTS file_path text;

-- No trigger changes required for these additions
