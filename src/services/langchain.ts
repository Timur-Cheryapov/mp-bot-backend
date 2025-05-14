import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { 
  ChatPromptTemplate, 
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate 
} from '@langchain/core/prompts';
import logger from '../utils/logger';

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

/**
 * Singleton class for LangChain integration with OpenAI
 */
class LangChainService {
  private static instance: LangChainService;
  private initialized: boolean = false;
  private connectionAttempts = 0;
  private readonly MAX_RETRY_ATTEMPTS = 3;

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

      return new ChatOpenAI({
        temperature,
        maxTokens,
        modelName,
        openAIApiKey: OPENAI_API_KEY,
        timeout: 30000, // 30 seconds timeout
      });
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

      return new OpenAIEmbeddings({
        modelName,
        stripNewLines,
        openAIApiKey: OPENAI_API_KEY,
        timeout: 30000, // 30 seconds timeout
      });
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
}

// Export a function to get the singleton instance
export const getLangChainService = (): LangChainService => {
  return LangChainService.getInstance();
};

export default getLangChainService; 