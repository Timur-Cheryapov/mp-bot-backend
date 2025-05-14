import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { 
  ChatPromptTemplate, 
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate 
} from '@langchain/core/prompts';
import { InMemoryCache, BaseCache } from '@langchain/core/caches';
import { Generation } from '@langchain/core/outputs';
import logger from '../utils/logger';
import { estimateTokenCount } from '../utils/langchainUtils';

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CACHE_ENABLED = process.env.CACHE_ENABLED !== 'false'; // Default to true

// Error messages
const ERROR_MISSING_API_KEY = 'OpenAI API key is not defined in environment variables';
const ERROR_INITIALIZATION = 'Failed to initialize LangChain service';
const ERROR_MODEL_CREATION = 'Failed to create model instance';
const ERROR_CACHE_INITIALIZATION = 'Failed to initialize cache';

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
  model?: string;
  disableCache?: boolean;
};

export type EmbeddingModelParams = {
  modelName?: string;
  stripNewLines?: boolean;
  disableCache?: boolean;
};

// Cache metrics
export interface CacheMetrics {
  hits: number;
  misses: number;
  size: number;
  tokensServedFromCache: number;
  tokensSavedFromCache: number;
}

/**
 * Custom cache wrapper to track hit/miss metrics
 */
class MetricsTrackingCache implements BaseCache<Generation[]> {
  private cache: InMemoryCache;
  private service: LangChainService;
  
  constructor(service: LangChainService) {
    this.cache = new InMemoryCache();
    this.service = service;
  }
  
  async lookup(prompt: string, llmKey: string): Promise<Generation[] | null> {
    const result = await this.cache.lookup(prompt, llmKey);
    
    if (result !== null) {
      // Extract model name from llmKey if possible
      // Format is typically: model_name:temperature:max_tokens
      const modelName = llmKey.split(':')[0] || 'default';
      
      // Calculate total content length for all generations
      const content = result.map(gen => gen.text).join(' ');
      this.service.trackCacheHit(content, modelName);
    } else {
      this.service.trackCacheMiss();
    }
    
    return result;
  }
  
  async update(prompt: string, llmKey: string, value: Generation[]): Promise<void> {
    return this.cache.update(prompt, llmKey, value);
  }
}

/**
 * Singleton class for LangChain integration with OpenAI
 */
class LangChainService {
  private static instance: LangChainService;
  private initialized: boolean = false;
  private connectionAttempts = 0;
  private readonly MAX_RETRY_ATTEMPTS = 3;
  
