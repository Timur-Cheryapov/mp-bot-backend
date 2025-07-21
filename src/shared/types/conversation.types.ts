/**
 * Type definitions for the conversation service
 * Defines all types used for conversation management
 */
export type MessageStatus = 'pending' | 'success' | 'error' | 'aborted';

/**
 * The role of a participant in a conversation
 */
export type MessageRole = 'user' | 'assistant' | 'tool';

/**
 * Simple message object for UI and API communication
 */
export interface MessageUi {
  role: MessageRole;
  content: string;
  status: MessageStatus;
  timestamp: string;
}

/**
 * A conversation between a user and the AI
 */
export interface ConversationUi {
  id: string;
  title: string;
  updatedAt: string;
  archived: boolean;
}