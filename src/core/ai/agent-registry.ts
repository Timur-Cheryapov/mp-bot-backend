import { IAgent, ConversationContext } from './multi-agent.types';
import logger from '../../shared/utils/logger';

/**
 * Central registry for managing all available agents in the system.
 * Provides agent discovery, registration, and routing capabilities.
 * 
 * The registry acts as a service locator pattern, allowing the system
 * to dynamically find the appropriate agent for a given task.
 */
export class AgentRegistry {
  /** Map of agent ID to agent instance for fast lookup */
  private agents: Map<string, IAgent> = new Map();
  
  /**
   * Register a new agent in the system
   * @param agent - The agent instance to register
   * @throws Error if agent with same ID already exists
   */
  registerAgent(agent: IAgent): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent with ID '${agent.id}' is already registered`);
    }
    
    this.agents.set(agent.id, agent);
    logger.info(`Registered agent: ${agent.id} (${agent.name})`);
  }
  
  /**
   * Unregister an agent from the system
   * @param agentId - ID of the agent to remove
   * @returns true if agent was removed, false if not found
   */
  unregisterAgent(agentId: string): boolean {
    const removed = this.agents.delete(agentId);
    if (removed) {
      logger.info(`Unregistered agent: ${agentId}`);
    }
    return removed;
  }
  
  /**
   * Get a specific agent by its ID
   * @param agentId - The unique identifier of the agent
   * @returns The agent instance or undefined if not found
   */
  getAgent(agentId: string): IAgent | undefined {
    return this.agents.get(agentId);
  }
  
  /**
   * Find the best agent to handle a specific intent.
   * Uses the agent's canHandle method to determine compatibility.
   * 
   * @param intent - The classified intent from user input
   * @param context - Current conversation context for additional decision making
   * @returns The best matching agent or null if none can handle the intent
   */
  findAgentForIntent(intent: string, context: ConversationContext): IAgent | null {
    // First pass: Find agents that can handle this intent
    const capableAgents: IAgent[] = [];
    
    for (const agent of this.agents.values()) {
      if (agent.canHandle(intent, context)) {
        capableAgents.push(agent);
      }
    }
    
    if (capableAgents.length === 0) {
      logger.warn(`No agent found for intent: ${intent}`);
      return null;
    }
    
    if (capableAgents.length === 1) {
      return capableAgents[0];
    }
    
    // Multiple agents can handle this intent - use priority/specificity
    // For now, return the first one. In the future, this could use
    // more sophisticated routing like confidence scores or user preferences
    logger.info(`Multiple agents can handle intent '${intent}', selecting: ${capableAgents[0].id}`);
    return capableAgents[0];
  }
  
  /**
   * Get all registered agents
   * @returns Array of all agent instances
   */
  listAgents(): IAgent[] {
    return Array.from(this.agents.values());
  }
  
  /**
   * Get agents that can handle specific intents
   * @param intents - Array of intent keywords to match
   * @returns Array of agents that can handle any of the given intents
   */
  getAgentsForIntents(intents: string[]): IAgent[] {
    const matchingAgents: IAgent[] = [];
    
    for (const agent of this.agents.values()) {
      const hasMatchingIntent = intents.some(intent => 
        agent.intents.some(agentIntent => 
          agentIntent.toLowerCase().includes(intent.toLowerCase()) ||
          intent.toLowerCase().includes(agentIntent.toLowerCase())
        )
      );
      
      if (hasMatchingIntent) {
        matchingAgents.push(agent);
      }
    }
    
    return matchingAgents;
  }
  
  /**
   * Get summary information about all registered agents
   * @returns Array of agent metadata for display/debugging
   */
  getAgentSummaries(): Array<{
    id: string;
    name: string;
    description: string;
    intents: string[];
    toolCount: number;
  }> {
    return Array.from(this.agents.values()).map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      intents: agent.intents,
      toolCount: agent.tools.length
    }));
  }
  
  /**
   * Check if a specific agent is registered
   * @param agentId - ID of the agent to check
   * @returns true if agent exists in registry
   */
  hasAgent(agentId: string): boolean {
    return this.agents.has(agentId);
  }
  
  /**
   * Get the total number of registered agents
   * @returns Count of agents in the registry
   */
  getAgentCount(): number {
    return this.agents.size;
  }
  
  /**
   * Clear all registered agents (useful for testing)
   */
  clear(): void {
    const count = this.agents.size;
    this.agents.clear();
    logger.info(`Cleared ${count} agents from registry`);
  }
} 