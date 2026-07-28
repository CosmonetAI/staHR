-- 20260728_150000_create_clients_table.sql

-- Create clients table and link to jobs
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger to update updated_at for clients
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at_clients()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_clients ON public.clients;
CREATE TRIGGER trg_set_updated_at_clients
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_updated_at_clients();

-- Add client_id column to jobs table
ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

-- Optional index for quick lookup by client
CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON public.jobs (client_id);

-- Enable row level security on clients and allow anon (and authenticated) access via policies
ALTER TABLE IF EXISTS public.clients ENABLE ROW LEVEL SECURITY;

-- Allow read for anon and authenticated
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'clients_select_anon') THEN
    CREATE POLICY clients_select_anon ON public.clients FOR SELECT USING (auth.role() = 'anon' OR auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'clients_insert_anon') THEN
    CREATE POLICY clients_insert_anon ON public.clients FOR INSERT WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'clients_update_anon') THEN
    CREATE POLICY clients_update_anon ON public.clients FOR UPDATE USING (auth.role() = 'anon' OR auth.role() = 'authenticated') WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'clients_delete_anon') THEN
    CREATE POLICY clients_delete_anon ON public.clients FOR DELETE USING (auth.role() = 'anon' OR auth.role() = 'authenticated');
  END IF;
END$$;

