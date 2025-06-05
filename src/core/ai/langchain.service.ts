import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { StateGraph, MessagesAnnotation, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AIMessage, HumanMessage, SystemMessage, BaseMessage, ToolMessage, AIMessageChunk } from '@langchain/core/messages';
import { Annotation } from '@langchain/langgraph';
import { BasicMessage } from '../../shared/types/message.types';

import logger from '../../shared/utils/logger';
import { upsertDailyUsage } from '../plans/daily-usage.service';
import { DailyUsage } from '../../infrastructure/database/supabase.client';

// Utilities
import { 
  extractTokenUsage, 
  TokenUsageResult,
  extractTokenUsageFromMetadata
} from './token-calculator';
import {
  convertToLangChainMessages,
  saveMessage
} from '../conversations/message.utils';
import {
  executeTools,
  getToolExecutionEvents,
  parseToolExecutionResult,
  createToolsMap
} from '../tools/tool-execution.utils';
import { validateUserUsageLimit } from '../plans/validation.utils';
import { validateWildberriesToolsRequirements } from '../tools/validation.utils';
import { validateApiKey } from '../../shared/utils/validation.utils';
import { StreamController, createStreamResponse } from '../../shared/utils/streaming.utils';
import { MODEL_CONFIGS } from '../../config/langchain.config';
import { ChatOptions, ConversationOptions, ChatModelParams, EmbeddingModelParams, TokenMetrics } from './langchain.types';

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Error messages
const ERROR_INITIALIZATION = 'Failed to initialize LangChain service';
const ERROR_MODEL_CREATION = 'Failed to create model instance';

// LangGraph Agent State - simplified without persistence fields
const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  userId: Annotation<string>,
  modelName: Annotation<string>,
  includeWildberriesTools: Annotation<boolean>,
});

