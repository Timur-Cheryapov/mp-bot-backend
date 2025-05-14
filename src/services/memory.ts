import { 
  ConversationHistory,
  ConversationTurn,
  PromptType
} from '../prompts/types';
import { BaseMessage, AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { BufferWindowMemory } from 'langchain/memory';
import { ChatMessageHistory } from 'langchain/memory';
import { estimateTokenCount } from '../utils/langchainUtils';
import logger from '../utils/logger';

// Constants for memory configuration
const DEFAULT_MAX_TOKEN_LIMIT = 4000; // Default token limit for message history
const DEFAULT_WINDOW_SIZE = 10; // Default number of conversation turns to keep
const TOKEN_BUFFER_PERCENTAGE = 0.15; // Buffer percentage to prevent going over token limit
const SYSTEM_MESSAGE_WEIGHT = 1.5; // Weight for system messages when calculating token usage

/**
 * Options for memory configuration
 */
export interface MemoryOptions {
  maxTokens?: number;
  windowSize?: number;
  returnMessages?: boolean;
  includeSystemMessages?: boolean;
}

/**
 * Service for managing conversation memory
 */
class MemoryService {
  private static instance: MemoryService;
  private sessionMemory: Map<string, BufferWindowMemory> = new Map();
  private tokenUsage: Map<string, number> = new Map();
  private messageCount: Map<string, number> = new Map();
  
  private constructor() {}
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): MemoryService {
    if (!MemoryService.instance) {
      MemoryService.instance = new MemoryService();
    }
    return MemoryService.instance;
  }
  
  /**
   * Create a new memory instance for a session
   * @param sessionId Unique session identifier
   * @param options Memory configuration options
   * @returns The memory instance
   */
  public createMemory(
    sessionId: string, 
    options: MemoryOptions = {}
  ): BufferWindowMemory {
    // Configure memory with defaults or provided options
    const memory = new BufferWindowMemory({
      k: options.windowSize || DEFAULT_WINDOW_SIZE,
      returnMessages: options.returnMessages !== undefined ? options.returnMessages : true,
      memoryKey: 'chat_history',
      inputKey: 'input',
      outputKey: 'output',
      chatHistory: new ChatMessageHistory([]),
    });
    
    // Store the memory instance
    this.sessionMemory.set(sessionId, memory);
    this.tokenUsage.set(sessionId, 0);
    this.messageCount.set(sessionId, 0);
    
    return memory;
  }
  
  /**
   * Get memory for a session, creating it if it doesn't exist
   * @param sessionId Session identifier
   * @param options Memory configuration options
   * @returns Memory instance
   */
  public getMemory(
    sessionId: string, 
    options: MemoryOptions = {}
  ): BufferWindowMemory {
    if (!this.sessionMemory.has(sessionId)) {
      return this.createMemory(sessionId, options);
    }
    return this.sessionMemory.get(sessionId)!;
  }
  
  /**
   * Convert our conversation history to LangChain messages
   * @param history Our conversation history format
   * @returns Array of LangChain messages
   */
  public conversationToMessages(history: ConversationHistory): BaseMessage[] {
    return history.map(turn => {
      switch (turn.role) {
        case PromptType.System:
          return new SystemMessage(turn.content);
        case PromptType.User:
          return new HumanMessage(turn.content);
        case PromptType.Assistant:
          return new AIMessage(turn.content);
        default:
          return new HumanMessage(turn.content);
      }
    });
  }
  
  /**
   * Convert LangChain messages to our conversation history format
   * @param messages Array of LangChain messages
   * @returns Our conversation history format
   */
  public messagesToConversation(messages: BaseMessage[]): ConversationHistory {
    return messages.map(message => {
      let role: PromptType;
      
      if (message instanceof SystemMessage) {
        role = PromptType.System;
      } else if (message instanceof HumanMessage) {
        role = PromptType.User;
      } else if (message instanceof AIMessage) {
        role = PromptType.Assistant;
      } else {
        role = PromptType.User;
      }
      
      return {
        role,
        content: message.content as string
      };
    });
  }
  
  /**
   * Add messages to session memory
   * @param sessionId Session identifier
   * @param history Conversation history to add
   * @param options Memory options
   */
  public async addHistory(
    sessionId: string, 
    history: ConversationHistory,
    options: MemoryOptions = {}
  ): Promise<void> {
    try {
      const memory = this.getMemory(sessionId, options);
      const messages = this.conversationToMessages(history);
      
      // Calculate token usage
      let tokens = 0;
      for (const turn of history) {
        const turnTokens = estimateTokenCount(turn.content);
        tokens += turn.role === PromptType.System 
          ? turnTokens * SYSTEM_MESSAGE_WEIGHT 
          : turnTokens;
      }
      
      // Update metrics
      const currentTokens = this.tokenUsage.get(sessionId) || 0;
      this.tokenUsage.set(sessionId, currentTokens + tokens);
      
      const currentCount = this.messageCount.get(sessionId) || 0;
      this.messageCount.set(sessionId, currentCount + history.length);
      
      // Add each message to the chat history
      const chatHistory = memory.chatHistory as ChatMessageHistory;
      for (const message of messages) {
        await chatHistory.addMessage(message);
      }
      
      // Check if we need to prune based on token limits
      await this.pruneIfNeeded(sessionId, options);
    } catch (error) {
      logger.error(`Error adding history to memory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Add a single user-assistant exchange to memory
   * @param sessionId Session identifier
   * @param userMessage User's message
   * @param assistantResponse Assistant's response
   * @param options Memory options
   */
  public async addExchange(
    sessionId: string,
    userMessage: string,
    assistantResponse: string,
    options: MemoryOptions = {}
  ): Promise<void> {
    const history: ConversationHistory = [
      { role: PromptType.User, content: userMessage },
      { role: PromptType.Assistant, content: assistantResponse }
    ];
    
    await this.addHistory(sessionId, history, options);
  }
  
  /**
   * Prune memory if it exceeds token limits
   * @param sessionId Session identifier
   * @param options Memory options
   */
  private async pruneIfNeeded(
    sessionId: string,
    options: MemoryOptions = {}
  ): Promise<void> {
    try {
      const memory = this.getMemory(sessionId, options);
      const tokenLimit = options.maxTokens || DEFAULT_MAX_TOKEN_LIMIT;
      const currentTokens = this.tokenUsage.get(sessionId) || 0;
      
      // Add buffer to prevent going right up to the limit
      const effectiveLimit = tokenLimit * (1 - TOKEN_BUFFER_PERCENTAGE);
      
      if (currentTokens > effectiveLimit) {
        logger.info(`Pruning memory for session ${sessionId}: ${currentTokens} tokens > ${effectiveLimit} limit`);
        
        // Get current messages
        const loadedMessages = await memory.loadMemoryVariables({});
        const messages = loadedMessages.chat_history as BaseMessage[];
        
        if (messages.length <= 2) {
          // If we only have 1-2 messages, reset completely
          await this.clearMemory(sessionId);
          return;
        }
        
        // Calculate how many messages to keep to stay under token limit
        // Remove from the oldest message until we're under the limit
        const systemMessages: BaseMessage[] = [];
        const conversationMessages: BaseMessage[] = [];
        
        // Separate system messages from conversation
        messages.forEach(msg => {
          if (msg instanceof SystemMessage) {
            systemMessages.push(msg);
          } else {
            conversationMessages.push(msg);
          }
        });
        
        // Keep system messages and most recent conversational messages
        // Starting with whole window size
        let windowToKeep = options.windowSize || DEFAULT_WINDOW_SIZE;
        
        // If we have more messages than window size, we need to calculate
        while (windowToKeep > 0 && conversationMessages.length > windowToKeep) {
          // Remove the oldest message
          conversationMessages.shift();
          
          // Recalculate tokens with current window
          const currentMessages = [...systemMessages, ...conversationMessages];
          const history = this.messagesToConversation(currentMessages);
          
          let tokens = 0;
          for (const turn of history) {
            const turnTokens = estimateTokenCount(turn.content);
            tokens += turn.role === PromptType.System 
              ? turnTokens * SYSTEM_MESSAGE_WEIGHT 
              : turnTokens;
          }
          
          // If we're under the limit, we're done
          if (tokens <= effectiveLimit) {
            break;
          }
          
          // Otherwise, reduce window size and try again
          windowToKeep--;
        }
        
        // Create new memory with pruned messages
        const prunedMessages = [...systemMessages, ...conversationMessages];
        
        // Clear and recreate memory
        await this.clearMemory(sessionId);
        const newMemory = this.createMemory(sessionId, {
          ...options,
          windowSize: windowToKeep || DEFAULT_WINDOW_SIZE
        });
        
        // Add pruned messages
        const chatHistory = newMemory.chatHistory as ChatMessageHistory;
        for (const message of prunedMessages) {
          await chatHistory.addMessage(message);
        }
        
        // Recalculate token usage
        const prunedHistory = this.messagesToConversation(prunedMessages);
        let tokens = 0;
        for (const turn of prunedHistory) {
          const turnTokens = estimateTokenCount(turn.content);
          tokens += turn.role === PromptType.System 
            ? turnTokens * SYSTEM_MESSAGE_WEIGHT 
            : turnTokens;
        }
        
        this.tokenUsage.set(sessionId, tokens);
        this.messageCount.set(sessionId, prunedMessages.length);
        
        logger.info(`Memory pruned for session ${sessionId}: ${prunedMessages.length} messages, ${tokens} tokens`);
      }
    } catch (error) {
      logger.error(`Error pruning memory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Load memory variables for a session
   * @param sessionId Session identifier
   * @returns Memory variables including chat history
   */
  public async loadMemory(sessionId: string): Promise<{ chat_history: BaseMessage[] }> {
    try {
      const memory = this.getMemory(sessionId);
      const variables = await memory.loadMemoryVariables({});
      return variables as { chat_history: BaseMessage[] };
    } catch (error) {
      logger.error(`Error loading memory: ${error instanceof Error ? error.message : String(error)}`);
      return { chat_history: [] };
    }
  }
  
  /**
   * Get conversation history for a session
   * @param sessionId Session identifier
   * @returns Conversation history
   */
  public async getHistory(sessionId: string): Promise<ConversationHistory> {
    try {
      const { chat_history } = await this.loadMemory(sessionId);
      return this.messagesToConversation(chat_history);
    } catch (error) {
      logger.error(`Error getting history: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
  
  /**
   * Clear memory for a session
   * @param sessionId Session identifier
   */
  public async clearMemory(sessionId: string): Promise<void> {
    try {
      if (this.sessionMemory.has(sessionId)) {
        const memory = this.sessionMemory.get(sessionId)!;
        await memory.clear();
        this.sessionMemory.delete(sessionId);
        this.tokenUsage.delete(sessionId);
        this.messageCount.delete(sessionId);
      }
    } catch (error) {
      logger.error(`Error clearing memory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Get memory usage metrics
   * @param sessionId Session identifier (optional)
   * @returns Memory usage metrics
   */
  public getMemoryMetrics(sessionId?: string): { 
    sessions: number, 
    totalTokens: number, 
    totalMessages: number,
    sessionMetrics?: { tokens: number, messages: number }
  } {
    let totalTokens = 0;
    let totalMessages = 0;
    
    for (const tokens of this.tokenUsage.values()) {
      totalTokens += tokens;
    }
    
    for (const count of this.messageCount.values()) {
      totalMessages += count;
    }
    
    const result = {
      sessions: this.sessionMemory.size,
      totalTokens,
      totalMessages
    };
    
    if (sessionId && this.sessionMemory.has(sessionId)) {
      return {
        ...result,
        sessionMetrics: {
          tokens: this.tokenUsage.get(sessionId) || 0,
          messages: this.messageCount.get(sessionId) || 0
        }
      };
    }
    
    return result;
  }
}

// Export a function to get the singleton instance
export const getMemoryService = (): MemoryService => {
  return MemoryService.getInstance();
};

export default getMemoryService; 