import { SharedContextStore, SharedContext } from './multi-agent.types';
import logger from '../../shared/utils/logger';

/**
 * In-memory implementation of SharedContextStore.
 * 
 * This implementation stores shared context and agent state in memory.
 * For production use, this should be replaced with a Redis-based implementation
 * to support distributed systems and persistence across server restarts.
 * 
 * Key features:
 * - Conversation-level context sharing
 * - Agent-specific state isolation
 * - Cross-agent data sharing
 * - Automatic cleanup and expiration
 */
export class InMemoryContextStore implements SharedContextStore {
  /** Map of conversationId to shared context */
  private sharedContexts: Map<string, SharedContext> = new Map();
  
  /** Map of "agentId:conversationId" to agent state */
  private agentStates: Map<string, any> = new Map();
  
  /** Map of "fromAgent:toAgent" to shared data */
  private sharedData: Map<string, any> = new Map();
  
  /** Map to track expiration times for data cleanup */
  private expirationTimes: Map<string, number> = new Map();
  
  /** Cleanup interval in milliseconds (5 minutes) */
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000;
  
  /** Default expiration time for shared data (1 hour) */
  private readonly DEFAULT_EXPIRATION = 60 * 60 * 1000;
  
  constructor() {
    // Start cleanup interval
    this.startCleanupInterval();
  }
  
  /**
   * Get conversation-level data that persists across agents
   * @param conversationId - Unique conversation identifier
   * @returns Shared context data
   */
  async getSharedContext(conversationId: string): Promise<SharedContext> {
    const existing = this.sharedContexts.get(conversationId);
    
    if (existing) {
      logger.debug(`Retrieved shared context for conversation ${conversationId}`, {
        conversationId,
        agentHistoryLength: existing.agentHistory.length
      });
      return existing;
    }
    
    // Create new empty context
    const newContext = this.createEmptyContext(conversationId);
    this.sharedContexts.set(conversationId, newContext);
    
    logger.debug(`Created new shared context for conversation ${conversationId}`, {
      conversationId
    });
    
    return newContext;
  }
  
  /**
   * Update shared context with new data
   * @param conversationId - Unique conversation identifier
   * @param updates - Partial updates to apply
   */
  async updateSharedContext(conversationId: string, updates: Partial<SharedContext>): Promise<void> {
    const current = await this.getSharedContext(conversationId);
    
    // Merge updates with current context
    const updated = {
      ...current,
      ...updates,
      // Ensure sessionData is properly merged
      sessionData: {
        ...current.sessionData,
        ...(updates.sessionData || {})
      },
      // Ensure agentHistory is properly merged (append new entries)
      agentHistory: updates.agentHistory 
        ? [...current.agentHistory, ...updates.agentHistory]
        : current.agentHistory
    };
    
    this.sharedContexts.set(conversationId, updated);
    
    logger.debug(`Updated shared context for conversation ${conversationId}`, {
      conversationId,
      updatedFields: Object.keys(updates)
    });
  }
  
  /**
   * Get agent-specific state data
   * @param agentId - Agent identifier
   * @param conversationId - Conversation identifier
   * @returns Agent-specific state
   */
  async getAgentState(agentId: string, conversationId: string): Promise<any> {
    const key = this.createAgentStateKey(agentId, conversationId);
    const state = this.agentStates.get(key);
    
    logger.debug(`Retrieved agent state for ${agentId} in conversation ${conversationId}`, {
      agentId,
      conversationId,
      hasState: !!state
    });
    
    return state || {};
  }
  
  /**
   * Save agent-specific state data
   * @param agentId - Agent identifier
   * @param conversationId - Conversation identifier
   * @param state - State data to save
   */
  async saveAgentState(agentId: string, conversationId: string, state: any): Promise<void> {
    const key = this.createAgentStateKey(agentId, conversationId);
    this.agentStates.set(key, state);
    
    // Set expiration for cleanup
    this.expirationTimes.set(key, Date.now() + this.DEFAULT_EXPIRATION);
    
    logger.debug(`Saved agent state for ${agentId} in conversation ${conversationId}`, {
      agentId,
      conversationId,
      stateKeys: typeof state === 'object' ? Object.keys(state) : []
    });
  }
  
