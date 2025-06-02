import { PostgrestError } from '@supabase/supabase-js';
import logger from '../../shared/utils/logger';
import { getSupabaseClient } from '../../infrastructure/database/supabase.client';
import { DailyUsage } from '../../infrastructure/database/supabase.client';

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

// Get daily usage for a user (optionally by date and model)
export const getDailyUsageByUser = async (
  userId: string,
  date?: string, // YYYY-MM-DD
  model?: string
): Promise<DailyUsage | null> => {
  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from('daily_usage')
      .select('*')
      .eq('user_id', userId);
    if (date) query = query.eq('date', date);
    if (model) query = query.eq('model', model);
    query = query.order('date', { ascending: false }).limit(1);
    const { data, error } = await query.single();
    if (error && error.code !== 'PGRST116') throw error; // PGRST116: No rows found
    return data || null;
  } catch (error) {
    return handleDatabaseError('getDailyUsageByUser', error as Error);
  }
};

// Upsert (insert or update) daily usage for a user
export const upsertDailyUsage = async (
  userId: string,
  date: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number
): Promise<DailyUsage> => {
  try {
    const supabase = getSupabaseClient();
    
    // Fetch existing record
    const { data: existing, error: fetchError } = await supabase
      .from('daily_usage')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .eq('model', model)
      .single();

    let newInputTokens = inputTokens;
    let newOutputTokens = outputTokens;
    let newCostUsd = costUsd;

    if (existing) {
      newInputTokens += existing.input_tokens;
      newOutputTokens += existing.output_tokens;
      newCostUsd += Number(existing.cost_usd);
    }

    const { data, error } = await supabase
      .from('daily_usage')
      .upsert([
        {
          user_id: userId,
          date,
          model,
          input_tokens: newInputTokens,
          output_tokens: newOutputTokens,
          cost_usd: newCostUsd,
          updated_at: new Date().toISOString(),
        }
      ], { onConflict: 'user_id,date,model' })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    return handleDatabaseError('upsertDailyUsage', error as Error);
  }
};

// Get all daily usage records (optionally filtered)
export const getAllDailyUsage = async (
  userId?: string,
  date?: string,
  from?: string
): Promise<DailyUsage[]> => {
  try {
    const supabase = getSupabaseClient();
    let query = supabase.from('daily_usage').select('*');
    if (userId) query = query.eq('user_id', userId);
    if (date) query = query.eq('date', date);
    if (from) query = query.gte('date', from);
    query = query.order('date', { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    return handleDatabaseError('getAllDailyUsage', error as Error);
  }
}; 