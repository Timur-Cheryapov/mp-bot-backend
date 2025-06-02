import { 
  StreamingManager, 
  AgentEvent, 
  ConversationContext, 
  IAgent, 
  SharedContextStore, 
  DatabasePersistence 
} from './multi-agent.types';
import { AgentRegistry } from './agent-registry';
import logger from '../../shared/utils/logger';

/**
 * Core orchestrator for multi-agent streaming conversations.
 * 
 * This class manages the flow of conversation between multiple agents,
 * handling agent switching, context sharing, and event streaming.
 * 
 * Key responsibilities:
 * - Route messages to appropriate agents
 * - Manage agent transitions seamlessly
 * - Stream events to clients in real-time
 * - Persist conversation state and events
 * - Maintain shared context between agents
 */
export class MultiAgentStreamingManager implements StreamingManager {
  /** Currently active agent for the conversation */
  private currentAgent: IAgent | null = null;
  
  /** Registry of all available agents */
  private registry: AgentRegistry;
  
  /** Store for shared context between agents */
  private contextStore: SharedContextStore;
  
  /** Database persistence layer */
  private dbPersistence: DatabasePersistence;
  
  /** Current conversation ID being processed */
  private currentConversationId: string | null = null;
  
  constructor(
    registry: AgentRegistry,
    contextStore: SharedContextStore,
    dbPersistence: DatabasePersistence
  ) {
    this.registry = registry;
    this.contextStore = contextStore;
    this.dbPersistence = dbPersistence;
    
    logger.info('Multi-agent streaming manager initialized', {
      agentCount: registry.getAgentCount()
    });
  }
  
  /**
   * Start a new conversation session
   * @param conversationId - Unique conversation identifier
   * @yields AgentEvent - Stream of initialization events
   */
  async *startConversation(conversationId: string): AsyncIterable<AgentEvent> {
    this.currentConversationId = conversationId;
    this.currentAgent = null;
    
    logger.info(`Starting conversation ${conversationId}`, {
      conversationId,
      availableAgents: this.registry.getAgentCount()
    });
    
    // Initialize shared context for this conversation
    await this.contextStore.getSharedContext(conversationId);
    
    // No specific agent events for conversation start
    // Agents will be activated when first message is processed
  }
  
  /**
   * Process a user message and determine which agent should handle it
   * @param message - User's message content
   * @param context - Current conversation context
   * @yields AgentEvent - Stream of processing events
   */
  async *processMessage(
    message: string, 
    context: ConversationContext
  ): AsyncIterable<AgentEvent> {
    this.currentConversationId = context.conversationId;
    
    try {
      logger.info(`Processing message in conversation ${context.conversationId}`, {
        conversationId: context.conversationId,
        messageLength: message.length,
        currentAgent: this.currentAgent?.id
      });
      
      // Classify intent and determine target agent
      const intent = await this.classifyIntent(message, context);
      const targetAgent = this.registry.findAgentForIntent(intent, context);
      
      if (!targetAgent) {
        yield {
          type: 'error',
          error: 'No suitable agent found for this request. Please try rephrasing your message.',
          agentId: 'router'
        };
        return;
      }
      
      // Switch agent if needed
      if (this.currentAgent?.id !== targetAgent.id) {
        yield* this.handleAgentSwitch(targetAgent, 'intent_change');
      }
      
      // Execute with the selected agent
      yield* this.executeWithAgent(targetAgent, message, context);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error(`Error processing message: ${errorMessage}`, {
        conversationId: context.conversationId,
        error: errorMessage,
        currentAgent: this.currentAgent?.id
      });
      
      yield { 
        type: 'error', 
        error: errorMessage, 
        agentId: this.currentAgent?.id || 'system' 
      };
    }
  }
  
