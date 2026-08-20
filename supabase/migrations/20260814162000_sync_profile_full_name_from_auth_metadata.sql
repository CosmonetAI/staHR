-- Keep profiles in sync with auth user email/name without requiring browser-side inserts.
CREATE OR REPLACE FUNCTION public.handle_auth_user_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.profiles (id, email, full_name, metadata, created_at)
    VALUES (
      NEW.id,
      NEW.email,
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data,
      now()
    )
    ON CONFLICT (id) DO UPDATE
    SET
      email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      metadata = COALESCE(EXCLUDED.metadata, public.profiles.metadata);

    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    UPDATE public.profiles
    SET
      email = NEW.email,
      full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', full_name),
      metadata = COALESCE(NEW.raw_user_meta_data, metadata)
    WHERE id = NEW.id;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_handle_auth_user_change ON auth.users;
CREATE TRIGGER trigger_handle_auth_user_change
AFTER INSERT OR UPDATE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user_change();

UPDATE public.profiles p
SET
  full_name = COALESCE(u.raw_user_meta_data->>'full_name', p.full_name),
  metadata = COALESCE(u.raw_user_meta_data, p.metadata)
FROM auth.users u
WHERE p.id = u.id;
