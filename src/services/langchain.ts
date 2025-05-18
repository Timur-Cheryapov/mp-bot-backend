import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import logger from '../utils/logger';
import { estimateTokenCount, formatLangchainMessagesToBasic } from '../utils/langchainUtils';
import { upsertDailyUsage } from './dailyUsage';
import { DailyUsage } from './supabase';
import { checkUserDailyUsage } from './userPlans';

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Error messages
const ERROR_MISSING_API_KEY = 'OpenAI API key is not defined in environment variables';
const ERROR_INITIALIZATION = 'Failed to initialize LangChain service';
const ERROR_MODEL_CREATION = 'Failed to create model instance';

// Model configurations
export const MODEL_CONFIGS = {
  GPT4_1: 'gpt-4.1',
  GPT4_1_MINI: 'gpt-4.1-mini',
  TEXT_EMBEDDING_3_SMALL: 'text-embedding-3-small',
  GPT4O_MINI: 'gpt-4o-mini'
};

// Configuration types
export type ChatModelParams = {
  temperature?: number;
  maxTokens?: number;
  modelName?: string;
};

export type EmbeddingModelParams = {
  modelName?: string;
  stripNewLines?: boolean;
};

// Replace TokenMetrics interface
type TokenMetrics = Omit<DailyUsage, 'id' | 'created_at' | 'updated_at'>;

/**
 * Simplified LangChain service
 */
class LangChainService {
  private static instance: LangChainService;
  private initialized: boolean = false;
  