  /**
   * Manually switch to a different agent
   * @param newAgentId - ID of the agent to switch to
   * @param reason - Reason for the switch
   */
  async switchAgent(newAgentId: string, reason: string): Promise<void> {
    const newAgent = this.registry.getAgent(newAgentId);
    
    if (!newAgent) {
      throw new Error(`Agent '${newAgentId}' not found in registry`);
    }
    
    logger.info(`Manual agent switch requested`, {
      fromAgent: this.currentAgent?.id || 'none',
      toAgent: newAgentId,
      reason
    });
    
    // Note: This doesn't yield events since it's not async iterable
    // The actual switch will happen on next message processing
    this.currentAgent = newAgent;
  }
  
  /**
   * End the current conversation session
   */
  async endConversation(): Promise<void> {
    if (this.currentConversationId) {
      logger.info(`Ending conversation ${this.currentConversationId}`, {
        conversationId: this.currentConversationId,
        finalAgent: this.currentAgent?.id
      });
      
      // Save final agent state if any
      if (this.currentAgent && this.currentConversationId) {
        await this.contextStore.saveAgentState(
          this.currentAgent.id,
          this.currentConversationId,
          await this.getCurrentAgentState()
        );
      }
      
      // Update shared context with conversation end
      await this.contextStore.updateSharedContext(this.currentConversationId, {
        agentHistory: [{
          agentId: 'system',
          timestamp: new Date().toISOString(),
          context: { action: 'conversation_ended' }
        }]
      });
    }
    
    this.currentAgent = null;
    this.currentConversationId = null;
  }
  
  /**
   * Handle switching from one agent to another
   * @param newAgent - The agent to switch to
   * @param reason - Reason for the switch
   * @yields AgentEvent - Events related to agent switching
   */
  private async *handleAgentSwitch(
    newAgent: IAgent, 
    reason: string
  ): AsyncIterable<AgentEvent> {
    const previousAgent = this.currentAgent?.id || 'none';
    
    logger.info(`Switching agents`, {
      fromAgent: previousAgent,
      toAgent: newAgent.id,
      reason,
      conversationId: this.currentConversationId
    });
    
    // Notify about agent switch
    yield {
      type: 'agent_switch',
      fromAgent: previousAgent,
      toAgent: newAgent.id,
      reason
    };
    
    // Save current agent state if switching from an existing agent
    if (this.currentAgent && this.currentConversationId) {
      const currentState = await this.getCurrentAgentState();
      await this.contextStore.saveAgentState(
        this.currentAgent.id, 
        this.currentConversationId,
        currentState
      );
      
      // Add to agent history
      await this.contextStore.updateSharedContext(this.currentConversationId, {
        agentHistory: [{
          agentId: this.currentAgent.id,
          timestamp: new Date().toISOString(),
          context: { action: 'agent_switched_out', reason, state: currentState }
        }]
      });
    }
    
    // Switch to new agent
    this.currentAgent = newAgent;
    
    // Initialize new agent if needed
    if (this.currentConversationId) {
      // For now, we'll use a dummy user ID and config
      // In a real implementation, this would come from the conversation context
      const dummyConfig = {
        id: newAgent.id,
        name: newAgent.name,
        description: newAgent.description,
        version: '1.0.0',
        intents: newAgent.intents,
        priority: 1,
        enabled: true,
        tools: [],
        workflow: { type: 'default', config: {} }
      };
      
      await newAgent.initialize('dummy-user', dummyConfig);
    }
    
    // Notify about agent start
    yield {
      type: 'agent_start',
      agentId: newAgent.id,
      agentName: newAgent.name
    };
    
    // Add to agent history
    if (this.currentConversationId) {
      await this.contextStore.updateSharedContext(this.currentConversationId, {
        agentHistory: [{
          agentId: newAgent.id,
          timestamp: new Date().toISOString(),
          context: { action: 'agent_switched_in', reason }
        }]
      });
    }
  }
  
