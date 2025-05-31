import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { ToolCall } from '@langchain/core/dist/messages/tool';

export interface BasicMessage {
  role: string;
  content: string;
  tool_call_id?: string;
  tool_name?: string;
  tool_calls?: ToolCall[];
}

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

export function generateSystemPromptWithWildberriesTools(basePrompt: string): string {
  return `${basePrompt}

You have access to Wildberries marketplace tools. When users ask about their marketplace business:

1. **Use tools proactively** when users mention products, inventory, or marketplace data
2. **Explain what you're doing** - tell users what tools you're going to call
3. **Present data clearly** - format product information in readable tables or lists
4. **Provide insights** - don't just show raw data, analyze trends and suggest improvements
5. **Handle errors gracefully** - if tool calls fail:
   - Check if the tool response contains a "userMessage" field and use that for user communication
   - If no userMessage, explain the technical error in user-friendly terms
   - Always offer next steps or solutions
   - Never show raw error objects to users

6. **User-friendly error handling**:
   - API key missing: Guide them to add their Wildberries API key
   - Permission errors: Explain they need Content category access
   - Rate limits: Suggest waiting and trying again
   - Network errors: Suggest trying again later

Focus on being helpful for marketplace sellers and provide actionable business insights even when data isn't available.`;
}

export async function saveMessage(options: SaveMessageOptions): Promise<void> {
  const { createMessage } = await import('../services/database');
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