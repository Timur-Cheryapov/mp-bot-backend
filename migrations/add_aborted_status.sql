-- Add 'aborted' status to message status enum
-- This allows messages to be marked as aborted when client disconnects during generation

-- First, drop the existing constraint
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_status_check;

-- Add the new constraint with 'aborted' included
ALTER TABLE public.messages ADD CONSTRAINT messages_status_check 
  CHECK (status IS NULL OR status IN ('pending', 'success', 'error', 'aborted'));

-- Create an index for the new status if it doesn't exist
DROP INDEX IF EXISTS idx_messages_status;
CREATE INDEX idx_messages_status ON public.messages(status) WHERE status IS NOT NULL; 