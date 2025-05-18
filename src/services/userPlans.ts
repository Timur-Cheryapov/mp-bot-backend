import { PostgrestError } from '@supabase/supabase-js';
import logger from '../utils/logger';
import { getSupabaseClient } from './supabase';
import { UserPlan } from './supabase';
import { getAllDailyUsage } from './dailyUsage';

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

/**
 * Get a user's plan by user ID
 */
export const getUserPlan = async (userId: string): Promise<UserPlan | null> => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('user_plans')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116: No rows found
    return data || null;
  } catch (error) {
    return handleDatabaseError('getUserPlan', error as Error);
  }
};

/**
 * Create or update a user's plan
 */
export const upsertUserPlan = async (
  userId: string,
  planData: Partial<Omit<UserPlan, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<UserPlan> => {
  try {
    const supabase = getSupabaseClient();
    
    // Prepare the data for upsert
    const data = {
      user_id: userId,
      ...planData,
      // No need to include updated_at as the trigger handles it
    };
    
    const { data: result, error } = await supabase
      .from('user_plans')
      .upsert([data], { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;
    return result;
  } catch (error) {
    return handleDatabaseError('upsertUserPlan', error as Error);
  }
};

/**
 * Calculate the current billing period based on reset_date
 * @returns Object with from and to dates for the current billing period
 */
const calculateBillingPeriod = (resetDate: string): { from: string, to: string } => {
  const today = new Date();
  const resetDay = new Date(resetDate).getDate();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  
  // Determine the last reset date
  let fromDate = new Date(currentYear, currentMonth, resetDay);
  
  // If the reset day is after today, go back one month
  if (fromDate > today) {
    fromDate = new Date(currentYear, currentMonth - 1, resetDay);
  }
  
  return {
    from: fromDate.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10)
  };
};

/**
 * Check if a user has exceeded their credit limit
 * @returns Object with remaining credits and limits
 */
export const checkUserDailyUsage = async (userId: string): Promise<{
  hasReachedLimit: boolean;
  dailyUsageCredits: number;
  dailyLimitCredits: number;
  remainingDailyCredits: number;
  monthlyUsageCredits: number;
  monthlyLimitCredits: number;
  remainingMonthlyCredits: number;
  nextResetDate: string;
}> => {
  try {
    // Get the user's plan
    const plan = await getUserPlan(userId);
    if (!plan) {
      // No plan found, create a default 'free' plan for the user
      await upsertUserPlan(userId, {
        plan_name: 'free',
        max_credits_per_day: 0.50,
        max_credits_per_month: 5.00,
        active: true
      });
      return {
        hasReachedLimit: false,
        dailyUsageCredits: 0,
        dailyLimitCredits: 0.50,
        remainingDailyCredits: 0.50,
        monthlyUsageCredits: 0,
        monthlyLimitCredits: 5.00,
        remainingMonthlyCredits: 5.00,
        nextResetDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().slice(0, 10)
      };
    }
    
    // Check if plan is active
    if (!plan.active) {
      return {
        hasReachedLimit: true,
        dailyUsageCredits: 0,
        dailyLimitCredits: 0,
        remainingDailyCredits: 0,
        monthlyUsageCredits: 0,
        monthlyLimitCredits: 0,
        remainingMonthlyCredits: 0,
        nextResetDate: plan.reset_date
      };
    }
    
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().slice(0, 10);
    
    // Calculate billing period based on reset_date
    const { from } = calculateBillingPeriod(plan.reset_date);
    
    // Calculate next reset date (same day, next month)
    const resetDate = new Date(plan.reset_date);
    
    // Get daily and monthly usage
    const dailyUsage = await getAllDailyUsage(userId, today);
    const monthlyUsage = await getAllDailyUsage(userId, undefined, from);
    
    // Calculate total credits used for today
    const dailyUsageCredits = dailyUsage.reduce((total, usage) => 
      total + Number(usage.cost_usd), 0);
    
    // Calculate total credits used for current billing period
    const monthlyUsageCredits = monthlyUsage.reduce((total, usage) => 
      total + Number(usage.cost_usd), 0);
    
    // Calculate remaining credits
    const remainingDailyCredits = Math.max(0, Number(plan.max_credits_per_day) - dailyUsageCredits);
    const remainingMonthlyCredits = Math.max(0, Number(plan.max_credits_per_month) - monthlyUsageCredits);
    
    // Check if either limit has been reached
    const hasReachedLimit = remainingDailyCredits <= 0 || remainingMonthlyCredits <= 0;

    // logger.info(`User ${userId} has left ${remainingDailyCredits} daily credits and ${remainingMonthlyCredits} monthly credits`);
    
    return {
      hasReachedLimit,
      dailyUsageCredits,
      dailyLimitCredits: Number(plan.max_credits_per_day),
      remainingDailyCredits,
      monthlyUsageCredits,
      monthlyLimitCredits: Number(plan.max_credits_per_month),
      remainingMonthlyCredits,
      nextResetDate: resetDate.toISOString().slice(0, 10)
    };
  } catch (error) {
    logger.error(`Failed to check user usage: ${error instanceof Error ? error.message : String(error)}`);
    // In case of error, allow usage (fail open for better user experience)
    return {
      hasReachedLimit: false,
      dailyUsageCredits: 0,
      dailyLimitCredits: 0.50,
      remainingDailyCredits: 0.50,
      monthlyUsageCredits: 0,
      monthlyLimitCredits: 5.00,
      remainingMonthlyCredits: 5.00,
      nextResetDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().slice(0, 10)
    };
  }
};

/**
 * Update a user's plan to a new subscription level
 */
export const updateUserPlanSubscription = async (
  userId: string,
  planName: string,
  maxCreditsPerDay: number,
  maxCreditsPerMonth: number
): Promise<UserPlan> => {
  // Calculate a new reset date (today + 1 month)
  const resetDate = new Date();
  resetDate.setMonth(resetDate.getMonth() + 1);
  
  return upsertUserPlan(userId, {
    plan_name: planName,
    max_credits_per_day: maxCreditsPerDay,
    max_credits_per_month: maxCreditsPerMonth,
    reset_date: resetDate.toISOString().slice(0, 10),
    active: true
  });
};

/**
 * Deactivate a user's plan
 */
export const deactivateUserPlan = async (userId: string): Promise<UserPlan> => {
  return upsertUserPlan(userId, { active: false });
};

/**
 * Activate a user's plan
 */
export const activateUserPlan = async (userId: string): Promise<UserPlan> => {
  return upsertUserPlan(userId, { active: true });
}; 