/**
 * LangChain service implementation using LangGraph without state persistence
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
      logger.info('LangChain service initialized successfully with LangGraph');
    } catch (error) {
      logger.error(`${ERROR_INITIALIZATION}: ${error instanceof Error ? error.message : String(error)}`);
      this.initialized = false;
    }
  }

  private createChatModel(params: ChatModelParams = {}): ChatOpenAI {
    if (!this.initialized) {
      throw new Error(ERROR_INITIALIZATION);
    }

    const {
      temperature = 0.7,
      maxTokens = 2048,
      modelName = MODEL_CONFIGS.GPT4O_MINI,
    } = params;
    
    const modelConfig = {
      temperature,
      maxTokens,
      modelName,
      openAIApiKey: OPENAI_API_KEY,
      timeout: 30000,
      streamUsage: true, // Enable built-in token tracking
    };

    return new ChatOpenAI(modelConfig);
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

  private createTools(userId?: string) {
    if (!userId) return [];
    
    try {
      const toolsByName = createToolsMap(userId);
      const wildberriesSellerTool = toolsByName['wildberries_seller_products'];
      return wildberriesSellerTool ? [wildberriesSellerTool] : [];
    } catch (toolError) {
      logger.warn('Failed to create Wildberries tools', {
        userId,
        error: toolError instanceof Error ? toolError.message : String(toolError)
      });
      return [];
    }
  }

  private createAgent(userId?: string, includeWildberriesTools: boolean = false) {
    const model = this.createChatModel();
    
    // Create tools if needed
    const tools = includeWildberriesTools && userId ? this.createTools(userId) : [];
    const toolNode = tools.length > 0 ? new ToolNode(tools) : null;

    // Bind tools to model if available
    const boundModel = tools.length > 0 ? model.bindTools(tools) : model;

    // Define agent node
    const callModel = async (state: typeof AgentState.State) => {
      try {
        //console.log('state.messages', state.messages);
        const response = await boundModel.invoke(state.messages);
        console.log('response', response);
        
        // Track token usage if we have userId
        if (state.userId && response.usage_metadata) {
          await this.trackTokenUsageFromMetadata(
            response.usage_metadata,
            state.modelName || MODEL_CONFIGS.GPT4O_MINI,
            state.userId
          );
        }
        
        return { messages: [response] };
      } catch (error) {
        logger.error('Error in callModel node:', error);
        throw error;
      }
    };

    // Define conditional logic
    const shouldContinue = (state: typeof AgentState.State) => {
      const messages = state.messages;
      const lastMessage = messages[messages.length - 1] as AIMessage;
      
      // If no tools are available or no tool calls, end
      if (!tools.length || !lastMessage.tool_calls?.length) {
        return END;
      }
      
      return "tools";
    };

    // Build the graph
    const workflow = new StateGraph(AgentState)
      .addNode("agent", callModel)
      .addEdge("__start__", "agent");

    // Add tools node and edges if we have tools
    if (toolNode && tools.length > 0) {
      workflow
        .addNode("tools", toolNode)
        .addConditionalEdges("agent", shouldContinue, {
          tools: "tools",
          [END]: END
        })
        .addEdge("tools", "agent");
    } else {
      workflow.addEdge("agent", END);
    }

    return workflow.compile();
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
      validateWildberriesToolsRequirements(includeWildberriesTools, userId);

      // For simple chat (non-conversation), we'll use direct model invoke for now
      // since LangGraph is most beneficial for complex multi-turn conversations
      const model = this.createChatModel({ modelName });
      
      if (includeWildberriesTools && userId) {
        const tools = this.createTools(userId);
        if (tools.length > 0) {
          const boundModel = model.bindTools(tools);
          const messages = [
            new SystemMessage(systemPrompt),
            new HumanMessage(userMessage)
          ];
          
          const response = await boundModel.invoke(messages);
          
          // Track token usage
          if (response.usage_metadata) {
            await this.trackTokenUsageFromMetadata(response.usage_metadata, modelName, userId);
          }
          
          return response.content.toString();
        }
      }

      // Simple non-tool chat
      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userMessage)
      ];

      const response = await model.invoke(messages);
      
      // Track token usage
      if (response.usage_metadata) {
        await this.trackTokenUsageFromMetadata(response.usage_metadata, modelName, userId);
      }

      return response.content.toString();
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
      validateWildberriesToolsRequirements(includeWildberriesTools, userId);

      if (stream) {
        return await this.handleStreamingResponse(
          systemPrompt,
          messages,
          conversationId,
          modelName,
          userId,
          includeWildberriesTools
        );
      }

      // Create agent
      const agent = this.createAgent(userId, includeWildberriesTools);
      
      // Convert conversation history to LangChain messages
      const langchainMessages = convertToLangChainMessages(systemPrompt, messages);

      // Simple state with full conversation context
      const callState = {
        messages: langchainMessages,
        userId: userId || '',
        modelName: modelName,
        includeWildberriesTools: includeWildberriesTools
      };

      // Invoke agent without persistence config
      const result = await agent.invoke(callState);
      
      // Get the final AI message
      const finalMessage = result.messages[result.messages.length - 1] as AIMessage;
      const outputText = finalMessage.content.toString();

      // Save messages to database if we have a conversationId
      if (conversationId) {
        // Save all new messages from this interaction
        const messagesToSave = result.messages.slice(langchainMessages.length);
        
        for (const message of messagesToSave) {
          if (message.constructor.name === 'AIMessage') {
            const aiMessage = message as AIMessage;
            await saveMessage({
              conversationId,
              content: aiMessage.content.toString(),
              role: 'assistant',
              toolCalls: aiMessage.tool_calls?.length ? aiMessage.tool_calls : undefined
            });
          } else if (message.constructor.name === 'ToolMessage') {
            const success = JSON.parse(message.content.toString()).success;
            // Handle tool messages if any
            await saveMessage({
              conversationId,
              content: message.content.toString(),
              role: 'tool',
              status: success ? 'success' : 'error',
              toolCallId: (message as any).tool_call_id,
              toolName: (message as any).name
            });
          }
        }
      }

      return outputText;
    } catch (error) {
      logger.error(`Error generating conversation response: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleStreamingResponse(
    systemPrompt: string,
    messages: BasicMessage[],
    conversationId: string,
    modelName: string,
    userId?: string,
    includeWildberriesTools: boolean = true
  ): Promise<Response> {
    const self = this; // Capture the class context
    
    const stream = new ReadableStream({
      async start(controller) {
        const streamController = new StreamController(controller);
        
        try {
          logger.info('Starting LangGraph streaming...');
          
          // Create agent
          const agent = self.createAgent(userId, includeWildberriesTools);
          
          // Convert conversation history to LangChain messages
          const langchainMessages = convertToLangChainMessages(systemPrompt, messages);

          // Simple state with full conversation context
          const callState = {
            messages: langchainMessages,
            userId: userId || '',
            modelName: modelName,
            includeWildberriesTools: includeWildberriesTools
          };

          // Track all messages that will be saved
          let accumulatedAIResponse: AIMessageChunk | null = null;
          const messagesToSave: any[] = [];

          // Stream without persistence config
          const stream = await agent.stream(callState, {
            streamMode: "messages" as const
          });
          
          for await (const chunk of stream) {
            // Process different types of messages in the stream
            for (const [nodeName, nodeState] of Object.entries(chunk)) {
              // When nodeName is '0', nodeState is a single message (AIMessageChunk or ToolMessage)
              if (nodeName === '0' && nodeState) {
                const message = nodeState as BaseMessage;
                
                if (message.constructor.name === 'AIMessageChunk') {
                  const aiMessage = message as AIMessageChunk;
                  
                  // Check for tool calls
                  if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
                    // Send tool execution notification
                    const toolExecutionEvents = getToolExecutionEvents(aiMessage.tool_calls);
                    streamController.sendToolExecution(toolExecutionEvents);
                  }
                  
                  // Stream content if available
                  if (aiMessage.content && aiMessage.content.toString().trim()) {
                    streamController.sendChunk(aiMessage.content.toString());
                  }
                  
                  // Accumulate the full AI response (similar to legacy approach)
                  if (!accumulatedAIResponse) {
                    accumulatedAIResponse = aiMessage;
                  } else {
                    // Concatenate chunks to build full response
                    accumulatedAIResponse = accumulatedAIResponse.concat(aiMessage);
                  }
                } else if (message.constructor.name === 'ToolMessage') {
                  // If there was an AIMessageChunk, we need to add it to the messagesToSave
                  if (accumulatedAIResponse) {
                    messagesToSave.push({
                      type: 'ai',
                      content: accumulatedAIResponse.content.toString(),
                      toolCalls: accumulatedAIResponse.tool_calls?.length ? accumulatedAIResponse.tool_calls : undefined
                    });
                    accumulatedAIResponse = null;
                  }
                  
                  // Handle tool result messages
                  const toolMessage = message as ToolMessage;
                  let toolStatus: 'success' | 'error' = 'success';
                  
                  try {
                    const result = JSON.parse(toolMessage.content.toString());
                    toolStatus = result.success ? 'success' : 'error';
                  } catch (e) {
                    // If not JSON, assume it's a raw response
                    toolStatus = 'success';
                  }

                  // Send tool complete event
                  streamController.sendToolComplete({
                    message: toolMessage.content.toString(),
                    toolName: toolMessage.name || '',
                    status: toolStatus
                  });
                  
                  // Add to messages to save
                  messagesToSave.push({
                    type: 'tool',
                    content: toolMessage.content,
                    toolCallId: toolMessage.tool_call_id,
                    toolName: toolMessage.name,
                    status: toolStatus
                  });
                }
              }
            }
          }

          // Add the accumulated AI response to the messagesToSave if it exists
          if (accumulatedAIResponse) {
            messagesToSave.push({
              type: 'ai',
              content: accumulatedAIResponse.content.toString(),
              toolCalls: accumulatedAIResponse.tool_calls?.length ? accumulatedAIResponse.tool_calls : undefined
            });
            accumulatedAIResponse = null;
          }
          
          // Save all messages to database
          if (conversationId && messagesToSave.length > 0) {
            for (const messageData of messagesToSave) {
              try {
                if (messageData.type === 'ai') {
                  await saveMessage({
                    conversationId,
                    content: messageData.content,
                    role: 'assistant',
                    toolCalls: messageData.toolCalls
                  });
                  
                  // Token usage is tracked in the callModel node
                } else if (messageData.type === 'tool') {
                  await saveMessage({
                    conversationId,
                    content: messageData.content,
                    role: 'tool',
                    status: messageData.status,
                    toolCallId: messageData.toolCallId,
                    toolName: messageData.toolName
                  });
                }
              } catch (saveError) {
                logger.error('Failed to save message during streaming:', saveError);
              }
            }
          }
          
          streamController.sendEnd();
          
        } catch (error) {
          logger.error('Error in LangGraph streaming:', error);
          streamController.sendError(error instanceof Error ? error.message : 'Unknown error occurred');
        }
      }
    });

    return createStreamResponse(stream);
  }

  private async trackTokenUsageFromMetadata(
    usageMetadata: any,
    modelName: string,
    userId?: string
  ): Promise<void> {
    if (!userId) return;

    const tokenUsage = extractTokenUsageFromMetadata(usageMetadata, modelName);
    
    logger.info(
      `Token usage - Input: ${tokenUsage.inputTokens}, Output: ${tokenUsage.outputTokens}, ` +
      `Cost: $${tokenUsage.totalCost.toFixed(6)} (LangGraph)`
    );

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

  // Legacy compatibility methods
  public async getMetrics(userId: string, date?: string): Promise<TokenMetrics[]> {
    const { getAllDailyUsage } = await import('../plans/daily-usage.service');
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
}

// Export function to get the singleton instance
export const getLangChainService = (): LangChainService => {
  return LangChainService.getInstance();
};

export default getLangChainService;
