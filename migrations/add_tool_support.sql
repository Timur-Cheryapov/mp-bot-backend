-- Migration to add tool support to messages table
-- This script adds the new columns needed for tool calls and tool messages

-- Add new columns for tool support
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS tool_calls JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tool_call_id TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tool_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT NULL;

-- Update the role constraint to include 'tool'
ALTER TABLE public.messages 
DROP CONSTRAINT IF EXISTS messages_role_check;

ALTER TABLE public.messages 
ADD CONSTRAINT messages_role_check 
CHECK (role IN ('user', 'assistant', 'tool'));

-- Add status constraint
ALTER TABLE public.messages 
ADD CONSTRAINT messages_status_check 
CHECK (status IS NULL OR status IN ('pending', 'success', 'error'));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_tool_call_id ON public.messages(tool_call_id) WHERE tool_call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_role ON public.messages(role);
CREATE INDEX IF NOT EXISTS idx_messages_status ON public.messages(status) WHERE status IS NOT NULL;

-- Migrate existing tool data from metadata to new columns
-- This handles any existing messages that might have tool data in metadata
UPDATE public.messages 
SET 
  tool_call_id = metadata->>'tool_call_id',
  tool_name = metadata->>'tool_name'
WHERE 
  role = 'tool' 
  AND metadata IS NOT NULL 
  AND (metadata->>'tool_call_id' IS NOT NULL OR metadata->>'tool_name' IS NOT NULL);

-- Clean up migrated data from metadata (optional)
UPDATE public.messages 
SET metadata = metadata - 'tool_call_id' - 'tool_name'
WHERE 
  role = 'tool' 
  AND metadata IS NOT NULL 
  AND (metadata ? 'tool_call_id' OR metadata ? 'tool_name');

-- Add comment explaining the new structure
COMMENT ON COLUMN public.messages.tool_calls IS 'Array of tool calls for assistant messages when AI calls tools';
COMMENT ON COLUMN public.messages.tool_call_id IS 'Reference to the tool call ID for tool messages';
COMMENT ON COLUMN public.messages.tool_name IS 'Name of the tool that was called for tool messages';
COMMENT ON COLUMN public.messages.status IS 'Execution status for tool messages (pending, success, error)'; 