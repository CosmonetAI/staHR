-- Create profiles for existing auth.users (backfill) and ensure new auth users
-- automatically get a matching row in public.profiles.

-- Backfill missing profiles for existing auth users
INSERT INTO public.profiles (id, email, created_at)
SELECT u.id, u.email, now()
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

-- Function to create or update profile when auth.users changes
CREATE OR REPLACE FUNCTION public.handle_auth_user_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- On INSERT: create a profile if missing
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.profiles (id, email, created_at)
    VALUES (NEW.id, NEW.email, now())
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END IF;

  -- On UPDATE: keep email in sync
  IF (TG_OP = 'UPDATE') THEN
    UPDATE public.profiles
    SET email = NEW.email
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger to run after insert or update on auth.users
DROP TRIGGER IF EXISTS trigger_handle_auth_user_change ON auth.users;
CREATE TRIGGER trigger_handle_auth_user_change
AFTER INSERT OR UPDATE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user_change();
