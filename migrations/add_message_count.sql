-- Add message_count column to conversations table
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS message_count INTEGER NOT NULL DEFAULT 0;

-- Update existing conversations with the correct message count
UPDATE public.conversations c
SET message_count = (
  SELECT COUNT(*) 
  FROM public.messages m 
  WHERE m.conversation_id = c.id
);

-- Create or replace a trigger function to update message_count
CREATE OR REPLACE FUNCTION update_conversation_message_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.conversations
    SET message_count = message_count + 1
    WHERE id = NEW.conversation_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.conversations
    SET message_count = message_count - 1
    WHERE id = OLD.conversation_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update message_count when messages are added or deleted
DROP TRIGGER IF EXISTS trigger_update_conversation_message_count ON public.messages;
CREATE TRIGGER trigger_update_conversation_message_count
AFTER INSERT OR DELETE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_message_count(); 