-- Migration: Update conversations foreign key to reference auth.users directly

-- First drop the old foreign key constraint
ALTER TABLE IF EXISTS public.conversations 
DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;

-- Add the new foreign key constraint that references auth.users
ALTER TABLE public.conversations
ADD CONSTRAINT conversations_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES auth.users(id)
ON DELETE CASCADE;

-- Update the Row Level Security policy for conversations
ALTER TABLE IF EXISTS public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_policy ON public.conversations;
CREATE POLICY conversations_policy ON public.conversations
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Grant necessary permissions to Supabase roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT ON public.conversations TO anon, service_role;

-- Since the custom users table is no longer needed for auth purposes,
-- we can drop it if you want (commented out for safety, uncomment if you want to drop it)
-- DROP TABLE IF EXISTS public.users;

-- Alternatively, if you want to keep the users table for other purposes but disconnect it from auth
-- you can just ensure it has proper RLS:
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_policy ON public.users;
CREATE POLICY users_policy ON public.users
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Daily Usage Table for tracking per-user, per-day token usage and cost
CREATE TABLE IF NOT EXISTS public.daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT (CURRENT_DATE),
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  UNIQUE (user_id, date, model)
);

-- RLS for daily_usage table
ALTER TABLE public.daily_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own daily usage" ON public.daily_usage 
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own daily usage" ON public.daily_usage 
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own daily usage" ON public.daily_usage 
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins have full access to all daily usage" ON public.daily_usage 
  USING (auth.jwt() ->> 'role' = 'admin');
