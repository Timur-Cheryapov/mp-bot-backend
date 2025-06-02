import { ToolCall } from "@langchain/core/dist/messages/tool";

export interface BasicMessage {
  role: string;
  content: string;
  tool_call_id?: string;
  tool_name?: string;
  tool_calls?: ToolCall[];
}