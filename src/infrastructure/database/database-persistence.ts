import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DatabasePersistence, AgentEvent } from '../../core/ai/multi-agent.types';
import logger from '../../shared/utils/logger';

/**
 * Supabase-based implementation of DatabasePersistence.
 * 
 * This class handles persistence of agent events, messages, and data
 * to a Supabase database. It provides methods for saving streaming events
 * and retrieving agent-specific data.
 * 
 * Key features:
 * - Event streaming persistence
 * - Agent interaction tracking
 * - Message accumulation and storage
 * - Data expiration handling
 */
export class SupabasePersistence implements DatabasePersistence {
  private supabase: SupabaseClient;
  
  /** Buffer for accumulating content chunks before saving complete messages */
  private messageBuffer: Map<string, {
    agentId: string;
    content: string;
    timestamp: Date;
  }> = new Map();
  
  /** Timeout for flushing message buffers (2 seconds) */
  private readonly MESSAGE_FLUSH_TIMEOUT = 2000;
  
  constructor(supabase?: SupabaseClient) {
    if (supabase) {
      this.supabase = supabase;
    } else {
      // Create default client from environment
      this.supabase = createClient(
        process.env.SUPABASE_URL || '',
        process.env.SUPABASE_ANON_KEY || ''
      );
    }
    
    logger.info('Database persistence initialized with Supabase');
  }
  