  /**
   * Share data from one agent to another
   * @param fromAgent - Source agent ID
   * @param toAgent - Target agent ID
   * @param data - Data to share
   */
  async shareData(fromAgent: string, toAgent: string, data: any): Promise<void> {
    const key = this.createSharedDataKey(fromAgent, toAgent);
    this.sharedData.set(key, data);
    
    // Set expiration for cleanup (shorter for shared data)
    this.expirationTimes.set(key, Date.now() + (this.DEFAULT_EXPIRATION / 2));
    
    logger.debug(`Agent ${fromAgent} shared data with ${toAgent}`, {
      fromAgent,
      toAgent,
      dataKeys: typeof data === 'object' ? Object.keys(data) : []
    });
  }
  
  /**
   * Get data shared with this agent from other agents
   * @param agentId - Agent requesting the data
   * @returns Shared data object
   */
  async getSharedData(agentId: string): Promise<any> {
    const sharedWithAgent: any = {};
    
    // Find all data shared with this agent
    for (const [key, data] of this.sharedData.entries()) {
      if (key.endsWith(`:${agentId}`)) {
        const fromAgent = key.split(':')[0];
        sharedWithAgent[fromAgent] = data;
      }
    }
    
    logger.debug(`Retrieved shared data for agent ${agentId}`, {
      agentId,
      sourceAgents: Object.keys(sharedWithAgent)
    });
    
    return sharedWithAgent;
  }
  
  /**
   * Create empty context for a new conversation
   * @param conversationId - The conversation ID
   * @returns Empty SharedContext
   */
  private createEmptyContext(conversationId: string): SharedContext {
    return {
      conversationId,
      userId: '', // Will be set when first message is processed
      sessionData: {},
      agentHistory: []
    };
  }
  
  /**
   * Create a key for storing agent state
   * @param agentId - Agent identifier
   * @param conversationId - Conversation identifier
   * @returns Storage key
   */
  private createAgentStateKey(agentId: string, conversationId: string): string {
    return `${agentId}:${conversationId}`;
  }
  
  /**
   * Create a key for storing shared data
   * @param fromAgent - Source agent ID
   * @param toAgent - Target agent ID
   * @returns Storage key
   */
  private createSharedDataKey(fromAgent: string, toAgent: string): string {
    return `${fromAgent}:${toAgent}`;
  }
  
  /**
   * Start the cleanup interval to remove expired data
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      this.performCleanup();
    }, this.CLEANUP_INTERVAL);
    
    logger.debug('Started context store cleanup interval', {
      intervalMs: this.CLEANUP_INTERVAL
    });
  }
  
  /**
   * Remove expired data from all maps
   */
  private performCleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    // Check for expired items
    for (const [key, expirationTime] of this.expirationTimes.entries()) {
      if (now > expirationTime) {
        // Remove from all possible maps
        this.agentStates.delete(key);
        this.sharedData.delete(key);
        this.expirationTimes.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.debug(`Cleaned up ${cleanedCount} expired context items`, {
        cleanedCount,
        remainingItems: this.expirationTimes.size
      });
    }
  }
  
  /**
   * Clear all data (useful for testing)
   */
  clear(): void {
    this.sharedContexts.clear();
    this.agentStates.clear();
    this.sharedData.clear();
    this.expirationTimes.clear();
    
    logger.debug('Cleared all context store data');
  }
  
  /**
   * Get statistics about the context store
   * @returns Object with store statistics
   */
  getStats(): {
    sharedContexts: number;
    agentStates: number;
    sharedData: number;
    pendingExpirations: number;
  } {
    return {
      sharedContexts: this.sharedContexts.size,
      agentStates: this.agentStates.size,
      sharedData: this.sharedData.size,
      pendingExpirations: this.expirationTimes.size
    };
  }
} 