  // Approximate token costs per 1M tokens in USD for OpenAI models
  private readonly TOKEN_COSTS = {
    'gpt-4.1': { input: 2.0, output: 8.0 },
    'gpt-4.1-mini': { input: 0.4, output: 1.6 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'text-embedding-3-small': { input: 0.02, output: 0.02 },
    'default': { input: 2.0, output: 2.0 }
  };

  private constructor() {
    this.initialize();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): LangChainService {
    if (!LangChainService.instance) {
      LangChainService.instance = new LangChainService();
    }
    return LangChainService.instance;
  }

  /**
   * Initialize the service with validation
   */
  private initialize(): void {
    try {
      // Validate required environment variables
      if (!OPENAI_API_KEY) {
        throw new Error(ERROR_MISSING_API_KEY);
      }

      this.initialized = true;
      logger.info('LangChain service initialized successfully');
    } catch (error) {
      logger.error(`${ERROR_INITIALIZATION}: ${error instanceof Error ? error.message : String(error)}`);
      this.initialized = false;
    }
  }

  /**
   * Create a chat model instance with the specified parameters
   */
  public createChatModel(params: ChatModelParams = {}): ChatOpenAI {
    try {
      if (!this.initialized) {
        throw new Error(ERROR_INITIALIZATION);
      }

      const {
        temperature = 0.7,
        maxTokens = 2048,
        modelName = MODEL_CONFIGS.GPT4O_MINI
      } = params;
      
      const modelConfig: any = {
        temperature,
        maxTokens,
        modelName,
        openAIApiKey: OPENAI_API_KEY,
        timeout: 30000, // 30 seconds timeout
      };

      return new ChatOpenAI(modelConfig);
    } catch (error) {
      logger.error(`${ERROR_MODEL_CREATION}: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`${ERROR_MODEL_CREATION}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create an embedding model instance with the specified parameters
   */
  public createEmbeddingModel(params: EmbeddingModelParams = {}): OpenAIEmbeddings {
    try {
      if (!this.initialized) {
        throw new Error(ERROR_INITIALIZATION);
      }

      const {
        modelName = MODEL_CONFIGS.TEXT_EMBEDDING_3_SMALL,
        stripNewLines = true
      } = params;
      
      const modelConfig: any = {
        modelName,
        stripNewLines,
        openAIApiKey: OPENAI_API_KEY,
        timeout: 30000, // 30 seconds timeout
      };

      return new OpenAIEmbeddings(modelConfig);
    } catch (error) {
      logger.error(`${ERROR_MODEL_CREATION}: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`${ERROR_MODEL_CREATION}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Generate a chat completion with basic message types
   * @param systemPrompt The system instructions
   * @param userMessage The user's message
   * @param model Optional model name
   * @param userId The user ID for usage tracking
   * @returns The AI's response
   */
  public async generateChatResponse(
    systemPrompt: string,
    userMessage: string,
    modelName: string = MODEL_CONFIGS.GPT4O_MINI,
    userId?: string,
    stream?: boolean
  ): Promise<string> {
    try {
      // Check if user has reached their token limit
      if (userId) {
        const usageCheck = await checkUserDailyUsage(userId);
        if (usageCheck.hasReachedLimit) {
          throw new Error(`Credit limit reached. Daily limit: $${usageCheck.dailyLimitCredits.toFixed(2)}, Monthly limit: $${usageCheck.monthlyLimitCredits.toFixed(2)}. Next reset: ${usageCheck.nextResetDate}`);
        }
      }

      const chatModel = this.createChatModel({ modelName });
      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userMessage)
      ];

      let outputText = '';
      let responseAI: AIMessage;

      if (stream) {
        const stream = await chatModel.stream(messages);
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
          console.log(`${chunk.content}|`);
        }

        outputText = chunks.reduce((acc, chunk) => acc.concat(chunk.content.toString()), '');

        let finalChunk = chunks[0];
        for (const chunk of chunks) {
          finalChunk = finalChunk.concat(chunk);
        }
        responseAI = finalChunk as AIMessage;
      } else {
        const response = await chatModel.invoke(messages);
        outputText = response.content.toString();
        responseAI = response as AIMessage;
      }

      await this.trackTokenUsage(responseAI, systemPrompt, formatLangchainMessagesToBasic(messages), modelName, userId);
      return outputText;
    } catch (error) {
      logger.error(`Error generating chat response: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Generate a chat completion with conversation history
   * @param systemPrompt The system instructions
   * @param messages Array of conversation messages (role and content)
   * @param model Optional model name
   * @param userId The user ID for usage tracking
   * @returns The AI's response
   */
  public async generateConversationResponse(
    systemPrompt: string,
    messages: Array<{role: string, content: string}>,
    modelName: string = MODEL_CONFIGS.GPT4O_MINI,
    userId?: string
  ): Promise<string> {
    try {
      // Check if user has reached their token limit
      if (userId) {
        const usageCheck = await checkUserDailyUsage(userId);
        if (usageCheck.hasReachedLimit) {
          throw new Error(`Credit limit reached. Daily limit: $${usageCheck.dailyLimitCredits.toFixed(2)}, Monthly limit: $${usageCheck.monthlyLimitCredits.toFixed(2)}. Next reset: ${usageCheck.nextResetDate}`);
        }
      }

      const chatModel = this.createChatModel({ modelName });
      const langchainMessages = [
        new SystemMessage(systemPrompt),
        ...messages.map(msg => {
          if (msg.role === 'user') return new HumanMessage(msg.content);
          if (msg.role === 'assistant') return new AIMessage(msg.content);
          return new SystemMessage(msg.content);
        })
      ];
      const response = await chatModel.invoke(langchainMessages);
      const outputText = response.content.toString();
      const responseAI = response as AIMessage;
      await this.trackTokenUsage(responseAI, systemPrompt, messages, modelName, userId);
      return outputText;
    } catch (error) {
      logger.error(`Error generating conversation response: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Tracks token usage from response metadata and updates DailyUsage
   */
  private async trackTokenUsage(
    responseAI: AIMessage,
    systemPrompt: string,
    messages: Array<{role: string, content: string}>,
    modelName: string,
    userId?: string
  ): Promise<void> {
    let inputTokens = 0;
    let outputTokens = 0;
    let isEstimated = false;

    if (responseAI && responseAI.response_metadata && responseAI.response_metadata.tokenUsage) {
      const tokenUsage = responseAI.response_metadata.tokenUsage;
      inputTokens = tokenUsage.promptTokens;
      outputTokens = tokenUsage.completionTokens;
      logger.info(`Token usage from response metadata - Input: ${inputTokens}, Output: ${outputTokens}`);
    } else if (responseAI && responseAI.usage_metadata) {
      const usageMetadata = responseAI.usage_metadata;
      inputTokens = usageMetadata.input_tokens;
      outputTokens = usageMetadata.output_tokens;
      logger.info(`Token usage from usage metadata - Input: ${inputTokens}, Output: ${outputTokens}`);
    } else {
      const inputText = [systemPrompt, ...messages.map(m => m.content)].join('\n');
      const outputText = responseAI.content.toString();
      inputTokens = estimateTokenCount(inputText);
      outputTokens = estimateTokenCount(outputText);
      isEstimated = true;
      logger.warn(`Using estimated token counts - Input: ${inputTokens}, Output: ${outputTokens}`);
    }

    // Calculate cost
    const costRates = this.TOKEN_COSTS[modelName as keyof typeof this.TOKEN_COSTS] || this.TOKEN_COSTS.default;
    const inputCost = (inputTokens / 1000000) * costRates.input;
    const outputCost = (outputTokens / 1000000) * costRates.output;
    const totalCost = inputCost + outputCost;

    logger.info(`Cost calculation for ${modelName}. Total: $${totalCost.toFixed(6)} ${isEstimated ? '(Estimated)' : '(Actual)'}`);

    // Upsert to daily_usage
    if (userId) {
      const today = new Date().toISOString().slice(0, 10);
      await upsertDailyUsage(userId, today, modelName, inputTokens, outputTokens, totalCost);
    }
  }

  /**
   * Get usage metrics for a user (today, all models)
   */
  public async getMetrics(userId: string, date?: string): Promise<TokenMetrics[]> {
    // Import getAllDailyUsage dynamically to avoid circular deps
    const { getAllDailyUsage } = await import('./dailyUsage');
    const usage = await getAllDailyUsage(userId, date);
    return usage.map(u => ({
      user_id: u.user_id,
      date: u.date,
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      model: u.model,
      cost_usd: u.cost_usd
    }));
  }

  /**
   * Reset metrics for a user (set tokens/cost to 0 for today)
   */
  public async resetMetrics(userId: string): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    // Get all models for today
    const { getAllDailyUsage, upsertDailyUsage } = await import('./dailyUsage');
    const usage = await getAllDailyUsage(userId, today);
    await Promise.all(
      usage.map(u => upsertDailyUsage(u.user_id, today, u.model, 0, 0, 0))
    );
  }
}

// Export function to get the singleton instance
export const getLangChainService = (): LangChainService => {
  return LangChainService.getInstance();
};

export default getLangChainService; 