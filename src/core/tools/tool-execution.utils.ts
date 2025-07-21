import { ToolMessage } from '@langchain/core/messages';
import { ToolCall } from '@langchain/core/dist/messages/tool';
import { createWildberriesProductCardTool, getWildberriesSellerProductCardsTool, getWildberriesSubjectIdTool, wildberriesToolsMessages } from './product/listing-tools';
import logger from '../../shared/utils/logger';

export interface ToolExecutionResult {
  toolMessage: ToolMessage;
  status: 'success' | 'error';
  userFriendlyMessage: string;
  toolName: string;
}

export const LISTING_TOOLS_NAME = 'listing_tools';

export function createToolsMap(userId?: string): Record<string, any> {
  const toolsByName: Record<string, any> = {};
  
  if (userId) {
    try {
      const listingTools = [
        getWildberriesSellerProductCardsTool(userId),
        createWildberriesProductCardTool(userId),
        getWildberriesSubjectIdTool(userId),
      ];
      toolsByName[LISTING_TOOLS_NAME] = listingTools;
    } catch (error) {
      logger.warn('Failed to create Wildberries tool for execution', { userId, error });
    }
  }
  
  return toolsByName;
}

export async function executeTools(
  toolCalls: ToolCall[], 
  userId?: string
): Promise<ToolMessage[]> {
  const toolResults: ToolMessage[] = [];
  const toolsByName = createToolsMap(userId);

  for (const toolCall of toolCalls) {
    try {
      const selectedTool = toolsByName[toolCall.name];
      if (selectedTool) {
        logger.info(`Executing tool: ${toolCall.name}`, { args: toolCall.args });
        
        // Use LangChain's built-in tool invocation which returns a ToolMessage
        const toolMessage = await selectedTool.invoke(toolCall);
        toolResults.push(toolMessage);
      } else {
        logger.error(`Tool not found: ${toolCall.name}`);
        // Create an error ToolMessage for unknown tools
        const errorMessage = new ToolMessage({
          content: `Tool '${toolCall.name}' not found`,
          tool_call_id: toolCall.id || 'unknown',
          status: 'error'
        });
        toolResults.push(errorMessage);
      }
    } catch (error) {
      logger.error(`Tool execution failed for ${toolCall.name}:`, error);
      // Create an error ToolMessage for failed executions
      const errorMessage = new ToolMessage({
        content: "Tool execution failed",
        tool_call_id: toolCall.id || 'unknown',
        status: 'error'
      });
      toolResults.push(errorMessage);
    }
  }

  return toolResults;
}

export function parseToolExecutionResult(
  toolResult: ToolMessage,
  toolCalls: ToolCall[]
): ToolExecutionResult {
  let messageContent = toolResult.content.toString();
  let messageStatus: 'success' | 'error' = 'success';
  let userFriendlyMessage = messageContent;
  
  try {
    const parsedContent = JSON.parse(messageContent);
    
    // If the tool returned an error structure, extract the error message and set error status
    if (parsedContent && !parsedContent.success && parsedContent.error) {
      messageContent = parsedContent.error;
      userFriendlyMessage = parsedContent.error;
      messageStatus = 'error';
    } else if (parsedContent && parsedContent.success) {
      // For successful responses, keep the full JSON for assistant processing
      messageStatus = 'success';
      userFriendlyMessage = messageContent;
    }
  } catch (parseError) {
    // If JSON parsing fails, treat as error and use raw content
    messageStatus = 'error';
    userFriendlyMessage = messageContent;
    logger.warn('Failed to parse tool result JSON, treating as error', { 
      toolCallId: toolResult.tool_call_id,
      content: messageContent
    });
  }

  const toolName = toolCalls.find((tc: any) => tc.id === toolResult.tool_call_id)?.name || '';

  return {
    toolMessage: toolResult,
    status: messageStatus,
    userFriendlyMessage,
    toolName
  };
}

export function getToolExecutionEvents(toolCalls: ToolCall[]): Array<{message: string, toolName: string}> {
  return toolCalls.map((tc: ToolCall) => ({
    message: wildberriesToolsMessages[tc.name as keyof typeof wildberriesToolsMessages]?.pending || 'Executing tool...',
    toolName: tc.name
  }));
} 