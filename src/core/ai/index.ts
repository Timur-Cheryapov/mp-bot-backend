/**
 * Multi-Agent Streaming Architecture
 * 
 * This module provides a complete multi-agent system with streaming capabilities,
 * context sharing, and database persistence. It follows a plug-and-play architecture
 * where agents can be easily added, removed, or modified without affecting the core system.
 * 
 * Key Components:
 * - Agent Registry: Manages all available agents
 * - Streaming Manager: Orchestrates conversations and agent switching
 * - Context Store: Handles shared context between agents
 * - Database Persistence: Saves events and data
 * - Base Agent: Foundation for creating new agents
 * 
 * Usage Example:
 * ```typescript
 * import { createMultiAgentSystem } from './core/ai';
 * 
 * const system = await createMultiAgentSystem({
 *   supabase: supabaseClient,
 *   agents: [new ProductAgent(), new AnalyticsAgent()]
 * });
 * 
 * // Process a user message
 * for await (const event of system.processMessage('Create a new product', context)) {
 *   console.log(event);
 * }
 * ```
 */

// Core Types
export type {
  IAgent,
  AgentEvent,
  AgentState,
  AgentConfig,
  ConversationContext,
  SharedContext,
  SharedContextStore,
  DatabasePersistence,
  StreamingManager,
  ExecutionConfig,
  ToolConfig,
  WorkflowConfig
} from './multi-agent.types';

// Core Components
export { AgentRegistry } from './agent-registry';
export { BaseAgent } from './base-agent';
export { MultiAgentStreamingManager } from './multi-agent-streaming-manager';
export { InMemoryContextStore } from './shared-context-store';
export { SupabasePersistence } from '../../infrastructure/database/database-persistence';

// Sample Agents
export { ProductAgent } from './agents/product-agent';

// Utilities and Setup
import { AgentRegistry } from './agent-registry';
import { MultiAgentStreamingManager } from './multi-agent-streaming-manager';
import { InMemoryContextStore } from './shared-context-store';
import { SupabasePersistence } from '../../infrastructure/database/database-persistence';
import { IAgent, SharedContextStore, DatabasePersistence, ConversationContext } from './multi-agent.types';
import { SupabaseClient } from '@supabase/supabase-js';
import logger from '../../shared/utils/logger';

/**
 * Configuration options for creating a multi-agent system
 */
export interface MultiAgentSystemConfig {
  /** Supabase client for database persistence */
  supabase?: SupabaseClient;
  
  /** Array of agents to register in the system */
  agents?: IAgent[];
  
  /** Custom context store implementation (defaults to InMemoryContextStore) */
  contextStore?: SharedContextStore;
  
  /** Custom database persistence implementation (defaults to SupabasePersistence) */
  persistence?: DatabasePersistence;
  
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Complete multi-agent system instance
 */
export interface MultiAgentSystem {
  /** Agent registry for managing agents */
  registry: AgentRegistry;
  
  /** Streaming manager for processing conversations */
  streamingManager: MultiAgentStreamingManager;
  
  /** Context store for shared data */
  contextStore: SharedContextStore;
  
  /** Database persistence layer */
  persistence: DatabasePersistence;
  
  /** Register a new agent */
  registerAgent: (agent: IAgent) => void;
  
  /** Process a user message */
  processMessage: MultiAgentStreamingManager['processMessage'];
  
  /** Start a conversation */
  startConversation: MultiAgentStreamingManager['startConversation'];
  
  /** End a conversation */
  endConversation: MultiAgentStreamingManager['endConversation'];
  
