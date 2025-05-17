-- Add user_plans table to track subscription limits
CREATE TABLE IF NOT EXISTS public.user_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL DEFAULT 'free',
  max_credits_per_day NUMERIC(12,6) NOT NULL DEFAULT 0.50,
  max_credits_per_month NUMERIC(12,6) NOT NULL DEFAULT 5.00,
  reset_date DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '1 month'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (user_id)
);

-- RLS for user_plans table
ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own plan" ON public.user_plans 
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins have full access to all user plans" ON public.user_plans 
  USING (auth.jwt() ->> 'role' = 'admin');

-- Create a trigger function to update updated_at automatically
CREATE OR REPLACE FUNCTION update_user_plan_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at when user_plans is updated
DROP TRIGGER IF EXISTS trigger_update_user_plan_timestamp ON public.user_plans;
CREATE TRIGGER trigger_update_user_plan_timestamp
BEFORE UPDATE ON public.user_plans
FOR EACH ROW
EXECUTE FUNCTION update_user_plan_timestamp();

-- Create default 'free' plans for any existing users
INSERT INTO public.user_plans (user_id, plan_name, max_credits_per_day, max_credits_per_month)
SELECT id, 'free', 0.50, 5.00
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_plans); 