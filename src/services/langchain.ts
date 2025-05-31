import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ToolCall } from '@langchain/core/dist/messages/tool';

import logger from '../utils/logger';
import { formatLangchainMessagesToBasic } from '../utils/langchainUtils';
import { upsertDailyUsage } from './dailyUsage';
import { DailyUsage } from './supabase';

// Utilities
import { 
  extractTokenUsage, 
  TokenUsageResult 
} from '../utils/tokenCostCalculator';
import {
  BasicMessage,
  convertToLangChainMessages,
  generateSystemPromptWithWildberriesTools,
  saveMessage,
  SaveMessageOptions
} from '../utils/messageUtils';
import {
  executeTools,
  getToolExecutionEvents,
  parseToolExecutionResult,
  createToolsMap
} from '../utils/toolExecutionUtils';
import {
  StreamController,
  streamAIResponse,
  createStreamResponse
} from '../utils/streamingUtils';
import {
  validateUserUsageLimit,
  validateWildberriesToolsRequirements,
  validateApiKey
} from '../utils/validationUtils';

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Error messages
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
  includeWildberriesTools?: boolean;
  userId?: string;
};

export type EmbeddingModelParams = {
  modelName?: string;
  stripNewLines?: boolean;
};

export type ChatOptions = {
  modelName?: string;
  userId?: string;
  stream?: boolean;
  includeWildberriesTools?: boolean;
};

export type ConversationOptions = {
  modelName?: string;
  conversationId: string;
  userId?: string;
  stream?: boolean;
  includeWildberriesTools?: boolean;
};

// Replace TokenMetrics interface
type TokenMetrics = Omit<DailyUsage, 'id' | 'created_at' | 'updated_at'>;

/**
 * Simplified LangChain service with improved architecture
 */
class LangChainService {
  private static instance: LangChainService;
  private initialized: boolean = false;

  private constructor() {
    this.initialize();
  }

  public static getInstance(): LangChainService {
    if (!LangChainService.instance) {
      LangChainService.instance = new LangChainService();
    }
    return LangChainService.instance;
  }

  private initialize(): void {
    try {
      validateApiKey(OPENAI_API_KEY);
      this.initialized = true;
      logger.info('LangChain service initialized successfully');
    } catch (error) {
      logger.error(`${ERROR_INITIALIZATION}: ${error instanceof Error ? error.message : String(error)}`);
      this.initialized = false;
    }
  }

