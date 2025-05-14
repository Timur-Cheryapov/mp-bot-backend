import { 
  PromptTemplate, 
  PromptRenderOptions, 
  PromptVariables,
  PromptType,
  PromptChain,
  ConversationContext,
  ConversationHistory,
  ConversationTurn,
  ModelType
} from '../prompts/types';
import { getLangChainService } from './langchain';
import { estimateTokenCount, sanitizeText } from '../utils/langchainUtils';
import logger from '../utils/logger';
import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate,
  MessagesPlaceholder
} from '@langchain/core/prompts';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';

// Default render options
const DEFAULT_RENDER_OPTIONS: PromptRenderOptions = {
  preserveFormatting: true,
  trimWhitespace: true,
  maxLength: 4000,
  addTimestamp: false,
};

/**
 * Service for managing and rendering prompts
 */
class PromptService {
  private static instance: PromptService;
  private promptRegistry: Map<string, PromptTemplate> = new Map();
  private chainRegistry: Map<string, PromptChain> = new Map();
  private langchainService = getLangChainService();
  
  private constructor() {}
  
  /**
   * Get singleton instance
   */
  public static getInstance(): PromptService {
    if (!PromptService.instance) {
      PromptService.instance = new PromptService();
    }
    return PromptService.instance;
  }
  
  /**
   * Register a prompt template
   * @param template The prompt template to register
   * @returns The registered template ID
   */
  public registerPrompt(template: PromptTemplate): string {
    const id = `${template.metadata.name}-${template.type}-${template.metadata.version}`;
    this.promptRegistry.set(id, template);
    return id;
  }
  
  /**
   * Get a prompt template by ID
   * @param id Template ID
   * @returns The prompt template or undefined if not found
   */
  public getPrompt(id: string): PromptTemplate | undefined {
    return this.promptRegistry.get(id);
  }
  
  /**
   * Register a prompt chain
   * @param chain The prompt chain to register
   * @returns The registered chain ID
   */
  public registerChain(chain: PromptChain): string {
    const id = `${chain.metadata.name}-${chain.metadata.version}`;
    this.chainRegistry.set(id, chain);
    return id;
  }
  
  /**
   * Get a prompt chain by ID
   * @param id Chain ID
   * @returns The prompt chain or undefined if not found
   */
  public getChain(id: string): PromptChain | undefined {
    return this.chainRegistry.get(id);
  }
  
