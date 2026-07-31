-- Add user_id to clients to link to auth.users
ALTER TABLE IF EXISTS public.clients
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for quick lookup by user_id
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON public.clients (user_id);

-- Optional: ensure client lookup by user is fast
ANALYZE public.clients;