  /**
   * Save an agent event to the database
   * @param event - The event to save
   * @param conversationId - Conversation identifier
   */
  async saveEvent(event: AgentEvent, conversationId: string): Promise<void> {
    try {
      switch (event.type) {
        case 'content_chunk':
          await this.accumulateMessage(event, conversationId);
          break;
          
        case 'agent_start':
        case 'agent_switch':
        case 'agent_complete':
          await this.saveAgentInteraction(event, conversationId);
          break;
          
        case 'tool_execution':
          await this.saveToolExecution(event, conversationId);
          break;
          
        case 'tool_result':
          await this.saveToolResult(event, conversationId);
          break;
          
        case 'error':
          await this.saveError(event, conversationId);
          break;
          
        case 'conversation_end':
          await this.saveConversationEnd(conversationId);
          break;
      }
    } catch (error) {
      logger.error('Failed to save event to database', {
        eventType: event.type,
        conversationId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Save agent-specific data that should persist
   * @param conversationId - Conversation identifier
   * @param agentId - Agent identifier
   * @param dataType - Type of data being saved
   * @param data - The data to save
   * @param expiresAt - Optional expiration date
   */
  async saveAgentData(
    conversationId: string,
    agentId: string,
    dataType: string,
    data: any,
    expiresAt?: Date
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('agent_conversation_data')
        .upsert({
          conversation_id: conversationId,
          agent_id: agentId,
          data_type: dataType,
          data,
          expires_at: expiresAt?.toISOString(),
          updated_at: new Date().toISOString()
        });
        
      if (error) {
        throw new Error(`Database upsert failed: ${error.message}`);
      }
      
      logger.debug('Saved agent data to database', {
        conversationId,
        agentId,
        dataType,
        hasExpiration: !!expiresAt
      });
      
    } catch (error) {
      logger.error('Failed to save agent data', {
        conversationId,
        agentId,
        dataType,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Retrieve agent-specific data
   * @param conversationId - Conversation identifier
   * @param agentId - Agent identifier
   * @param dataType - Type of data to retrieve
   * @returns The saved data or null if not found
   */
  async getAgentData(
    conversationId: string,
    agentId: string,
    dataType: string
  ): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .from('agent_conversation_data')
        .select('data')
        .eq('conversation_id', conversationId)
        .eq('agent_id', agentId)
        .eq('data_type', dataType)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`) // Only non-expired data
        .single();
        
      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found
          return null;
        }
        throw new Error(`Database query failed: ${error.message}`);
      }
      
      logger.debug('Retrieved agent data from database', {
        conversationId,
        agentId,
        dataType,
        hasData: !!data?.data
      });
      
      return data?.data || null;
      
    } catch (error) {
      logger.error('Failed to get agent data', {
        conversationId,
        agentId,
        dataType,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
  
  /**
   * Accumulate content chunks and save complete messages
   * @param event - Content chunk event
   * @param conversationId - Conversation identifier
   */
  private async accumulateMessage(event: AgentEvent & { type: 'content_chunk' }, conversationId: string): Promise<void> {
    const bufferId = `${conversationId}:${event.agentId}`;
    
    // Get or create buffer entry
    const existing = this.messageBuffer.get(bufferId);
    if (existing) {
      existing.content += event.content;
      existing.timestamp = new Date();
    } else {
      this.messageBuffer.set(bufferId, {
        agentId: event.agentId,
        content: event.content,
        timestamp: new Date()
      });
      
      // Set timeout to flush this buffer
      setTimeout(() => {
        this.flushMessageBuffer(bufferId, conversationId);
      }, this.MESSAGE_FLUSH_TIMEOUT);
    }
  }
  
  /**
   * Flush accumulated message content to database
   * @param bufferId - Buffer identifier
   * @param conversationId - Conversation identifier
   */
  private async flushMessageBuffer(bufferId: string, conversationId: string): Promise<void> {
    const buffer = this.messageBuffer.get(bufferId);
    if (!buffer) return;
    
    try {
      const { error } = await this.supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          agent_id: buffer.agentId,
          role: 'assistant',
          content: buffer.content,
          metadata: { type: 'agent_response' }
        });
        
      if (error) {
        throw new Error(`Message insert failed: ${error.message}`);
      }
      
      // Remove from buffer
      this.messageBuffer.delete(bufferId);
      
      logger.debug('Flushed message buffer to database', {
        conversationId,
        agentId: buffer.agentId,
        contentLength: buffer.content.length
      });
      
    } catch (error) {
      logger.error('Failed to flush message buffer', {
        bufferId,
        conversationId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Save agent interaction events
   * @param event - Agent interaction event
   * @param conversationId - Conversation identifier
   */
  private async saveAgentInteraction(
    event: AgentEvent & { type: 'agent_start' | 'agent_switch' | 'agent_complete' }, 
    conversationId: string
  ): Promise<void> {
    let actionType: string;
    let fromAgent: string | null = null;
    let reason: string | null = null;
    let stateSnapshot: any = null;
    let agentId: string;
    
    switch (event.type) {
      case 'agent_start':
        actionType = 'start';
        agentId = (event as any).agentId;
        break;
      case 'agent_switch':
        actionType = 'switch';
        agentId = (event as any).toAgent;
        fromAgent = (event as any).fromAgent;
        reason = (event as any).reason;
        break;
      case 'agent_complete':
        actionType = 'complete';
        agentId = (event as any).agentId;
        stateSnapshot = (event as any).finalState;
        break;
    }
    
    const { error } = await this.supabase
      .from('agent_interactions')
      .insert({
        conversation_id: conversationId,
        agent_id: agentId,
        action_type: actionType,
        from_agent: fromAgent,
        reason,
        state_snapshot: stateSnapshot
      });
      
    if (error) {
      throw new Error(`Agent interaction insert failed: ${error.message}`);
    }
    
    logger.debug('Saved agent interaction', {
      conversationId,
      agentId,
      actionType
    });
  }
  
  /**
   * Save tool execution events
   * @param event - Tool execution event
   * @param conversationId - Conversation identifier
   */
  private async saveToolExecution(
    event: AgentEvent & { type: 'tool_execution' }, 
    conversationId: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        agent_id: event.agentId,
        role: 'tool',
        content: `Executing tool: ${event.toolName}`,
        tool_name: event.toolName,
        metadata: { type: 'tool_execution' }
      });
      
    if (error) {
      throw new Error(`Tool execution insert failed: ${error.message}`);
    }
  }
  
  /**
   * Save tool result events
   * @param event - Tool result event
   * @param conversationId - Conversation identifier
   */
  private async saveToolResult(
    event: AgentEvent & { type: 'tool_result' }, 
    conversationId: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        agent_id: event.agentId,
        role: 'tool',
        content: JSON.stringify(event.result),
        tool_name: event.toolName,
        metadata: { 
          type: 'tool_result',
          result: event.result 
        }
      });
      
    if (error) {
      throw new Error(`Tool result insert failed: ${error.message}`);
    }
  }
  
  /**
   * Save error events
   * @param event - Error event
   * @param conversationId - Conversation identifier
   */
  private async saveError(
    event: AgentEvent & { type: 'error' }, 
    conversationId: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        agent_id: event.agentId,
        role: 'system',
        content: `Error: ${event.error}`,
        metadata: { 
          type: 'error',
          error: event.error 
        }
      });
      
    if (error) {
      throw new Error(`Error message insert failed: ${error.message}`);
    }
  }
  
  /**
   * Save conversation end event
   * @param conversationId - Conversation identifier
   */
  private async saveConversationEnd(conversationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('agent_interactions')
      .insert({
        conversation_id: conversationId,
        agent_id: 'system',
        action_type: 'conversation_end'
      });
      
    if (error) {
      throw new Error(`Conversation end insert failed: ${error.message}`);
    }
  }
  
  /**
   * Clean up expired agent data
   * This should be called periodically to remove expired data
   */
  async cleanupExpiredData(): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('agent_conversation_data')
        .delete()
        .lt('expires_at', new Date().toISOString());
        
      if (error) {
        throw new Error(`Cleanup failed: ${error.message}`);
      }
      
      logger.info('Cleaned up expired agent data');
      
    } catch (error) {
      logger.error('Failed to cleanup expired data', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
} 