  /** Get system statistics */
  getStats: () => {
    agentCount: number;
    registeredAgents: string[];
    contextStoreStats?: any;
  };
}

/**
 * Create and configure a complete multi-agent system
 * 
 * This is the main entry point for setting up the multi-agent architecture.
 * It creates all necessary components and wires them together.
 * 
 * @param config - Configuration options for the system
 * @returns Configured multi-agent system
 */
export async function createMultiAgentSystem(config: MultiAgentSystemConfig = {}): Promise<MultiAgentSystem> {
  const {
    supabase,
    agents = [],
    contextStore,
    persistence,
    debug = false
  } = config;
  
  if (debug) {
    logger.info('Creating multi-agent system', {
      agentCount: agents.length,
      hasSupabase: !!supabase,
      hasCustomContextStore: !!contextStore,
      hasCustomPersistence: !!persistence
    });
  }
  
  // Create core components
  const registry = new AgentRegistry();
  const store = contextStore || new InMemoryContextStore();
  const db = persistence || new SupabasePersistence(supabase);
  const streamingManager = new MultiAgentStreamingManager(registry, store, db);
  
  // Register provided agents
  for (const agent of agents) {
    registry.registerAgent(agent);
    if (debug) {
      logger.info(`Registered agent: ${agent.id} (${agent.name})`);
    }
  }
  
  // Create the system interface
  const system: MultiAgentSystem = {
    registry,
    streamingManager,
    contextStore: store,
    persistence: db,
    
    registerAgent: (agent: IAgent) => {
      registry.registerAgent(agent);
      if (debug) {
        logger.info(`Dynamically registered agent: ${agent.id}`);
      }
    },
    
    processMessage: streamingManager.processMessage.bind(streamingManager),
    startConversation: streamingManager.startConversation.bind(streamingManager),
    endConversation: streamingManager.endConversation.bind(streamingManager),
    
    getStats: () => {
      const stats = {
        agentCount: registry.getAgentCount(),
        registeredAgents: registry.listAgents().map(a => a.id),
        contextStoreStats: 'getStats' in store && typeof (store as any).getStats === 'function' 
          ? (store as any).getStats() 
          : undefined
      };
      
      if (debug) {
        logger.info('System stats requested', stats);
      }
      
      return stats;
    }
  };
  
  logger.info('Multi-agent system created successfully', {
    agentCount: registry.getAgentCount(),
    registeredAgents: agents.map(a => a.id)
  });
  
  return system;
}

/**
 * Quick setup function for common use cases
 * Creates a system with basic agents and Supabase persistence
 * 
 * @param supabase - Supabase client
 * @returns Configured system with default agents
 */
export async function createDefaultMultiAgentSystem(supabase: SupabaseClient): Promise<MultiAgentSystem> {
  // Import sample agents
  const { ProductAgent } = await import('./agents/product-agent');
  
  return createMultiAgentSystem({
    supabase,
    agents: [
      new ProductAgent()
      // Add more default agents here as they're created
    ],
    debug: process.env.NODE_ENV === 'development'
  });
}

/**
 * Utility function to validate agent implementations
 * Helps ensure agents conform to the required interface
 * 
 * @param agent - Agent to validate
 * @returns Validation result with any issues found
 */
export function validateAgent(agent: IAgent): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // Check required properties
  if (!agent.id || typeof agent.id !== 'string') {
    issues.push('Agent must have a valid string ID');
  }
  
  if (!agent.name || typeof agent.name !== 'string') {
    issues.push('Agent must have a valid string name');
  }
  
  if (!agent.description || typeof agent.description !== 'string') {
    issues.push('Agent must have a valid string description');
  }
  
  if (!Array.isArray(agent.intents) || agent.intents.length === 0) {
    issues.push('Agent must have at least one intent');
  }
  
  if (!Array.isArray(agent.tools)) {
    issues.push('Agent tools must be an array');
  }
  
  if (!agent.workflow) {
    issues.push('Agent must have a workflow');
  }
  
  // Check required methods
  if (typeof agent.initialize !== 'function') {
    issues.push('Agent must implement initialize method');
  }
  
  if (typeof agent.canHandle !== 'function') {
    issues.push('Agent must implement canHandle method');
  }
  
  if (typeof agent.execute !== 'function') {
    issues.push('Agent must implement execute method');
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Development utility to create a mock conversation context
 * Useful for testing agents in isolation
 * 
 * @param overrides - Properties to override in the mock context
 * @returns Mock conversation context
 */
export function createMockContext(overrides: Partial<ConversationContext> = {}): ConversationContext {
  return {
    conversationId: 'mock-conversation-id',
    userId: 'mock-user-id',
    messages: [],
    metadata: {},
    ...overrides
  };
} 