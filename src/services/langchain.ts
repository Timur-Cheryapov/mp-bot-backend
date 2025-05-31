import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import logger from '../utils/logger';
import { estimateTokenCount, formatLangchainMessagesToBasic } from '../utils/langchainUtils';
import { upsertDailyUsage } from './dailyUsage';
import { DailyUsage } from './supabase';
import { checkUserDailyUsage } from './userPlans';
import { createWildberriesSellerProductsTool } from './wildberriesTools';
import { ToolCall } from '@langchain/core/dist/messages/tool';

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
  includeWildberriesTools?: boolean;
  userId?: string; // Required when includeWildberriesTools is true
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

      // Validate userId when Wildberries tools are requested
      if (includeWildberriesTools && !userId) {
        throw new Error('userId is required when includeWildberriesTools is true');
      }
      
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
          const wildberriesSellerTool = createWildberriesSellerProductsTool(userId);
          return chatModel.bindTools([wildberriesSellerTool]);
        } catch (toolError) {
          logger.warn('Failed to create Wildberries tools, returning model without tools', {
            userId,
            error: toolError instanceof Error ? toolError.message : String(toolError)
          });
          return chatModel;
        }
      }

      return chatModel;
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
   * Generate system prompt with Wildberries tools guidance
   */
  private generateSystemPromptWithWildberriesTools(basePrompt: string): string {
    return `${basePrompt}

You have access to Wildberries marketplace tools. When users ask about their marketplace business:

1. **Use tools proactively** when users mention products, inventory, or marketplace data
2. **Explain what you're doing** - tell users what tools you're going to call
3. **Present data clearly** - format product information in readable tables or lists
4. **Provide insights** - don't just show raw data, analyze trends and suggest improvements
5. **Handle errors gracefully** - if tool calls fail:
   - Check if the tool response contains a "userMessage" field and use that for user communication
   - If no userMessage, explain the technical error in user-friendly terms
   - Always offer next steps or solutions
   - Never show raw error objects to users

6. **User-friendly error handling**:
   - API key missing: Guide them to add their Wildberries API key
   - Permission errors: Explain they need Content category access
   - Rate limits: Suggest waiting and trying again
   - Network errors: Suggest trying again later

Focus on being helpful for marketplace sellers and provide actionable business insights even when data isn't available.`;
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
    stream?: boolean,
    includeWildberriesTools?: boolean
  ): Promise<string> {
    try {
      // Check if user has reached their token limit
      if (userId) {
        const usageCheck = await checkUserDailyUsage(userId);
        if (usageCheck.hasReachedLimit) {
          throw new Error(`Credit limit reached. Daily limit: $${usageCheck.dailyLimitCredits.toFixed(2)}, Monthly limit: $${usageCheck.monthlyLimitCredits.toFixed(2)}. Next reset: ${usageCheck.nextResetDate}`);
        }
      }

      const finalSystemPrompt = includeWildberriesTools 
        ? this.generateSystemPromptWithWildberriesTools(systemPrompt)
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

      await this.trackTokenUsage(responseAI, finalSystemPrompt, formatLangchainMessagesToBasic(messages), modelName, userId);
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
   * @param conversationId The conversation ID for saving messages during streaming
   * @returns The AI's response
   */
  public async generateConversationResponse(
    systemPrompt: string,
    messages: Array<{role: string, content: string, tool_call_id?: string, tool_name?: string, tool_calls?: ToolCall[]}>,
    modelName: string = MODEL_CONFIGS.GPT4O_MINI,
    conversationId: string,
    userId?: string,
    stream?: boolean,
    includeWildberriesTools: boolean = true
  ): Promise<string | Response> {
    try {
      // Check if user has reached their token limit
      if (userId) {
        const usageCheck = await checkUserDailyUsage(userId);
        if (usageCheck.hasReachedLimit) {
          throw new Error(`Credit limit reached. Daily limit: $${usageCheck.dailyLimitCredits.toFixed(2)}, Monthly limit: $${usageCheck.monthlyLimitCredits.toFixed(2)}. Next reset: ${usageCheck.nextResetDate}`);
        }
      }

      const finalSystemPrompt = includeWildberriesTools 
        ? this.generateSystemPromptWithWildberriesTools(systemPrompt)
        : systemPrompt;

      const chatModel = await this.createChatModel({ 
        modelName,
        includeWildberriesTools,
        userId
      });

      const langchainMessages = [
        new SystemMessage(finalSystemPrompt),
        ...messages.map(msg => {
          if (msg.role === 'user') return new HumanMessage(msg.content);
          if (msg.role === 'assistant') return new AIMessage({content: msg.content, tool_calls: msg.tool_calls});
          if (msg.role === 'tool') { return new ToolMessage(msg.content, msg.tool_call_id || 'unknown', msg.tool_name || 'unknown'); }
          return new SystemMessage(msg.content);
        })
      ];

      if (stream) {
        // For streaming, we need to handle tool calls manually
        return this.handleStreamingWithToolCalls(
          chatModel, 
          langchainMessages, 
          conversationId, 
          finalSystemPrompt, 
          messages, 
          modelName, 
          userId
        );
      } else {
        // For non-streaming, handle tool calls and return final response
        return this.handleToolCallsAndGetResponse(chatModel, langchainMessages, finalSystemPrompt, messages, modelName, userId);
      }
    } catch (error) {
      logger.error(`Error generating conversation response: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handle tool calls and get final response for non-streaming mode
   */
  private async handleToolCallsAndGetResponse(
    chatModel: any,
    langchainMessages: any[],
    systemPrompt: string,
    originalMessages: Array<{role: string, content: string}>,
    modelName: string,
    userId?: string
  ): Promise<string> {
    // First invoke to check for tool calls
    const initialResponse = await chatModel.invoke(langchainMessages);

    // Track token usage for the initial response
    await this.trackTokenUsage(initialResponse, systemPrompt, originalMessages, modelName, userId);

    // Check if the model wants to call tools
    if (initialResponse.tool_calls && initialResponse.tool_calls.length > 0) {
      logger.info(`Tool calls detected: ${initialResponse.tool_calls.map((tc: any) => tc.name).join(', ')}`);
      
      // Execute tools
      const toolResults = await this.executeTools(initialResponse.tool_calls, userId);

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
      
      // Track token usage for the final response
      await this.trackTokenUsage(finalResponse, systemPrompt, finalMessages, modelName, userId);
      return outputText;
    } else {
      // No tool calls, return response directly
      const outputText = initialResponse.content.toString();
      await this.trackTokenUsage(initialResponse, systemPrompt, originalMessages, modelName, userId);
      return outputText;
    }
  }

  /**
   * Handle streaming with tool calls - implements chain of thoughts approach
   */
  private async handleStreamingWithToolCalls(
    chatModel: any,
    langchainMessages: any[],
    conversationId: string,
    finalSystemPrompt: string,
    messages: Array<{role: string, content: string}>,
    modelName: string,
    userId?: string
  ): Promise<Response> {
    const encoder = new TextEncoder();
    const self = this; // Capture the class context
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Step 1: Stream the initial response (may contain tool calls)
          logger.info('Starting chain of thoughts streaming...');

          console.log('Langchain messages:', langchainMessages);
          
          const streamResponse = await chatModel.stream(langchainMessages);
          let initialResponse: any = null;
          
          // Stream the initial AI response
          for await (const chunk of streamResponse) {
            //console.log(chunk);
            if (chunk.content) {
              // Send content chunk to client
              const chunkData = JSON.stringify(chunk.content);
              controller.enqueue(encoder.encode(`event: chunk\ndata: ${chunkData}\n\n`));
            }
            
            // Accumulate the full response
            if (!initialResponse) {
              initialResponse = chunk;
            } else {
              initialResponse = initialResponse.concat(chunk);
            }
          }
          
          // Step 2: Save the initial AI response and track token usage
          if (initialResponse) {
            try {
              await self.saveMessage(
                conversationId, 
                initialResponse.content ? initialResponse.content.toString() : 'Processing...', 
                'assistant',
                undefined, // metadata
                undefined, // status
                initialResponse.tool_calls.length > 0 ? initialResponse.tool_calls : undefined // tool_calls for assistant message
              );
              logger.info('Saved initial AI response to database');
              
              // Track token usage for initial response
              if (initialResponse && userId) {
                await self.trackTokenUsage(initialResponse, finalSystemPrompt, messages, modelName, userId);
              }
            } catch (saveError) {
              logger.error('Failed to save initial AI response:', saveError);
            }
          }
          
          // Step 3: Check if there are tool calls to execute
          if (initialResponse?.tool_calls && initialResponse.tool_calls.length > 0) {
            logger.info(`Tool calls detected in streaming: ${initialResponse.tool_calls.map((tc: any) => tc.name).join(', ')}`);
            
            // Send tool execution notification
            const toolNotification = {
              message: "Let me fetch your Wildberries product data...",
              toolCalls: initialResponse.tool_calls.map((tc: any) => tc.name)
            };
            controller.enqueue(encoder.encode(`event: tool_execution\ndata: ${JSON.stringify(toolNotification)}\n\n`));
            
            // Step 4: Execute tools and save tool messages
            const toolResults = await self.executeTools(initialResponse.tool_calls, userId);
            
            // Save tool messages to database
            for (const toolResult of toolResults) {
              try {
                // Parse the tool result content to handle errors properly
                let messageContent = toolResult.content.toString();
                let messageStatus: 'success' | 'error' = 'success';
                
                try {
                  const parsedContent = JSON.parse(messageContent);
                  
                  // If the tool returned an error structure, extract the error message and set error status
                  if (parsedContent && !parsedContent.success && parsedContent.error) {
                    messageContent = parsedContent.error;
                    messageStatus = 'error';
                  } else if (parsedContent && parsedContent.success) {
                    // For successful responses, keep the full JSON for assistant processing
                    // messageContent = messageContent;
                    messageStatus = 'success';
                  }
                } catch (parseError) {
                  // If JSON parsing fails, treat as error and use raw content
                  messageStatus = 'error';
                  logger.warn('Failed to parse tool result JSON, treating as error', { 
                    toolCallId: toolResult.tool_call_id,
                    content: messageContent
                  });
                }
                
                await self.saveMessage(
                  conversationId,
                  messageContent,
                  'tool',
                  undefined, // metadata
                  messageStatus, // status based on tool result
                  undefined, // tool_calls (only for assistant messages)
                  toolResult.tool_call_id, // tool_call_id
                  initialResponse.tool_calls.find((tc: any) => tc.id === toolResult.tool_call_id)?.name // tool_name
                );
                logger.info(`Saved tool message to database: ${toolResult.tool_call_id} (status: ${messageStatus})`);
              } catch (saveError) {
                logger.error('Failed to save tool message:', saveError);
              }
            }
            
            // Step 5: Create messages with tool results and get final response
            const messagesWithTools = [
              ...langchainMessages,
              initialResponse,
              ...toolResults
            ];
            
            // Send separator to indicate we're moving to final response
            controller.enqueue(encoder.encode(`event: tool_complete\ndata: ${JSON.stringify({message: "Processing results..."})}\n\n`));
            
            // Step 6: Stream the final response with tool results
            const finalStreamResponse = await chatModel.stream(messagesWithTools);
            let finalResponse: any = null;
            
            for await (const chunk of finalStreamResponse) {
              if (chunk.content) {
                // Send final response content
                const chunkData = JSON.stringify(chunk.content);
                controller.enqueue(encoder.encode(`event: chunk\ndata: ${chunkData}\n\n`));
              }
              
              // Accumulate the final response for token tracking
              if (!finalResponse) {
                finalResponse = chunk;
              } else {
                finalResponse = finalResponse.concat(chunk);
              }
            }
            
            // Step 7: Save the final AI response and track token usage
            if (finalResponse.content.trim()) {
              try {
                await self.saveMessage(conversationId, finalResponse.content.toString(), 'assistant');
                logger.info('Saved final AI response to database');
                
                // Track token usage for final response
                if (finalResponse && userId) {
                  // Create updated message history including tool results for accurate token calculation
                  const updatedMessages = [
                    ...messages,
                    { role: 'assistant', content: finalResponse.content.toString() },
                    ...toolResults.map(tr => ({ role: 'tool', content: tr.content.toString() }))
                  ];
                  await self.trackTokenUsage(finalResponse, finalSystemPrompt, updatedMessages, modelName, userId);
                }
              } catch (saveError) {
                logger.error('Failed to save final AI response:', saveError);
              }
            }
          }
          
          // Step 8: Send end event
          controller.enqueue(encoder.encode(`event: end\ndata: {}\n\n`));
          controller.close();
          
        } catch (error) {
          logger.error('Error in chain of thoughts streaming:', error);
          const errorData = JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error occurred'
          });
          controller.enqueue(encoder.encode(`event: error\ndata: ${errorData}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  }

  /**
   * Execute tool calls and return ToolMessage objects
   */
  private async executeTools(toolCalls: any[], userId?: string): Promise<ToolMessage[]> {
    const toolResults: ToolMessage[] = [];

    // Create tools map
    const toolsByName: Record<string, any> = {};
    
    if (userId) {
      try {
        const wildberriesSellerTool = createWildberriesSellerProductsTool(userId);
        toolsByName['wildberries_seller_products'] = wildberriesSellerTool;
      } catch (error) {
        logger.warn('Failed to create Wildberries tool for execution', { userId, error });
      }
    }

    // Execute each tool call
    for (const toolCall of toolCalls) {
      try {
        const selectedTool = toolsByName[toolCall.name];
        if (selectedTool) {
          logger.info(`Executing tool: ${toolCall.name}`, { args: toolCall.args });
          
          // Use LangChain's built-in tool invocation which returns a ToolMessage
          const toolMessage = await selectedTool.invoke(toolCall);
          toolResults.push(toolMessage);
        } else {
          logger.error(`Tool not found: ${toolCall.name}`);
          // Create an error ToolMessage for unknown tools
          const errorMessage = new ToolMessage({
            content: `Tool '${toolCall.name}' not found`,
            tool_call_id: toolCall.id,
            status: 'error'
          });
          toolResults.push(errorMessage);
        }
      } catch (error) {
        logger.error(`Tool execution failed for ${toolCall.name}:`, error);
        // Create an error ToolMessage for failed executions
        const errorMessage = new ToolMessage({
          content: "Tool execution failed",
          tool_call_id: toolCall.id,
          status: 'error'
        });
        toolResults.push(errorMessage);
      }
    }

    return toolResults;
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

  private async saveMessage(
    conversationId: string, 
    content: string, 
    role: 'user' | 'assistant' | 'tool', 
    metadata?: Record<string, any>, 
    status: 'pending' | 'success' | 'error' = 'success',
    toolCalls?: any[],
    toolCallId?: string,
    toolName?: string
  ): Promise<void> {
    const { createMessage } = await import('./database');
    await createMessage(conversationId, content, role, metadata, status, toolCalls, toolCallId, toolName);
  }
}


// Export function to get the singleton instance
export const getLangChainService = (): LangChainService => {
  return LangChainService.getInstance();
};

export default getLangChainService; 