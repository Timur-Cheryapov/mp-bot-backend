import logger from '../utils/logger';
import * as databaseService from './database';
import { getLangChainService } from './langchain';
import { Conversation, Message } from './supabase';
import { upsertDailyUsage } from './dailyUsage';

const langchainService = getLangChainService();

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
      const conversation = await databaseService.getConversationById(conversationId);

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      return conversation;
    }

    // Create a new conversation
    const newConversation = await databaseService.createConversation(
      userId,
      title,
      {
        system_prompt: systemPrompt,
        model_name: 'gpt-4o-mini', // Default model from langchain.ts
        context_length: 200_000, // For gpt-4o-mini
        message_count: 0 // Initialize with zero messages
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
  metadata?: Record<string, any>
): Promise<Message> {
  try {
    const message = await databaseService.createMessage(
      conversationId,
      content,
      role,
      metadata
    );

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
  limit = 50
): Promise<Message[]> {
  try {
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
  systemPrompt: string,
  stream?: boolean
): Promise<{ response: string | Response; conversationId: string }> {
  try {
    // Save user message
    await databaseService.createMessage(
      conversationId,
      userMessage,
      'user'
    );
    
    // Get history
    const messages = await databaseService.getMessagesByConversationId(conversationId);
    const history = messages.map(msg => {
      const baseMessage = {
        role: msg.role,
        content: msg.content,
      };
      
      // Add tool-specific fields for tool messages
      if (msg.role === 'tool') {
        return {
          ...baseMessage,
          tool_call_id: msg.tool_call_id,
          tool_name: msg.tool_name
        };
      }

      // Add tool-specific fields for assistant messages
      if (msg.role === 'assistant') {
        return {
          ...baseMessage,
          tool_calls: msg.tool_calls
        };
      }
      
      return baseMessage;
    });
    
    if (stream) {
      // For streaming, pass through the Response object
      // The response will be saved after streaming completes in the streaming handler
      const response = await langchainService.generateConversationResponse(
        systemPrompt,
        history,
        {
          conversationId,
          userId,
          stream: true,
          includeWildberriesTools: true
        }
      );
      
      return {
        response,
        conversationId
      };
    } else {
      // For non-streaming, save the response as before
      const response = await langchainService.generateConversationResponse(
        systemPrompt,
        history,
        {
          conversationId,
          userId,
          stream: false,
          includeWildberriesTools: true
        }
      );
      
      // Save assistant message
      await databaseService.createMessage(
        conversationId,
        response.toString(),
        'assistant'
      );
      
      return {
        response: response.toString(),
        conversationId
      };
    }
  } catch (error) {
    logger.error(`Error in generateAndSaveResponse: ${error instanceof Error ? error.message : String(error)}`);
    throw error; // Re-throw to allow the specific error to be handled by the route
  }
}

/**
 * Save a streamed response to the database after streaming completes
 * @deprecated - Now handled internally in the streaming process
 */
/*
export async function saveStreamedResponse(
  conversationId: string,
  responseContent: string
): Promise<void> {
  try {
    await databaseService.createMessage(
      conversationId,
      responseContent,
      'assistant'
    );
    logger.info(`Saved streamed response to conversation: ${conversationId}`);
  } catch (error) {
    logger.error(`Error saving streamed response: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
*/

/**
 * Store token usage information from streaming response
 * @param conversationId The conversation ID
 * @param tokenUsage The token usage data from the streaming response
 */
export async function storeTokenUsage(
  conversationId: string,
  tokenUsage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }
): Promise<void> {
  try {
    // First get the conversation to get the user ID
    const conversation = await databaseService.getConversationById(conversationId);
    if (!conversation) {
      logger.warn(`Conversation ${conversationId} not found when storing token usage`);
      return;
    }

    const userId = conversation.user_id;
    const today = new Date().toISOString().slice(0, 10);
    const modelName = conversation.model_name || 'gpt-4o-mini';

    // Calculate cost using rates similar to those in langchain.ts
    const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
      'gpt-4.1': { input: 2.0, output: 8.0 },
      'gpt-4.1-mini': { input: 0.4, output: 1.6 },
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
      'default': { input: 0.15, output: 0.6 }
    };

    const costRates = TOKEN_COSTS[modelName] || TOKEN_COSTS.default;
    const inputCost = (tokenUsage.prompt_tokens / 1000000) * costRates.input;
    const outputCost = (tokenUsage.completion_tokens / 1000000) * costRates.output;
    const totalCost = inputCost + outputCost;

    logger.info(`Storing token usage for conversation ${conversationId}, user ${userId}. Input: ${tokenUsage.prompt_tokens}, Output: ${tokenUsage.completion_tokens}, Cost: $${totalCost.toFixed(6)}`);

    // Update metadata for the last assistant message
    const messages = await databaseService.getMessagesByConversationId(conversationId, 2);
    const assistantMessage = messages.find(msg => msg.role === 'assistant');
    if (assistantMessage) {
      await databaseService.updateMessage(assistantMessage.id, {
        metadata: {
          ...assistantMessage.metadata,
          tokenUsage
        }
      });
    }

    // Update daily usage
    await upsertDailyUsage(
      userId,
      today,
      modelName,
      tokenUsage.prompt_tokens,
      tokenUsage.completion_tokens,
      totalCost
    );
  } catch (error) {
    logger.error(`Error storing token usage: ${error instanceof Error ? error.message : String(error)}`);
    // Don't throw, as this is called asynchronously and shouldn't break the response
  }
} 