  /**
   * Execute a message with a specific agent
   * @param agent - The agent to execute with
   * @param message - User's message
   * @param context - Conversation context
   * @yields AgentEvent - Events from agent execution
   */
  private async *executeWithAgent(
    agent: IAgent,
    message: string,
    context: ConversationContext
  ): AsyncIterable<AgentEvent> {
    logger.info(`Executing with agent ${agent.id}`, {
      agentId: agent.id,
      agentName: agent.name,
      conversationId: context.conversationId,
      messageLength: message.length
    });
    
    // Get shared context and agent-specific state
    const sharedContext = await this.contextStore.getSharedContext(context.conversationId);
    const agentState = await this.contextStore.getAgentState(agent.id, context.conversationId);
    
    // Prepare execution state
    const executionState = {
      messages: [...context.messages.map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'tool' | 'system',
        content: msg.content,
        tool_calls: undefined,
        tool_call_id: undefined
      })), { 
        role: 'user' as const, 
        content: message 
      }],
      sharedContext,
      agentState,
      conversationId: context.conversationId,
      userId: context.userId
    };
    
    // Stream agent execution
    try {
      for await (const event of agent.execute(executionState, { stream: true })) {
        // Persist events to database
        await this.dbPersistence.saveEvent(event, context.conversationId);
        
        // Log significant events
        if (event.type === 'tool_execution') {
          logger.debug(`Agent ${agent.id} executing tool: ${event.toolName}`, {
            agentId: agent.id,
            toolName: event.toolName
          });
        }
        
        // Forward to client
        yield event;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Agent execution failed';
      logger.error(`Agent execution error: ${errorMessage}`, {
        agentId: agent.id,
        error: errorMessage,
        conversationId: context.conversationId
      });
      
      yield {
        type: 'error',
        error: errorMessage,
        agentId: agent.id
      };
    }
  }
  
  /**
   * Classify the intent of a user message
   * @param message - The user's message
   * @param context - Conversation context
   * @returns Classified intent
   */
  private async classifyIntent(message: string, context: ConversationContext): Promise<string> {
    // Simple keyword-based intent classification
    // In a real implementation, this would use ML/NLP models
    
    const lowercaseMessage = message.toLowerCase();
    
    // Product-related intents
    if (lowercaseMessage.includes('product') || 
        lowercaseMessage.includes('listing') || 
        lowercaseMessage.includes('create') ||
        lowercaseMessage.includes('publish') ||
        lowercaseMessage.includes('wildberries')) {
      return 'product_management';
    }
    
    // Analytics-related intents
    if (lowercaseMessage.includes('analytics') || 
        lowercaseMessage.includes('report') || 
        lowercaseMessage.includes('statistics') ||
        lowercaseMessage.includes('data') ||
        lowercaseMessage.includes('performance')) {
      return 'analytics';
    }
    
    // Pricing-related intents
    if (lowercaseMessage.includes('price') || 
        lowercaseMessage.includes('cost') || 
        lowercaseMessage.includes('pricing') ||
        lowercaseMessage.includes('competitor')) {
      return 'pricing';
    }
    
    // Default to general assistance
    logger.debug(`No specific intent classified for message: "${message}"`, {
      message: message.substring(0, 100),
      fallbackIntent: 'general'
    });
    
    return 'general';
  }
  
  /**
   * Get the current agent's state for persistence
   * @returns Current agent state object
   */
  private async getCurrentAgentState(): Promise<any> {
    // This would typically extract state from the current agent
    // For now, return empty state
    return {};
  }
  
  /**
   * Get current conversation statistics
   * @returns Object with conversation stats
   */
  getConversationStats(): {
    conversationId: string | null;
    currentAgent: string | null;
    agentCount: number;
    contextStoreStats: any;
  } {
    return {
      conversationId: this.currentConversationId,
      currentAgent: this.currentAgent?.id || null,
      agentCount: this.registry.getAgentCount(),
      contextStoreStats: 'contextStore' in this.contextStore && 
                         typeof (this.contextStore as any).getStats === 'function' 
                         ? (this.contextStore as any).getStats() 
                         : {}
    };
  }
} 