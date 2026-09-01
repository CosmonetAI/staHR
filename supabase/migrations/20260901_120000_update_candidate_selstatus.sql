-- 20260901_120000_update_candidate_selstatus.sql
-- Migration: replace candidate_selstatus enum values with expanded, descriptive labels

-- Create a new enum type with the desired labels (if it doesn't already exist)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'candidate_selstatus_new') THEN
    CREATE TYPE public.candidate_selstatus_new AS ENUM (
      'Pre-screening in-progress',
      'Pre-screening done and submitted for evaluation',
      'Evaluation in-progress',
      'Evaluation done and submitted for sharing with client',
      'Profile shared with client',
      'Scheduled for L1 discussion',
      'Scheduled for L2 discussion',
      'Scheduled for L3 discussion',
      'Candidate shortlisted',
      'On hold',
      'Rejected',
      'Dropped Out'
    );
  END IF;
END$$;

BEGIN;

-- Remove default temporarily so we can alter type safely
ALTER TABLE public.candidates ALTER COLUMN selstatus DROP DEFAULT;

-- Change column to plain text to allow value remapping
ALTER TABLE public.candidates ALTER COLUMN selstatus TYPE text USING selstatus::text;

-- Map legacy enum tokens to the new descriptive labels. Any unknown/custom values are preserved.
UPDATE public.candidates SET selstatus =
  CASE selstatus
    WHEN 'progress' THEN 'Pre-screening in-progress'
    WHEN 'hold' THEN 'On hold'
    WHEN 'selected' THEN 'Candidate shortlisted'
    WHEN 'rejected' THEN 'Rejected'
    WHEN 'dropped' THEN 'Dropped Out'
    ELSE selstatus
  END;

-- Convert the column to the new enum type and set a sensible default
ALTER TABLE public.candidates ALTER COLUMN selstatus TYPE public.candidate_selstatus_new USING selstatus::public.candidate_selstatus_new;
ALTER TABLE public.candidates ALTER COLUMN selstatus SET DEFAULT 'Pre-screening in-progress';

-- Drop the old enum type if it exists, then rename the new type to the original name so code continues to reference
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'candidate_selstatus') THEN
    DROP TYPE public.candidate_selstatus;
  END IF;
END$$;

ALTER TYPE public.candidate_selstatus_new RENAME TO candidate_selstatus;

COMMIT;

-- Notes:
-- - This migration preserves any custom/non-standard selstatus values (they will remain as-is).
-- - The migration maps legacy tokens ('progress','hold','selected','rejected','dropped') to the new descriptive labels.
-- - After this migration the enum name remains `candidate_selstatus` but contains the expanded labels.
