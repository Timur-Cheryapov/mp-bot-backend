import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import logger from '../utils/logger';
import { estimateTokenCount } from '../utils/langchainUtils';

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

// Simple metrics interface
export interface TokenMetrics {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

/**
 * Simplified LangChain service
 */
class LangChainService {
  private static instance: LangChainService;
  private initialized: boolean = false;
  
  // Token metrics tracking
  private inputTokenCount: number = 0;
  private outputTokenCount: number = 0;
  private cumulativeTokenCost: number = 0;
  
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
   * @returns The AI's response
   */
  public async generateChatResponse(
    systemPrompt: string,
    userMessage: string,
    modelName: string = MODEL_CONFIGS.GPT4O_MINI
  ): Promise<string> {
    try {
      const chatModel = this.createChatModel({ modelName });
      
      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userMessage)
      ];
      
      // Track token usage for input
      const inputText = `${systemPrompt}\n${userMessage}`;
      
      const response = await chatModel.invoke(messages);
      const outputText = response.content.toString();
      
      // Track token usage
      this.trackTokenUsage(inputText, outputText, modelName);
      
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
   * @returns The AI's response
   */
  public async generateConversationResponse(
    systemPrompt: string,
    messages: Array<{role: string, content: string}>,
    modelName: string = MODEL_CONFIGS.GPT4O_MINI
  ): Promise<string> {
    try {
      const chatModel = this.createChatModel({ modelName });
      
      // Convert messages to LangChain format
      const langchainMessages = [
        new SystemMessage(systemPrompt),
        ...messages.map(msg => {
          if (msg.role === 'user') {
            return new HumanMessage(msg.content);
          } else if (msg.role === 'assistant') {
            return new AIMessage(msg.content);
          } else {
            return new SystemMessage(msg.content);
          }
        })
      ];
      
      // Track token usage for input
      const inputText = [systemPrompt, ...messages.map(m => m.content)].join('\n');
      
      const response = await chatModel.invoke(langchainMessages);
      const outputText = response.content.toString();
      
      // Track token usage
      this.trackTokenUsage(inputText, outputText, modelName);
      
      return outputText;
    } catch (error) {
      logger.error(`Error generating conversation response: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Track token usage and cost 
   * @param inputText Input text
   * @param outputText Output text
   * @param modelName Model name
   */
  public trackTokenUsage(inputText: string, outputText: string, modelName: string): void {
    const inputTokens = estimateTokenCount(inputText);
    const outputTokens = estimateTokenCount(outputText);
    
    // Get cost rates for this model or use default
    const costRates = this.TOKEN_COSTS[modelName as keyof typeof this.TOKEN_COSTS] || this.TOKEN_COSTS.default;
    
    // Calculate cost (convert tokens to millions)
    const inputCost = (inputTokens / 1000000) * costRates.input;
    const outputCost = (outputTokens / 1000000) * costRates.output;
    const totalCost = inputCost + outputCost;
    
    // Update metrics
    this.inputTokenCount += inputTokens;
    this.outputTokenCount += outputTokens;
    this.cumulativeTokenCost += totalCost;
    
    logger.debug(`Token usage: ${inputTokens} input, ${outputTokens} output, $${totalCost.toFixed(6)} estimated cost`);
  }
  
  /**
   * Get usage metrics
   */
  public getMetrics(): TokenMetrics {    
    return {
      inputTokens: this.inputTokenCount,
      outputTokens: this.outputTokenCount,
      estimatedCost: this.cumulativeTokenCost
    };
  }

  /**
   * Reset all metrics
   */
  public resetMetrics(): void {
    this.inputTokenCount = 0;
    this.outputTokenCount = 0;
    this.cumulativeTokenCost = 0;
    logger.info('Metrics reset successfully');
  }
}

// Export function to get the singleton instance
export const getLangChainService = (): LangChainService => {
  return LangChainService.getInstance();
};

export default getLangChainService; 