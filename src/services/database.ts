import { PostgrestError } from '@supabase/supabase-js';
import logger from '../utils/logger';
import { getSupabaseClient } from './supabase';
import { Conversation, Message, User } from './supabase';

/**
 * Database utility functions for common operations
 */

// Error handling helper
const handleDatabaseError = (operation: string, error: PostgrestError | Error): never => {
  const errorMessage = error instanceof Error 
    ? error.message 
    : (error as PostgrestError).message || 'Unknown database error';

  logger.error(`Database ${operation} failed: ${errorMessage}`, {
    details: error instanceof Error ? error.stack : (error as PostgrestError).details,
    hint: (error as PostgrestError).hint,
    code: (error as PostgrestError).code
  });

  throw new Error(`Database operation failed: ${errorMessage}`);
};

// User operations
export const getUserById = async (userId: string): Promise<User | null> => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    return handleDatabaseError('getUserById', error as Error);
  }
};

export const updateUserLastSeen = async (userId: string): Promise<void> => {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) throw error;
  } catch (error) {
    handleDatabaseError('updateUserLastSeen', error as Error);
  }
};

// Conversation operations
export const getConversationById = async (conversationId: string): Promise<Conversation | null> => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    return handleDatabaseError('getConversationById', error as Error);
  }
};

export const getUserConversations = async (
  userId: string, 
  options?: { 
    includeArchived?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<Conversation[]> => {
  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId);
    
    // Filter archived conversations unless explicitly included
    if (!options?.includeArchived) {
      query = query.eq('is_archived', false);
    }
    
    // Apply pagination
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }
    
    // Always sort by most recently updated
    query = query.order('updated_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    return handleDatabaseError('getUserConversations', error as Error);
  }
};

export const createConversation = async (
  userId: string, 
  title: string,
  options?: {
    model_name?: string;
    system_prompt?: string;
    temperature?: number;
    max_tokens?: number;
    context_length?: number;
    metadata?: Record<string, any>;
  }
): Promise<Conversation> => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('conversations')
      .insert([{ 
        user_id: userId, 
        title,
        ...options
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    return handleDatabaseError('createConversation', error as Error);
  }
};

export const updateConversation = async (
  conversationId: string, 
  updates: Partial<Omit<Conversation, 'id' | 'created_at' | 'user_id'>>
): Promise<void> => {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('conversations')
      .update(updates)
      .eq('id', conversationId);

    if (error) throw error;
  } catch (error) {
    handleDatabaseError('updateConversation', error as Error);
  }
};

// Function specifically for updating title to maintain compatibility
export const updateConversationTitle = async (
  conversationId: string, 
  title: string
): Promise<void> => {
  return updateConversation(conversationId, { title });
};

export const archiveConversation = async (conversationId: string): Promise<void> => {
  return updateConversation(conversationId, { is_archived: true });
};

export const unarchiveConversation = async (conversationId: string): Promise<void> => {
  return updateConversation(conversationId, { is_archived: false });
};

export const deleteConversation = async (conversationId: string): Promise<void> => {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);

    if (error) throw error;
  } catch (error) {
    handleDatabaseError('deleteConversation', error as Error);
  }
};

// Message operations
export const getMessagesByConversationId = async (
  conversationId: string,
  limit = 50,
  before?: string
): Promise<Message[]> => {
  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit);
    
    if (before) {
      query = query.lt('id', before);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    return handleDatabaseError('getMessagesByConversationId', error as Error);
  }
};

export const createMessage = async (
  conversationId: string,
  content: string,
  role: 'user' | 'assistant',
  metadata?: Record<string, any>
): Promise<Message> => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('messages')
      .insert([{ 
        conversation_id: conversationId, 
        content, 
        role,
        metadata
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    return handleDatabaseError('createMessage', error as Error);
  }
};

export const updateMessage = async (
  messageId: string,
  updates: Partial<Pick<Message, 'content' | 'metadata'>>
): Promise<void> => {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('messages')
      .update(updates)
      .eq('id', messageId);

    if (error) throw error;
  } catch (error) {
    handleDatabaseError('updateMessage', error as Error);
  }
};

export const deleteMessage = async (messageId: string): Promise<void> => {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId);

    if (error) throw error;
  } catch (error) {
    handleDatabaseError('deleteMessage', error as Error);
  }
}; 