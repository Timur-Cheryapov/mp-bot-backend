import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { StateGraph, MessagesAnnotation, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { Annotation } from '@langchain/langgraph';

import logger from '../utils/logger';
import { formatLangchainMessagesToBasic } from '../utils/langchainUtils';
import { upsertDailyUsage } from './dailyUsage';
import { DailyUsage } from './supabase';

// Utilities
import { 
  extractTokenUsage, 
  TokenUsageResult,
  extractTokenUsageFromMetadata
} from '../utils/tokenCostCalculator';
import {
  BasicMessage,
  convertToLangChainMessages,
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
  validateUserUsageLimit,
  validateWildberriesToolsRequirements,
  validateApiKey
} from '../utils/validationUtils';

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Error messages
const ERROR_INITIALIZATION = 'Failed to initialize LangGraph service';
const ERROR_MODEL_CREATION = 'Failed to create model instance';

// Model configurations
export const MODEL_CONFIGS = {
  GPT4_1: 'gpt-4.1',
  GPT4_1_MINI: 'gpt-4.1-mini',
  TEXT_EMBEDDING_3_SMALL: 'text-embedding-3-small',
  GPT4O_MINI: 'gpt-4o-mini'
};

// Configuration types (kept same for compatibility)
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

type TokenMetrics = Omit<DailyUsage, 'id' | 'created_at' | 'updated_at'>;

// LangGraph Agent State
const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec, // Spread the messages annotation
  conversationId: Annotation<string>,
  userId: Annotation<string>,
  modelName: Annotation<string>,
  includeWildberriesTools: Annotation<boolean>,
});

/**
 * LangGraph-based LangChain service implementation
 */
class LangGraphService {
  private static instance: LangGraphService;
  private initialized: boolean = false;
  private checkpointer: MemorySaver;

  private constructor() {
    this.checkpointer = new MemorySaver();
    this.initialize();
  }

  public static getInstance(): LangGraphService {
    if (!LangGraphService.instance) {
      LangGraphService.instance = new LangGraphService();
    }
    return LangGraphService.instance;
  }

  private initialize(): void {
    try {
      validateApiKey(OPENAI_API_KEY);
      this.initialized = true;
      logger.info('LangGraph service initialized successfully');
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
        const response = await boundModel.invoke(state.messages);
        
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

    return workflow.compile({ 
      checkpointer: this.checkpointer 
    });
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
        // For now, fallback to legacy for streaming until we implement LangGraph streaming
        throw new Error('Streaming not implemented in LangGraph service yet');
      }

      // Create agent
      const agent = this.createAgent(userId, includeWildberriesTools);
      
      // Convert messages to LangChain format
      const langchainMessages = convertToLangChainMessages(systemPrompt, messages);

      // Configure thread for conversation persistence
      const config = {
        configurable: { 
          thread_id: conversationId 
        }
      };

      // Invoke agent with state
      const initialState = {
        messages: langchainMessages,
        conversationId,
        userId: userId || '',
        modelName,
        includeWildberriesTools
      };

      const result = await agent.invoke(initialState, config);
      
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
}

// Export function to get the singleton instance
export const getLangGraphService = (): LangGraphService => {
  return LangGraphService.getInstance();
};

export default getLangGraphService;