  public async createChatModel(params: ChatModelParams = {}): Promise<ChatOpenAI | any> {
    try {
      if (!this.initialized) {
        throw new Error(ERROR_INITIALIZATION);
      }

      const {
        temperature = 0.7,
        maxTokens = 2048,
        modelName = MODEL_CONFIGS.GPT4O_MINI,
        includeWildberriesTools = false,
        userId
      } = params;

      validateWildberriesToolsRequirements(includeWildberriesTools, userId);
      
      const modelConfig: any = {
        temperature,
        maxTokens,
        modelName,
        openAIApiKey: OPENAI_API_KEY,
        timeout: 30000, // 30 seconds timeout
      };

      const chatModel = new ChatOpenAI(modelConfig);

      // Add Wildberries tools if requested
      if (includeWildberriesTools && userId) {
        try {
          const toolsByName = createToolsMap(userId);
          const wildberriesSellerTool = toolsByName['wildberries_seller_products'];
          if (wildberriesSellerTool) {
            return chatModel.bindTools([wildberriesSellerTool]);
          }
        } catch (toolError) {
          logger.warn('Failed to create Wildberries tools, returning model without tools', {
            userId,
            error: toolError instanceof Error ? toolError.message : String(toolError)
          });
        }
      }

      return chatModel;
    } catch (error) {
      logger.error(`${ERROR_MODEL_CREATION}: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`${ERROR_MODEL_CREATION}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

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
        timeout: 30000,
      };

      return new OpenAIEmbeddings(modelConfig);
    } catch (error) {
      logger.error(`${ERROR_MODEL_CREATION}: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`${ERROR_MODEL_CREATION}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  public async generateChatResponse(
    systemPrompt: string,
    userMessage: string,
    options: ChatOptions = {}
  ): Promise<string> {
    const {
      modelName = MODEL_CONFIGS.GPT4O_MINI,
      userId,
      stream = false,
      includeWildberriesTools = false
    } = options;

    try {
      await validateUserUsageLimit(userId);

      const finalSystemPrompt = includeWildberriesTools 
        ? generateSystemPromptWithWildberriesTools(systemPrompt)
        : systemPrompt;

      const chatModel = await this.createChatModel({ 
        modelName, 
        includeWildberriesTools,
        userId 
      });

      const messages = [
        new SystemMessage(finalSystemPrompt),
        new HumanMessage(userMessage)
      ];

      let outputText = '';
      let responseAI: AIMessage;

      if (stream) {
        const accumulatedResponse = await streamAIResponse(chatModel, messages, (chunk: any) => {
          console.log(`${chunk.content}|`);
        });
        outputText = accumulatedResponse.content.toString();
        responseAI = accumulatedResponse as AIMessage;
      } else {
        const response = await chatModel.invoke(messages);
        outputText = response.content.toString();
        responseAI = response as AIMessage;
      }

      await this.trackTokenUsage(responseAI, finalSystemPrompt, formatLangchainMessagesToBasic(messages), modelName, userId);
      return outputText;
    } catch (error) {
      logger.error(`Error generating chat response: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  public async generateConversationResponse(
    systemPrompt: string,
    messages: BasicMessage[],
    options: ConversationOptions
  ): Promise<string | Response> {
    const {
      modelName = MODEL_CONFIGS.GPT4O_MINI,
      conversationId,
      userId,
      stream = false,
      includeWildberriesTools = true
    } = options;

    try {
      await validateUserUsageLimit(userId);

      const finalSystemPrompt = includeWildberriesTools 
        ? generateSystemPromptWithWildberriesTools(systemPrompt)
        : systemPrompt;

      const chatModel = await this.createChatModel({ 
        modelName,
        includeWildberriesTools,
        userId
      });

      const langchainMessages = convertToLangChainMessages(finalSystemPrompt, messages);

      if (stream) {
        return this.handleStreamingResponse(
          chatModel, 
          langchainMessages, 
          conversationId, 
          finalSystemPrompt, 
          messages, 
          modelName, 
          userId
        );
      } else {
        return this.handleNonStreamingResponse(
          chatModel, 
          langchainMessages, 
          finalSystemPrompt, 
          messages, 
          modelName, 
          userId
        );
      }
    } catch (error) {
      logger.error(`Error generating conversation response: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleNonStreamingResponse(
    chatModel: any,
    langchainMessages: any[],
    systemPrompt: string,
    originalMessages: BasicMessage[],
    modelName: string,
    userId?: string
  ): Promise<string> {
    // First invoke to check for tool calls
    const initialResponse = await chatModel.invoke(langchainMessages);
    await this.trackTokenUsage(initialResponse, systemPrompt, originalMessages, modelName, userId);

    // Check if the model wants to call tools
    if (initialResponse.tool_calls && initialResponse.tool_calls.length > 0) {
      logger.info(`Tool calls detected: ${initialResponse.tool_calls.map((tc: any) => tc.name).join(', ')}`);
      
      // Execute tools
      const toolResults = await executeTools(initialResponse.tool_calls, userId);

      // Create new message array with tool results
      const messagesWithTools = [
        ...langchainMessages,
        initialResponse,
        ...toolResults
      ];

      // Get final response with tool results
      const finalResponse = await chatModel.invoke(messagesWithTools);
      const outputText = finalResponse.content.toString();

      const finalMessages = [
        ...originalMessages,
        { role: 'assistant', content: outputText },
        ...toolResults.map(tr => ({ role: 'tool', content: tr.content.toString() }))
      ];
      
      await this.trackTokenUsage(finalResponse, systemPrompt, finalMessages, modelName, userId);
      return outputText;
    } else {
      // No tool calls, return response directly
      return initialResponse.content.toString();
    }
  }

  private async handleStreamingResponse(
    chatModel: any,
    langchainMessages: any[],
    conversationId: string,
    finalSystemPrompt: string,
    messages: BasicMessage[],
    modelName: string,
    userId?: string
  ): Promise<Response> {
    const self = this; // Capture the class context
    
    const stream = new ReadableStream({
      async start(controller) {
        const streamController = new StreamController(controller);
        
        try {
          logger.info('Starting chain of thoughts streaming...');
          
          // Step 1: Stream the initial response directly without accumulation
          const streamResponse = await chatModel.stream(langchainMessages);
          let initialResponse: AIMessageChunk | null = null;
          
          // Stream each chunk as it arrives
          for await (const chunk of streamResponse) {
            if (chunk.content) {
              // Send content chunk immediately to client
              streamController.sendChunk(typeof chunk.content === 'string' 
                ? chunk.content 
                : chunk.content.toString());
            }
            
            // Accumulate the full response for later processing
            if (!initialResponse) {
              initialResponse = chunk;
            } else {
              initialResponse = initialResponse.concat(chunk);
            }
          }
          
          // Step 2: Save the initial AI response and track token usage
          if (initialResponse) {
            await self.saveInitialResponse(initialResponse, conversationId, finalSystemPrompt, messages, modelName, userId);
          }
          
          // Step 3: Handle tool calls if present
          if (initialResponse?.tool_calls && initialResponse.tool_calls.length > 0) {
            await self.handleToolCallsInStream(
              chatModel,
              langchainMessages,
              initialResponse,
              conversationId,
              streamController,
              finalSystemPrompt,
              messages,
              modelName,
              userId
            );
          }
          
          streamController.sendEnd();
          
        } catch (error) {
          logger.error('Error in chain of thoughts streaming:', error);
          streamController.sendError(error instanceof Error ? error.message : 'Unknown error occurred');
        }
      }
    });

    return createStreamResponse(stream);
  }

  private async saveInitialResponse(
    initialResponse: AIMessageChunk,
    conversationId: string,
    finalSystemPrompt: string,
    messages: BasicMessage[],
    modelName: string,
    userId?: string
  ): Promise<void> {
    try {
      await saveMessage({
        conversationId,
        content: typeof initialResponse.content === 'string' 
          ? initialResponse.content 
          : initialResponse.content?.toString() || '',
        role: 'assistant',
        toolCalls: initialResponse.tool_calls && initialResponse.tool_calls.length > 0 ? initialResponse.tool_calls : undefined
      });
      logger.info('Saved initial AI response to database');
      
      if (userId) {
        await this.trackTokenUsage(initialResponse, finalSystemPrompt, messages, modelName, userId);
      }
    } catch (saveError) {
      logger.error('Failed to save initial AI response:', saveError);
    }
  }

  private async handleToolCallsInStream(
    chatModel: any,
    langchainMessages: any[],
    initialResponse: AIMessageChunk,
    conversationId: string,
    streamController: StreamController,
    finalSystemPrompt: string,
    messages: BasicMessage[],
    modelName: string,
    userId?: string
  ): Promise<void> {
    if (!initialResponse.tool_calls || initialResponse.tool_calls.length === 0) {
      return;
    }

    logger.info(`Tool calls detected in streaming: ${initialResponse.tool_calls.map((tc: any) => tc.name).join(', ')}`);
    
    // Send tool execution notification
    const toolExecutionEvents = getToolExecutionEvents(initialResponse.tool_calls);
    streamController.sendToolExecution(toolExecutionEvents);
    
    // Execute tools and save tool messages
    const toolResults = await executeTools(initialResponse.tool_calls, userId);
    const toolCompleteEvents: Array<{message: string, toolName: string, status: 'success' | 'error'}> = [];
    
    // Save tool messages to database
    for (const toolResult of toolResults) {
      const parsedResult = parseToolExecutionResult(toolResult, initialResponse.tool_calls);
      
      try {
        await saveMessage({
          conversationId,
          content: parsedResult.userFriendlyMessage,
          role: 'tool',
          status: parsedResult.status,
          toolCallId: toolResult.tool_call_id,
          toolName: parsedResult.toolName
        });

        toolCompleteEvents.push({
          message: parsedResult.userFriendlyMessage,
          toolName: parsedResult.toolName,
          status: parsedResult.status
        });
        
        logger.info(`Saved tool message to database: ${toolResult.tool_call_id} (status: ${parsedResult.status})`);
      } catch (saveError) {
        logger.error('Failed to save tool message:', saveError);
      }
    }

    // Send tool complete event
    streamController.sendToolComplete(toolCompleteEvents);
    
    // Get final response with tool results
    const messagesWithTools = [
      ...langchainMessages,
      initialResponse,
      ...toolResults
    ];
    
    // Stream the final response directly
    const finalStreamResponse = await chatModel.stream(messagesWithTools);
    let finalResponse: AIMessageChunk | null = null;
    
    for await (const chunk of finalStreamResponse) {
      if (chunk.content) {
        // Send final response content immediately
        streamController.sendChunk(typeof chunk.content === 'string' 
          ? chunk.content 
          : chunk.content.toString());
      }
      
      // Accumulate the final response for token tracking
      if (!finalResponse) {
        finalResponse = chunk;
      } else {
        finalResponse = finalResponse.concat(chunk);
      }
    }
    
    // Save the final AI response and track token usage
    if (finalResponse && finalResponse.content && finalResponse.content.toString().trim()) {
      try {
        await saveMessage({
          conversationId,
          content: typeof finalResponse.content === 'string' 
            ? finalResponse.content 
            : finalResponse.content.toString(),
          role: 'assistant'
        });
        logger.info('Saved final AI response to database');
        
        if (userId) {
          const updatedMessages = [
            ...messages,
            { role: 'assistant', content: finalResponse.content.toString() },
            ...toolResults.map(tr => ({ role: 'tool', content: tr.content.toString() }))
          ];
          await this.trackTokenUsage(finalResponse, finalSystemPrompt, updatedMessages, modelName, userId);
        }
      } catch (saveError) {
        logger.error('Failed to save final AI response:', saveError);
      }
    }
  }

  private async trackTokenUsage(
    responseAI: AIMessage | AIMessageChunk,
    systemPrompt: string,
    messages: Array<{role: string, content: string}>,
    modelName: string,
    userId?: string
  ): Promise<void> {
    const tokenUsage = extractTokenUsage(responseAI, systemPrompt, messages, modelName);
    
    logger.info(
      `Token usage - Input: ${tokenUsage.inputTokens}, Output: ${tokenUsage.outputTokens}, ` +
      `Cost: $${tokenUsage.totalCost.toFixed(6)} ${tokenUsage.isEstimated ? '(Estimated)' : '(Actual)'}`
    );

    if (userId) {
      const today = new Date().toISOString().slice(0, 10);
      await upsertDailyUsage(
        userId, 
        today, 
        modelName, 
        tokenUsage.inputTokens, 
        tokenUsage.outputTokens, 
        tokenUsage.totalCost
      );
    }
  }

  public async getMetrics(userId: string, date?: string): Promise<TokenMetrics[]> {
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

  public async resetMetrics(userId: string): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
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