import { SystemMessage, HumanMessage, BaseMessage } from "@langchain/core/messages";
import { Message } from "../../infrastructure/database/supabase.client";
import { BasicMessage } from "../../shared/types/message.types";
import { convertToLangChainMessages } from "../conversations/message.utils";

/**
 * Format messages from SystemMessage, HumanMessage, AIMessage to a basic format
 * @param messages Array of messages
 * @returns basicly formatted messages
 */
export function formatMessagesToBasic(messages: Message[]): Array<{role: string, content: string}> {
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
}

/**
 * Choose the messages to process based on the state of the conversation
 * If there are no messages in the state, we need to include the whole conversation
 * If there are messages in the state, we only need to include the new user message
 */
export function processMessages(
  systemPrompt: string,
  messages: BasicMessage[],
  stateMessages?: BaseMessage[]
): { messagesToProcess: BaseMessage[], refresh: boolean } {
  // If there are no messages in the state, we need to include the whole conversation
  const refresh = !stateMessages || stateMessages.length === 0;
  // Determine if this is the first message in the conversation
  let messagesToProcess: BaseMessage[];
  if (messages.length === 1) {
    // First message: include system prompt + user message
    messagesToProcess = [
      new SystemMessage(systemPrompt),
      new HumanMessage(messages[0].content)
    ];
  } else {
    // If there are no messages in the state, we need to include the whole conversation
    if (refresh) {
      messagesToProcess = convertToLangChainMessages(systemPrompt, messages);
    } else {
      // Subsequent message: only the new user message (system prompt already in state)
      messagesToProcess = [new HumanMessage(messages[messages.length - 1].content)];
    }
  }
  return { messagesToProcess, refresh };
}

/**
 * Build the call state for LangGraph agent invocation
 * If refresh is true, include all state fields; otherwise, only include messages
 */
export function buildCallState(
  processed: { messagesToProcess: BaseMessage[], refresh: boolean },
  conversationId: string | undefined,
  userId: string | undefined,
  modelName: string,
  includeWildberriesTools: boolean
): any {
  if (processed.refresh) {
    return {
      messages: processed.messagesToProcess,
      conversationId: conversationId || '',
      userId: userId || '',
      modelName: modelName,
      includeWildberriesTools: includeWildberriesTools
    };
  } else {
    return {
      messages: processed.messagesToProcess,
    };
  }
}