import logger from '../utils/logger';
import * as databaseService from './database';
import { getLangChainService } from './langchain';
import { Conversation, Message } from './supabase';

const langchainService = getLangChainService();

/**
 * Validates that a user has permission to access a conversation
 */
async function validateConversationAccess(conversationId: string, userId: string): Promise<Conversation> {
  const conversation = await databaseService.getConversationById(conversationId);
  
  if (!conversation) {
    throw new Error('Conversation not found');
  }
  
  if (conversation.user_id !== userId) {
    throw new Error('Access denied: You do not have permission to access this conversation');
  }
  
  return conversation;
}

/**
 * Get an existing conversation or create a new one
 */
export async function getOrCreateConversation(
  userId: string,
  conversationId: string | null,
  title: string,
  systemPrompt: string
): Promise<Conversation> {
  try {
    // If conversation ID is provided and valid, try to get it
    if (conversationId) {
      // Validate user has access to the conversation
      const existingConversation = await validateConversationAccess(conversationId, userId);
      
      // Update the conversation's updated_at timestamp
      await databaseService.updateConversation(conversationId, {
        updated_at: new Date().toISOString()
      });
      return existingConversation;
    }

    // Create a new conversation
    const newConversation = await databaseService.createConversation(
      userId,
      title,
      {
        system_prompt: systemPrompt,
        model_name: 'gpt-4o-mini', // Default model from langchain.ts
        context_length: 200_000, // For gpt-4o-mini
      }
    );

    logger.info(`Created new conversation with ID: ${newConversation.id}`);
    return newConversation;
  } catch (error) {
    logger.error(`Error in getOrCreateConversation: ${error instanceof Error ? error.message : String(error)}`);
    throw error; // Re-throw to allow the specific error to be handled by the route
  }
}

/**
 * Save a message to the database
 */
export async function saveMessage(
  conversationId: string,
  content: string,
  role: 'user' | 'assistant',
  userId: string,
  metadata?: Record<string, any>
): Promise<Message> {
  try {
    // Validate user has access to the conversation
    await validateConversationAccess(conversationId, userId);
    
    const message = await databaseService.createMessage(
      conversationId,
      content,
      role,
      metadata
    );

    // Update the conversation's updated_at timestamp
    await databaseService.updateConversation(conversationId, {
      updated_at: new Date().toISOString()
    });

    return message;
  } catch (error) {
    logger.error(`Error in saveMessage: ${error instanceof Error ? error.message : String(error)}`);
    throw error; // Re-throw to allow the specific error to be handled by the route
  }
}

/**
 * Get conversation history from the database
 */
export async function getConversationHistory(
  conversationId: string,
  userId: string,
  limit = 50
): Promise<Message[]> {
  try {
    // Validate user has access to the conversation
    await validateConversationAccess(conversationId, userId);
    
    const messages = await databaseService.getMessagesByConversationId(conversationId, limit);
    
    return messages
  } catch (error) {
    logger.error(`Error in getConversationHistory: ${error instanceof Error ? error.message : String(error)}`);
    throw error; // Re-throw to allow the specific error to be handled by the route
  }
}

/**
 * Generate a response and save both user and assistant messages
 */
export async function generateAndSaveResponse(
  userId: string,
  conversationId: string,
  userMessage: string,
  systemPrompt: string
): Promise<{ response: string; conversationId: string }> {
  try {
    // Validate user has access to the conversation
    await validateConversationAccess(conversationId, userId);
    
    // Save user message
    await databaseService.createMessage(
      conversationId,
      userMessage,
      'user'
    );
    
    // Get history
    const messages = await databaseService.getMessagesByConversationId(conversationId);
    const history = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    // Generate response
    const response = await langchainService.generateConversationResponse(
      systemPrompt,
      history
    );
    
    // Save assistant message
    await databaseService.createMessage(
      conversationId,
      response,
      'assistant'
    );
    
    // Update conversation timestamp
    await databaseService.updateConversation(conversationId, {
      updated_at: new Date().toISOString()
    });
    
    return {
      response,
      conversationId
    };
  } catch (error) {
    logger.error(`Error in generateAndSaveResponse: ${error instanceof Error ? error.message : String(error)}`);
    throw error; // Re-throw to allow the specific error to be handled by the route
  }
} 