  // Cache implementation
  private cache: BaseCache | null = null;
  private cacheMetrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    size: 0, 
    tokensServedFromCache: 0,
    tokensSavedFromCache: 0
  };
  
  // Token cost tracking (approximate)
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
      
      // Initialize cache if enabled
      if (CACHE_ENABLED) {
        this.initializeCache();
      } else {
        logger.info('Cache is disabled by configuration');
      }

      this.initialized = true;
      logger.info('LangChain service initialized successfully');
    } catch (error) {
      this.connectionAttempts += 1;
      
      if (this.connectionAttempts < this.MAX_RETRY_ATTEMPTS) {
        logger.warn(`LangChain initialization failed, retrying (${this.connectionAttempts}/${this.MAX_RETRY_ATTEMPTS})...`);
        setTimeout(() => this.initialize(), 1000 * this.connectionAttempts);
      } else {
        logger.error(`${ERROR_INITIALIZATION}: ${error instanceof Error ? error.message : String(error)}`);
        this.initialized = false;
      }
    }
  }
  
  /**
   * Initialize the in-memory cache
   */
  private initializeCache(): void {
    try {
      this.cache = new MetricsTrackingCache(this);
      logger.info('Initialized metrics-tracking cache');
    } catch (error) {
      logger.error(`${ERROR_CACHE_INITIALIZATION}: ${error instanceof Error ? error.message : String(error)}`);
      this.cache = null;
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
        model = MODEL_CONFIGS.GPT4O_MINI,
        disableCache = false
      } = params;
      
      const modelConfig: any = {
        temperature,
        maxTokens,
        model,
        openAIApiKey: OPENAI_API_KEY,
        timeout: 30000, // 30 seconds timeout
      };
      
      // Apply cache if available and not disabled
      if (this.cache && !disableCache && CACHE_ENABLED) {
        modelConfig.cache = this.cache;
      }

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
        stripNewLines = true,
        disableCache = false
      } = params;
      
      const modelConfig: any = {
        modelName,
        stripNewLines,
        openAIApiKey: OPENAI_API_KEY,
        timeout: 30000, // 30 seconds timeout
      };
      
      // Apply cache if available and not disabled
      if (this.cache && !disableCache && CACHE_ENABLED) {
        modelConfig.cache = this.cache;
      }

      return new OpenAIEmbeddings(modelConfig);
    } catch (error) {
      logger.error(`${ERROR_MODEL_CREATION}: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`${ERROR_MODEL_CREATION}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a chat prompt template with system and human messages
   */
  public createChatPromptTemplate(systemPrompt: string, humanPromptTemplate: string): ChatPromptTemplate {
    const systemMessagePrompt = SystemMessagePromptTemplate.fromTemplate(systemPrompt);
    const humanMessagePrompt = HumanMessagePromptTemplate.fromTemplate(humanPromptTemplate);
    
    return ChatPromptTemplate.fromMessages([
      systemMessagePrompt,
      humanMessagePrompt,
    ]);
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
    
    // Accumulate total cost
    this.cumulativeTokenCost += totalCost;
    
    logger.debug(`Token usage: ${inputTokens} input, ${outputTokens} output, $${totalCost.toFixed(6)} estimated cost`);
  }
  
  /**
   * Track cached response
   * @param text Cached text retrieved
   * @param modelName Model name to calculate the cost savings
   */
  public trackCacheHit(text: string, modelName: string = 'default'): void {
    this.cacheMetrics.hits += 1;
    const tokens = estimateTokenCount(text);
    this.cacheMetrics.tokensServedFromCache += tokens;
    
    // Get cost rates for the specified model or use default
    const costRates = this.TOKEN_COSTS[modelName as keyof typeof this.TOKEN_COSTS] || this.TOKEN_COSTS.default;
    const savedCost = (tokens / 1000000) * costRates.output;
    this.cacheMetrics.tokensSavedFromCache += tokens;
    
    logger.debug(`Cache hit: Saved approximately ${tokens} tokens, $${savedCost.toFixed(6)} estimated for ${modelName}`);
  }
  
  /**
   * Track cache miss
   */
  public trackCacheMiss(): void {
    this.cacheMetrics.misses += 1;
  }
  
  /**
   * Get cache and usage metrics
   */
  public getMetrics(): {
    cache: CacheMetrics,
    estimatedCost: number,
    cacheHitRate: number
  } {
    const hitRate = this.cacheMetrics.hits / 
      (this.cacheMetrics.hits + this.cacheMetrics.misses || 1);
    
    return {
      cache: { ...this.cacheMetrics },
      estimatedCost: this.cumulativeTokenCost,
      cacheHitRate: hitRate
    };
  }

  /**
   * Verify connection to OpenAI API
   * Returns true if the connection is successful, false otherwise
   */
  public async verifyConnection(): Promise<boolean> {
    try {
      if (!this.initialized) {
        throw new Error(ERROR_INITIALIZATION);
      }

      const model = this.createChatModel({
        temperature: 0,
        maxTokens: 10,
        disableCache: true // Don't cache the verification call
      });

      const prompt = this.createChatPromptTemplate(
        'You are a helpful assistant.',
        'Return only the word "Connected" without any explanation or additional text.'
      );

      const chain = prompt.pipe(model);
      const response = await chain.invoke({ 
        timeout: 5000 // 5 seconds timeout for verification
      });

      const text = response.content.toString().trim();
      return text.toLowerCase().includes('connected');
    } catch (error) {
      logger.error(`Connection verification failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  
  /**
   * Clear the cache
   */
  public async clearCache(): Promise<void> {
    try {
      // Reinitialize cache
      this.initializeCache();
      
      // Reset metrics
      this.cacheMetrics = {
        hits: 0,
        misses: 0,
        size: 0,
        tokensServedFromCache: 0,
        tokensSavedFromCache: 0
      };
      
      logger.info('Cache cleared successfully');
    } catch (error) {
      logger.error(`Error clearing cache: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Export a function to get the singleton instance
export const getLangChainService = (): LangChainService => {
  return LangChainService.getInstance();
};

export default getLangChainService; 