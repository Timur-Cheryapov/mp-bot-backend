import { AIMessage, HumanMessage, SystemMessage, ToolMessage, BaseMessage } from '@langchain/core/messages';
import { BasicMessage } from '../../shared/types/message.types';

export interface SaveMessageOptions {
  conversationId: string;
  content: string;
  role: 'user' | 'assistant' | 'tool';
  metadata?: Record<string, any>;
  status?: 'pending' | 'success' | 'error';
  toolCalls?: any[];
  toolCallId?: string;
  toolName?: string;
}

export function convertToLangChainMessages(
  systemPrompt: string,
  messages: BasicMessage[]
): BaseMessage[] {
  return [
    new SystemMessage(systemPrompt),
    ...messages.map(msg => {
      if (msg.role === 'user') return new HumanMessage(msg.content);
      if (msg.role === 'assistant') return new AIMessage({content: msg.content, tool_calls: msg.tool_calls});
      if (msg.role === 'tool') { 
        return new ToolMessage(msg.content, msg.tool_call_id || 'unknown', msg.tool_name || 'unknown'); 
      }
      return new SystemMessage(msg.content);
    })
  ];
}

/**
 * Determines if a tool message content indicates an error based on content analysis
 */
export function determineToolMessageStatus(content: string): 'success' | 'error' {
  try {
    const result = JSON.parse(content);
    return result.success ? 'success' : 'error';
  } catch (e) {
    // If JSON parsing fails, check if it's an error
    const isError = content.toLowerCase().includes('error') || 
                           content.includes('did not match expected schema') ||
                           content.includes('validation') ||
                           content.includes('failed') ||
                           content.includes('invalid');
    
    return isError ? 'error' : 'success';
  }
}

export async function saveMessage(options: SaveMessageOptions): Promise<void> {
  const { createMessage } = await import('../../infrastructure/database/database.service');
  await createMessage(
    options.conversationId,
    options.content,
    options.role,
    options.metadata,
    options.status || 'success',
    options.toolCalls,
    options.toolCallId,
    options.toolName
  );
} 