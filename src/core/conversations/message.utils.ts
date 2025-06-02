import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
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
): any[] {
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