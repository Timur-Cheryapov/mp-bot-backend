import { CompiledStateGraph } from '@langchain/langgraph';
import { Tool } from '@langchain/core/tools';

/**
 * Core interface that defines the contract for all agents in the system.
 * This provides a standardized way to interact with different specialized agents.
 */
export interface IAgent {
  /** Unique identifier for the agent (e.g., 'product_agent', 'analytics_agent') */
  id: string;
  
  /** Human-readable name for the agent */
  name: string;
  
  /** Brief description of what this agent does */
  description: string;
  
  /** List of intents/keywords this agent can handle */
  intents: string[];
  
  /** Tools available to this agent for execution */
  tools: Tool[];
  
  /** LangGraph workflow/state graph for this agent */
  workflow: CompiledStateGraph<any, any, any, any, any, any>;
  
  /**
   * Initialize the agent with user-specific configuration
   * @param userId - The user's unique identifier
   * @param config - Agent-specific configuration
   */
  initialize(userId: string, config: AgentConfig): Promise<void>;
  
  /**
   * Determine if this agent can handle a specific intent
   * @param intent - The classified intent from user input
   * @param context - Current conversation context
   * @returns true if this agent can handle the intent
   */
  canHandle(intent: string, context: ConversationContext): boolean;
  
  /**
   * Execute the agent's workflow and return streaming events
   * @param state - Current agent state
   * @param config - Execution configuration
   * @yields AgentEvent - Stream of events during execution
   */
  execute(state: AgentState, config: ExecutionConfig): AsyncIterable<AgentEvent>;
}

/**
 * Different types of events that can be emitted during agent execution.
 * These events are streamed to the client for real-time updates.
 */
export type AgentEvent = 
  /** Agent starts processing */
  | { type: 'agent_start'; agentId: string; agentName: string }
  
  /** System switches from one agent to another */
  | { type: 'agent_switch'; fromAgent: string; toAgent: string; reason: string }
  
  /** Content chunk from agent response (for streaming text) */
  | { type: 'content_chunk'; content: string; agentId: string }
  
  /** Agent is executing a tool */
  | { type: 'tool_execution'; toolName: string; agentId: string }
  
  /** Tool execution completed with result */
  | { type: 'tool_result'; result: any; toolName: string; agentId: string }
  
  /** Agent completed its execution */
  | { type: 'agent_complete'; agentId: string; finalState: any }
  
  /** Error occurred during execution */
  | { type: 'error'; error: string; agentId: string }
  
  /** Conversation has ended */
  | { type: 'conversation_end' };

/**
 * Interface for managing streaming conversations across multiple agents
 */
export interface StreamingManager {
  /**
   * Start a new conversation session
   * @param conversationId - Unique conversation identifier
   * @yields AgentEvent - Stream of initialization events
   */
  startConversation(conversationId: string): AsyncIterable<AgentEvent>;
  
  /**
   * Process a user message and determine which agent should handle it
   * @param message - User's message content
   * @param context - Current conversation context
   * @yields AgentEvent - Stream of processing events
   */
  processMessage(message: string, context: ConversationContext): AsyncIterable<AgentEvent>;
  
  /**
   * Manually switch to a different agent
   * @param newAgentId - ID of the agent to switch to
   * @param reason - Reason for the switch
   */
  switchAgent(newAgentId: string, reason: string): Promise<void>;
  
  /**
   * End the current conversation session
   */
  endConversation(): Promise<void>;
}

/**
 * Configuration for an individual agent
 */
export interface AgentConfig {
  /** Agent metadata */
  id: string;
  name: string;
  description: string;
  version: string;
  
  /** Behavior configuration */
  intents: string[];
  priority: number; // Higher priority agents are preferred for conflict resolution
  enabled: boolean;
  
  /** Tool configuration */
  tools: ToolConfig[];
  
  /** Workflow configuration */
  workflow: WorkflowConfig;
  
  /** Resource limits */
  maxExecutionTime?: number;
  maxMemoryUsage?: number;
}

/**
 * Configuration for tools used by agents
 */
export interface ToolConfig {
  name: string;
  enabled: boolean;
  config: any; // Tool-specific configuration
}

