import { checkUserDailyUsage } from '../services/userPlans';

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

export function validateWildberriesToolsRequirements(
  includeWildberriesTools: boolean,
  userId?: string
): void {
  if (includeWildberriesTools && !userId) {
    throw new Error('userId is required when includeWildberriesTools is true');
  }
}

export function validateApiKey(apiKey?: string): void {
  if (!apiKey) {
    throw new Error('OpenAI API key is not defined in environment variables');
  }
} 