  /**
   * Render a prompt template with variables
   * @param template The prompt template to render
   * @param variables Variables to substitute in the template
   * @param options Rendering options
   * @returns The rendered prompt text
   */
  public renderPrompt(
    template: PromptTemplate,
    variables: PromptVariables = {},
    options: Partial<PromptRenderOptions> = {}
  ): string {
    try {
      // Merge default options with provided options
      const finalOptions = {
        ...DEFAULT_RENDER_OPTIONS,
        ...options,
      };
      
      // Replace variable placeholders with values
      let renderedText = template.template;
      
      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{${key}}`;
        if (renderedText.includes(placeholder)) {
          renderedText = renderedText.replace(
            new RegExp(placeholder, 'g'),
            String(value)
          );
        }
      }
      
      // Apply formatting options
      if (finalOptions.trimWhitespace) {
        renderedText = renderedText.trim().replace(/\s+/g, ' ');
      }
      
      if (finalOptions.maxLength && renderedText.length > finalOptions.maxLength) {
        renderedText = renderedText.substring(0, finalOptions.maxLength);
      }
      
      if (finalOptions.addTimestamp) {
        renderedText = `[${new Date().toISOString()}] ${renderedText}`;
      }
      
      return renderedText;
    } catch (error) {
      logger.error(`Error rendering prompt: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to render prompt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Render a full chain of prompts
   * @param chainId The ID of the chain to render
   * @param variables Variables to substitute
   * @param options Rendering options
   * @returns Array of rendered prompts
   */
  public renderChain(
    chainId: string,
    variables: PromptVariables = {},
    options: Partial<PromptRenderOptions> = {}
  ): string[] {
    const chain = this.getChain(chainId);
    
    if (!chain) {
      throw new Error(`Prompt chain with ID '${chainId}' not found`);
    }
    
    return chain.prompts.map(prompt => 
      this.renderPrompt(prompt, variables, options)
    );
  }
  
  /**
   * Create a LangChain ChatPromptTemplate from our PromptChain
   * @param chain The prompt chain to convert
   * @returns LangChain ChatPromptTemplate
   */
  public createLangChainPrompt(chain: PromptChain): ChatPromptTemplate {
    const messages = chain.prompts.map(prompt => {
      const template = prompt.template;
      
      switch (prompt.type) {
        case PromptType.System:
          return SystemMessagePromptTemplate.fromTemplate(template);
        case PromptType.User:
          return HumanMessagePromptTemplate.fromTemplate(template);
        default:
          // Default to human message for other prompt types
          return HumanMessagePromptTemplate.fromTemplate(template);
      }
    });
    
    return ChatPromptTemplate.fromMessages(messages);
  }
  
  /**
   * Convert our conversation history to LangChain messages
   * @param history Our conversation history format
   * @returns Array of LangChain messages
   */
  public convertHistoryToMessages(history: ConversationHistory) {
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
   * Create a complete conversation chain with memory
   * @param systemPrompt The system prompt for the conversation
   * @param memoryVariableName The name to use for the memory placeholder
   * @returns A LangChain ChatPromptTemplate with memory
   */
  public createConversationChain(
    systemPrompt: string,
    memoryVariableName: string = 'chat_history'
  ): ChatPromptTemplate {
    return ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(systemPrompt),
      new MessagesPlaceholder(memoryVariableName),
      HumanMessagePromptTemplate.fromTemplate('{input}')
    ]);
  }
  
  /**
   * Execute a prompt chain using LangChain
   * @param chainId The ID of the chain to execute
   * @param variables Variables to substitute
   * @param modelType Type of model to use (optional)
   * @returns The model response
   */
  public async executeChain(
    chainId: string,
    variables: PromptVariables,
    modelType?: ModelType
  ): Promise<string> {
    try {
      const chain = this.getChain(chainId);
      
      if (!chain) {
        throw new Error(`Prompt chain with ID '${chainId}' not found`);
      }
      
      // Create LangChain prompt from our chain
      const langChainPrompt = this.createLangChainPrompt(chain);
      
      // Get appropriate model based on chain or parameter
      const modelToUse = modelType || chain.modelType || ModelType.GeneralPurpose;
      
      // Create LangChain model
      const model = this.langchainService.createChatModel({
        temperature: 0.7, // Could be customized based on model type
      });
      
      // Create the chain
      const outputParser = new StringOutputParser();
      const llmChain = RunnableSequence.from([
        langChainPrompt,
        model,
        outputParser
      ]);
      
      // Execute the chain
      const result = await llmChain.invoke(variables);
      
      return result;
    } catch (error) {
      logger.error(`Error executing prompt chain: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to execute prompt chain: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Execute a conversation with memory
   * @param systemPrompt The system prompt
   * @param userInput The current user input
   * @param context The conversation context
   * @returns The model response
   */
  public async executeConversation(
    systemPrompt: string,
    userInput: string,
    context: ConversationContext
  ): Promise<string> {
    try {
      // Create conversation chain with memory
      const conversationPrompt = this.createConversationChain(systemPrompt);
      
      // Create model
      const model = this.langchainService.createChatModel({
        temperature: 0.7,
      });
      
      // Create the chain
      const outputParser = new StringOutputParser();
      const chain = RunnableSequence.from([
        conversationPrompt,
        model,
        outputParser
      ]);
      
      // Convert our history format to LangChain messages
      const messages = this.convertHistoryToMessages(context.history);
      
      // Execute the chain
      const result = await chain.invoke({
        chat_history: messages,
        input: userInput,
        ...context.variables
      });
      
      return result;
    } catch (error) {
      logger.error(`Error executing conversation: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to execute conversation: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Estimate token count for prompt templates
   * @param template The prompt template
   * @param variables Variables to substitute
   * @returns Estimated token count
   */
  public estimateTokenCount(
    template: PromptTemplate,
    variables: PromptVariables = {}
  ): number {
    const renderedText = this.renderPrompt(template, variables);
    return estimateTokenCount(renderedText);
  }
}

// Export function to get the singleton instance
export const getPromptService = (): PromptService => {
  return PromptService.getInstance();
};

export default getPromptService; 