/**
 * Configuration for agent workflows
 */
export interface WorkflowConfig {
  type: string;
  config: any; // Workflow-specific configuration
}

/**
 * Execution configuration for agent runs
 */
export interface ExecutionConfig {
  stream: boolean;
  timeout?: number;
  [key: string]: any;
}

/**
 * Current state of an agent during execution
 */
export interface AgentState {
  /** Chat messages in the conversation */
  messages: Array<{
    role: 'user' | 'assistant' | 'tool' | 'system';
    content: string;
    tool_calls?: any[];
    tool_call_id?: string;
  }>;
  
  /** Shared context accessible to all agents */
  sharedContext: SharedContext;
  
  /** Agent-specific state data */
  agentState: any;
  
  /** Current conversation ID */
  conversationId: string;
  
  /** User ID */
  userId: string;
  
  /** Additional state properties can be added by specific agents */
  [key: string]: any;
}

/**
 * Context shared between all agents in a conversation
 */
export interface SharedContext {
  conversationId: string;
  userId: string;
  
  /** Session-level data that persists across agent switches */
  sessionData: {
    currentProducts?: any[];
    userPreferences?: object;
    temporaryData?: object;
  };
  
  /** History of which agents have been active */
  agentHistory: Array<{
    agentId: string;
    timestamp: string;
    context: any;
  }>;
}

/**
 * Current conversation context passed to agents
 */
export interface ConversationContext {
  conversationId: string;
  userId: string;
  messages: Array<{
    role: string;
    content: string;
    agentId?: string;
  }>;
  metadata?: {
    [key: string]: any;
  };
}

/**
 * Interface for managing shared context between agents
 */
export interface SharedContextStore {
  /**
   * Get conversation-level data that persists across agents
   * @param conversationId - Unique conversation identifier
   * @returns Shared context data
   */
  getSharedContext(conversationId: string): Promise<SharedContext>;
  
  /**
   * Update shared context with new data
   * @param conversationId - Unique conversation identifier
   * @param updates - Partial updates to apply
   */
  updateSharedContext(conversationId: string, updates: Partial<SharedContext>): Promise<void>;
  
  /**
   * Get agent-specific state data
   * @param agentId - Agent identifier
   * @param conversationId - Conversation identifier
   * @returns Agent-specific state
   */
  getAgentState(agentId: string, conversationId: string): Promise<any>;
  
  /**
   * Save agent-specific state data
   * @param agentId - Agent identifier
   * @param conversationId - Conversation identifier
   * @param state - State data to save
   */
  saveAgentState(agentId: string, conversationId: string, state: any): Promise<void>;
  
  /**
   * Share data from one agent to another
   * @param fromAgent - Source agent ID
   * @param toAgent - Target agent ID
   * @param data - Data to share
   */
  shareData(fromAgent: string, toAgent: string, data: any): Promise<void>;
  
  /**
   * Get data shared with this agent from other agents
   * @param agentId - Agent requesting the data
   * @returns Shared data object
   */
  getSharedData(agentId: string): Promise<any>;
}

/**
 * Interface for persisting agent events and data to database
 */
export interface DatabasePersistence {
  /**
   * Save an agent event to the database
   * @param event - The event to save
   * @param conversationId - Conversation identifier
   */
  saveEvent(event: AgentEvent, conversationId: string): Promise<void>;
  
  /**
   * Save agent-specific data that should persist
   * @param conversationId - Conversation identifier
   * @param agentId - Agent identifier
   * @param dataType - Type of data being saved
   * @param data - The data to save
   * @param expiresAt - Optional expiration date
   */
  saveAgentData(
    conversationId: string,
    agentId: string,
    dataType: string,
    data: any,
    expiresAt?: Date
  ): Promise<void>;
  
  /**
   * Retrieve agent-specific data
   * @param conversationId - Conversation identifier
   * @param agentId - Agent identifier
   * @param dataType - Type of data to retrieve
   * @returns The saved data or null if not found
   */
  getAgentData(
    conversationId: string,
    agentId: string,
    dataType: string
  ): Promise<any>;
} 