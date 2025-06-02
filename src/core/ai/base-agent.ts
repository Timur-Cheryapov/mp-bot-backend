import { Tool } from '@langchain/core/tools';
import { IAgent, AgentConfig, AgentState, ExecutionConfig, AgentEvent, ConversationContext } from './multi-agent.types';
import logger from '../../shared/utils/logger';
import { CompiledStateGraph } from '@langchain/langgraph';

/**
 * Abstract base class that provides common functionality for all agents.
 * 
 * This class implements the IAgent interface and provides default implementations
 * for common methods, while requiring concrete agents to implement the specific
 * business logic methods.
 * 
 * Key features:
 * - Standard initialization pattern
 * - Default intent matching logic
 * - Common error handling
 * - Logging and debugging support
 */
export abstract class BaseAgent implements IAgent {
  /** Unique identifier for this agent (must be implemented by subclasses) */
  abstract readonly id: string;
  
  /** Human-readable name for this agent */
  abstract readonly name: string;
  
  /** Brief description of what this agent does */
  abstract readonly description: string;
  
  /** List of intents/keywords this agent can handle */
  abstract readonly intents: string[];
  
  /** Tools available to this agent for execution */
  abstract readonly tools: Tool[];
  
  /** LangGraph workflow/state graph for this agent (must be initialized by subclass) */
  abstract readonly workflow: CompiledStateGraph<any, any, any, any, any, any>;
  
  /** Configuration used during initialization */
  protected config?: AgentConfig;
  
  /** User ID this agent is initialized for */
  protected userId?: string;
  
  /**
   * Initialize the agent with user-specific configuration.
   * This method is called once when the agent is first used for a user.
   * 
   * @param userId - The user's unique identifier
   * @param config - Agent-specific configuration
   */
  async initialize(userId: string, config: AgentConfig): Promise<void> {
    this.userId = userId;
    this.config = config;
    
    logger.info(`Initializing agent ${this.id} for user ${userId}`, {
      agentId: this.id,
      agentName: this.name,
      userId,
      configVersion: config.version
    });
    
    // Validate that the agent is properly configured
    this.validateConfiguration();
    
    // Call any custom initialization logic
    await this.onInitialize(userId, config);
    
    logger.info(`Agent ${this.id} initialized successfully`);
  }
  
  /**
   * Hook for subclasses to implement custom initialization logic.
   * Called after basic initialization is complete.
   * 
   * @param userId - The user's unique identifier
   * @param config - Agent-specific configuration
   */
  protected async onInitialize(userId: string, config: AgentConfig): Promise<void> {
    // Default implementation does nothing
    // Subclasses can override this for custom initialization
  }
  
  /**
   * Determine if this agent can handle a specific intent.
   * 
   * The default implementation checks if any of the agent's intent keywords
   * are contained in the input intent (case-insensitive). Subclasses can
   * override this for more sophisticated intent matching.
   * 
   * @param intent - The classified intent from user input
   * @param context - Current conversation context
   * @returns true if this agent can handle the intent
   */
  canHandle(intent: string, context: ConversationContext): boolean {
    // Normalize intent for comparison
    const normalizedIntent = intent.toLowerCase().trim();
    
    // Check if any of our intents match the input intent
    const canHandle = this.intents.some(agentIntent => {
      const normalizedAgentIntent = agentIntent.toLowerCase().trim();
      
      // Check for exact matches or substring matches
      return normalizedIntent.includes(normalizedAgentIntent) || 
             normalizedAgentIntent.includes(normalizedIntent);
    });
    
    logger.debug(`Agent ${this.id} can handle intent '${intent}': ${canHandle}`, {
      agentId: this.id,
      intent,
      agentIntents: this.intents,
      result: canHandle
    });
    
    return canHandle;
  }
  
  /**
   * Execute the agent's workflow and return streaming events.
   * This is the main entry point for agent execution.
   * 
   * @param state - Current agent state
   * @param config - Execution configuration
   * @yields AgentEvent - Stream of events during execution
   */
  abstract execute(state: AgentState, config: ExecutionConfig): AsyncIterable<AgentEvent>;
  
  /**
   * Validate that the agent is properly configured.
   * Throws an error if configuration is invalid.
   */
  protected validateConfiguration(): void {
    if (!this.id) {
      throw new Error('Agent ID is required');
    }
    
    if (!this.name) {
      throw new Error('Agent name is required');
    }
    
    if (!this.intents || this.intents.length === 0) {
      throw new Error('Agent must have at least one intent');
    }
    
    if (!Array.isArray(this.tools)) {
      throw new Error('Agent tools must be an array');
    }
    
    if (!this.workflow) {
      throw new Error('Agent workflow is required');
    }
  }
  
  /**
   * Helper method to create a standardized error event
   * @param error - The error that occurred
   * @param context - Additional context about the error
   * @returns AgentEvent representing the error
   */
  protected createErrorEvent(error: Error | string, context?: any): AgentEvent {
    const errorMessage = error instanceof Error ? error.message : error;
    
    logger.error(`Agent ${this.id} error: ${errorMessage}`, {
      agentId: this.id,
      error: errorMessage,
      context,
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return {
      type: 'error',
      error: errorMessage,
      agentId: this.id
    };
  }
  
  /**
   * Helper method to create a content chunk event
   * @param content - The content to send
   * @returns AgentEvent representing the content
   */
  protected createContentEvent(content: string): AgentEvent {
    return {
      type: 'content_chunk',
      content,
      agentId: this.id
    };
  }
  
  /**
   * Helper method to create a tool execution event
   * @param toolName - Name of the tool being executed
   * @returns AgentEvent representing tool execution
   */
  protected createToolExecutionEvent(toolName: string): AgentEvent {
    return {
      type: 'tool_execution',
      toolName,
      agentId: this.id
    };
  }
  
  /**
   * Helper method to create a tool result event
   * @param result - The result from tool execution
   * @param toolName - Name of the tool that was executed
   * @returns AgentEvent representing the tool result
   */
  protected createToolResultEvent(result: any, toolName: string): AgentEvent {
    return {
      type: 'tool_result',
      result,
      toolName,
      agentId: this.id
    };
  }
  
  /**
   * Helper method to create an agent completion event
   * @param finalState - The final state after execution
   * @returns AgentEvent representing completion
   */
  protected createCompletionEvent(finalState: any): AgentEvent {
    return {
      type: 'agent_complete',
      agentId: this.id,
      finalState
    };
  }
  
  /**
   * Get the agent's current configuration
   * @returns The agent configuration or undefined if not initialized
   */
  protected getConfig(): AgentConfig | undefined {
    return this.config;
  }
  
  /**
   * Get the user ID this agent is initialized for
   * @returns The user ID or undefined if not initialized
   */
  protected getUserId(): string | undefined {
    return this.userId;
  }
  
  /**
   * Check if the agent has been initialized
   * @returns true if the agent has been initialized
   */
  protected isInitialized(): boolean {
    return this.userId !== undefined && this.config !== undefined;
  }
} 