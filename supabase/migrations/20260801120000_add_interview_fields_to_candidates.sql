-- Add interview slot and confirmed availability columns to candidates
ALTER TABLE IF EXISTS public.candidates
  ADD COLUMN IF NOT EXISTS interview_slot text,
  ADD COLUMN IF NOT EXISTS confirmed_availability text;

-- No need for triggers changes; these are simple text fields to store import/form values.
