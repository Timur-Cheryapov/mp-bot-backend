import { Message } from "../../infrastructure/database/supabase.client";

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