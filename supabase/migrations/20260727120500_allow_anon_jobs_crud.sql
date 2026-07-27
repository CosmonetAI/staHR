-- Enable RLS and allow anon users full CRUD on public.jobs

-- Enable Row Level Security on jobs
ALTER TABLE public.jobs
  ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for anonymous (public) access
-- Drop existing permissive policies if present (make migration idempotent)
DROP POLICY IF EXISTS "Allow anon select on jobs" ON public.jobs;
DROP POLICY IF EXISTS "Allow anon insert on jobs" ON public.jobs;
DROP POLICY IF EXISTS "Allow anon update on jobs" ON public.jobs;
DROP POLICY IF EXISTS "Allow anon delete on jobs" ON public.jobs;

CREATE POLICY "Allow anon select on jobs" ON public.jobs
  FOR SELECT
  USING (true);

CREATE POLICY "Allow anon insert on jobs" ON public.jobs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow anon update on jobs" ON public.jobs
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anon delete on jobs" ON public.jobs
  FOR DELETE
  USING (true);

-- Grant object privileges to the anon role (optional but explicit)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO anon;

-- NOTE: This makes the jobs table fully public. Review carefully before applying to production.
