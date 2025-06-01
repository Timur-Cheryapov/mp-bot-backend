import { shouldUseLangGraph } from '../config/features';
import logger from '../utils/logger';

// Import both service implementations with renamed imports to avoid conflicts
import { getLangChainService as getLegacyService } from './langchain-legacy';
import { getLangGraphService as getLangGraphServiceImpl } from './langchain-langgraph';

// Re-export types from legacy service for compatibility
export {
  MODEL_CONFIGS,
  ChatModelParams,
  EmbeddingModelParams,
  ChatOptions,
  ConversationOptions
} from './langchain-legacy';

/**
 * Unified LangChain service that switches between legacy and LangGraph implementations
 * based on feature flags
 */
class UnifiedLangChainService {
  private static instance: UnifiedLangChainService;
  private legacyService = getLegacyService();
  private langGraphService = getLangGraphServiceImpl();

  private constructor() {
    logger.info('Unified LangChain service initialized with feature flag support');
  }

  public static getInstance(): UnifiedLangChainService {
    if (!UnifiedLangChainService.instance) {
      UnifiedLangChainService.instance = new UnifiedLangChainService();
    }
    return UnifiedLangChainService.instance;
  }

  /**
   * Create chat model - delegates to appropriate service
   */
  public async createChatModel(params: any = {}): Promise<any> {
    if (shouldUseLangGraph('USE_LANGGRAPH_CHAT')) {
      // LangGraph service doesn't expose createChatModel, so fallback to legacy
      logger.debug('Using legacy service for createChatModel (LangGraph doesn\'t expose this method)');
      return this.legacyService.createChatModel(params);
    }
    return this.legacyService.createChatModel(params);
  }

  /**
   * Create embedding model - delegates to appropriate service
   */
  public createEmbeddingModel(params: any = {}): any {
    if (shouldUseLangGraph('USE_LANGGRAPH_CHAT')) {
      return this.langGraphService.createEmbeddingModel(params);
    }
    return this.legacyService.createEmbeddingModel(params);
  }

  /**
   * Generate chat response - uses feature flag to choose implementation
   */
  public async generateChatResponse(
    systemPrompt: string,
    userMessage: string,
    options: any = {}
  ): Promise<string> {
    const useLangGraph = shouldUseLangGraph('USE_LANGGRAPH_CHAT') && 
                        (!options.stream || shouldUseLangGraph('USE_LANGGRAPH_STREAMING'));

    if (useLangGraph) {
      logger.debug('Using LangGraph service for chat response');
      try {
        return await this.langGraphService.generateChatResponse(systemPrompt, userMessage, options);
      } catch (error) {
        logger.error('LangGraph service failed, falling back to legacy:', error);
        return await this.legacyService.generateChatResponse(systemPrompt, userMessage, options);
      }
    } else {
      logger.debug('Using legacy service for chat response');
      return await this.legacyService.generateChatResponse(systemPrompt, userMessage, options);
    }
  }

  /**
   * Generate conversation response - uses feature flag to choose implementation
   */
  public async generateConversationResponse(
    systemPrompt: string,
    messages: any[],
    options: any
  ): Promise<string | Response> {
    const useLangGraph = shouldUseLangGraph('USE_LANGGRAPH_CONVERSATION') && 
                        (!options.stream || shouldUseLangGraph('USE_LANGGRAPH_STREAMING'));

    if (useLangGraph) {
      logger.debug('Using LangGraph service for conversation response');
      try {
        return await this.langGraphService.generateConversationResponse(systemPrompt, messages, options);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Streaming not implemented')) {
          logger.debug('LangGraph streaming not implemented, falling back to legacy');
        } else {
          logger.error('LangGraph service failed, falling back to legacy:', error);
        }
        return await this.legacyService.generateConversationResponse(systemPrompt, messages, options);
      }
    } else {
      logger.debug('Using legacy service for conversation response');
      return await this.legacyService.generateConversationResponse(systemPrompt, messages, options);
    }
  }

  /**
   * Get metrics - delegates to appropriate service
   */
  public async getMetrics(userId: string, date?: string): Promise<any> {
    // Both services have the same implementation, use LangGraph if available
    if (shouldUseLangGraph('USE_LANGGRAPH_CHAT')) {
      return await this.langGraphService.getMetrics(userId, date);
    }
    return await this.legacyService.getMetrics(userId, date);
  }

  /**
   * Get service status for debugging
   */
  public getServiceStatus() {
    return {
      useLangGraphChat: shouldUseLangGraph('USE_LANGGRAPH_CHAT'),
      useLangGraphConversation: shouldUseLangGraph('USE_LANGGRAPH_CONVERSATION'),
      useLangGraphStreaming: shouldUseLangGraph('USE_LANGGRAPH_STREAMING'),
      useLangGraphTools: shouldUseLangGraph('USE_LANGGRAPH_TOOLS'),
      timestamp: new Date().toISOString()
    };
  }
}

// Export the unified service instance
export const getLangChainService = (): UnifiedLangChainService => {
  return UnifiedLangChainService.getInstance();
};

export default getLangChainService; 