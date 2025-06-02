import { DailyUsage } from "../../infrastructure/database/supabase.client";

// Configuration types (kept same for compatibility)
export type ChatModelParams = {
  temperature?: number;
  maxTokens?: number;
  modelName?: string;
  includeWildberriesTools?: boolean;
  userId?: string;
};

export type EmbeddingModelParams = {
  modelName?: string;
  stripNewLines?: boolean;
};

export type ChatOptions = {
  modelName?: string;
  userId?: string;
  stream?: boolean;
  includeWildberriesTools?: boolean;
};

export type ConversationOptions = {
  modelName?: string;
  conversationId: string;
  userId?: string;
  stream?: boolean;
  includeWildberriesTools?: boolean;
};

export type TokenMetrics = Omit<DailyUsage, 'id' | 'created_at' | 'updated_at'>;