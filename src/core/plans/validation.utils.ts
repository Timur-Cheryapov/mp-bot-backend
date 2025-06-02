import { checkUserDailyUsage } from "./user-plans.service";

export interface UsageLimitResult {
  hasReachedLimit: boolean;
  dailyLimitCredits: number;
  monthlyLimitCredits: number;
  nextResetDate: string;
}

export async function validateUserUsageLimit(userId?: string): Promise<void> {
  if (!userId) return;
  
  const usageCheck = await checkUserDailyUsage(userId);
  if (usageCheck.hasReachedLimit) {
    throw new Error(
      `Credit limit reached. Daily limit: $${usageCheck.dailyLimitCredits.toFixed(2)}, ` +
      `Monthly limit: $${usageCheck.monthlyLimitCredits.toFixed(2)}. ` +
      `Next reset: ${usageCheck.nextResetDate}`
    );
  }
}