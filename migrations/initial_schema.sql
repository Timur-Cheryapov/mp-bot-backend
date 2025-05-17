-- Create schema for our application
CREATE SCHEMA IF NOT EXISTS public;

-- Enable RLS on all tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM public;

-- Users table extension (additional fields beyond auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'user' NOT NULL CHECK (role IN ('user', 'admin')),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- RLS for users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own data" ON public.users 
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own data" ON public.users 
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins have full access to all users" ON public.users 
  USING (auth.jwt() ->> 'role' = 'admin');

-- Conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  model_name TEXT DEFAULT 'gpt-4o-mini',
  system_prompt TEXT DEFAULT 'You are a helpful assistant.',
  temperature REAL DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 2048,
  context_length INTEGER DEFAULT 10,
  is_archived BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- RLS for conversations table
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own conversations" ON public.conversations 
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own conversations" ON public.conversations 
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own conversations" ON public.conversations 
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own conversations" ON public.conversations 
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins have full access to all conversations" ON public.conversations 
  USING (auth.jwt() ->> 'role' = 'admin');

-- Messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);

-- RLS for messages table
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own messages" ON public.messages 
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM public.conversations WHERE id = conversation_id
    )
  );
CREATE POLICY "Users can create messages in their conversations" ON public.messages 
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM public.conversations WHERE id = conversation_id
    )
  );
CREATE POLICY "Users can update their own messages" ON public.messages 
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT user_id FROM public.conversations WHERE id = conversation_id
    )
  );
CREATE POLICY "Users can delete their own messages" ON public.messages 
  FOR DELETE USING (
    auth.uid() IN (
      SELECT user_id FROM public.conversations WHERE id = conversation_id
    )
  );
CREATE POLICY "Admins have full access to all messages" ON public.messages 
  USING (auth.jwt() ->> 'role' = 'admin');

-- Create or replace function to update updated_at timestamp on conversations
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations 
  SET updated_at = TIMEZONE('utc', NOW())
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update timestamp when messages are added
DROP TRIGGER IF EXISTS trigger_update_conversation_timestamp ON public.messages;
CREATE TRIGGER trigger_update_conversation_timestamp
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_timestamp(); 