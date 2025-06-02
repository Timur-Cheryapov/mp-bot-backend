import { Conversation, Message } from "../../infrastructure/database/supabase.client";
import { ConversationUi, MessageUi } from "../types/conversation.types";

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
