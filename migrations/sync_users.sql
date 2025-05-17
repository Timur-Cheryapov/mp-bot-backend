-- Migration: Sync users from auth.users to public.users

-- Create a function that will be triggered on auth user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    'user',
    NEW.created_at
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to call this function whenever a user is created in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- One-time script to synchronize existing users
INSERT INTO public.users (id, email, role, created_at)
SELECT id, email, 'user', created_at
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  role = EXCLUDED.role;

-- Create or update an RLS policy to restrict users to their own records
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_policy ON public.users;
CREATE POLICY users_policy ON public.users
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.users TO anon, authenticated, service_role;
