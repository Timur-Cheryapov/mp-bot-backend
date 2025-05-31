import { Conversation, Message } from "../services/supabase";

/**
 * Type definitions for the conversation service
 * Defines all types used for conversation management
 */
type MessageStatus = 'pending' | 'success' | 'error';

/**
 * The role of a participant in a conversation
 */
type MessageRole = 'user' | 'assistant' | 'tool';

/**
 * Simple message object for UI and API communication
 */
interface MessageUi {
  role: MessageRole;
  content: string;
  status: MessageStatus;
  timestamp: string;
}

/**
 * A conversation between a user and the AI
 */
interface ConversationUi {
  id: string;
  title: string;
  updatedAt: string;
  archived: boolean;
}

/**
 * Convert a conversation from the database to a UI object
 * @param conversation - The conversation to convert
 * @returns The converted conversation
 */
export function convertConversationToUi(conversation: Conversation): ConversationUi {
  return {
    id: conversation.id,
    title: conversation.title,
    archived: conversation.is_archived || false,
    updatedAt: conversation.updated_at || conversation.created_at,
  };
}

/**
 * Convert a message from the database to a UI object
 * @param message - The message to convert
 * @returns The converted message
 */
export function convertMessageToUi(message: Message): MessageUi {
  return {
    role: message.role,
    content: message.content,
    status: message.status || 'success',
    timestamp: message.created_at,
  };
}
