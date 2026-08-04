-- Add client_feedback column to candidates
ALTER TABLE IF EXISTS public.candidates
  ADD COLUMN IF NOT EXISTS client_feedback text;

-- No RLS changes here; client-side enforces editability and migrations keep schema backward compatible.
