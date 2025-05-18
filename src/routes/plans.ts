import express, { Request, Response } from 'express';
import { asyncHandler, authenticate, requireAdmin, verifyPaymentSignature } from '../middleware';
import * as userPlansService from '../services/userPlans';

const router = express.Router();

/**
 * Plan details lookup by plan ID
 */
export const planDetailsMap: Record<string, { name: string; creditsPerDay: number; creditsPerMonth: number }> = {
  free: {
    name: "Free",
    creditsPerDay: 0.50,
    creditsPerMonth: 5.00
  },
  standard: {
    name: "Standard",
    creditsPerDay: 2.00,
    creditsPerMonth: 20.00
  },
  premium: {
    name: "Premium",
    creditsPerDay: 10.00,
    creditsPerMonth: 100.00
  }
};

// Apply authentication to all plan routes
router.use(authenticate);

// Get the current user's plan
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  
  // Get the user's plan
  const userPlan = await userPlansService.getUserPlan(userId);
  
  if (!userPlan) {
    // Create a default plan if none exists
    const defaultPlan = await userPlansService.upsertUserPlan(userId, {
      plan_name: planDetailsMap.free.name,
      max_credits_per_day: planDetailsMap.free.creditsPerDay,
      max_credits_per_month: planDetailsMap.free.creditsPerMonth,
      active: true
    });
    
    return res.json({
      plan: defaultPlan,
      message: 'Default plan created'
    });
  }
  
  res.json({ plan: userPlan });
}));

// Check the current user's usage against limits
router.get('/usage', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  
  // Check usage
  const usageInfo = await userPlansService.checkUserDailyUsage(userId);
  
  res.json(usageInfo);
}));

// Update a user's plan (admin only)
router.put('/:userId', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { planName, maxCreditsPerDay, maxCreditsPerMonth, active } = req.body;
  
  // Validate required fields
  if (!planName || maxCreditsPerDay === undefined || maxCreditsPerMonth === undefined) {
    return res.status(400).json({
      error: 'Missing required fields: planName, maxCreditsPerDay, maxCreditsPerMonth'
    });
  }
  
  // Update the plan
  const updatedPlan = await userPlansService.upsertUserPlan(userId, {
    plan_name: planName,
    max_credits_per_day: maxCreditsPerDay,
    max_credits_per_month: maxCreditsPerMonth,
    active: active !== undefined ? active : true
  });
  
  res.json({
    plan: updatedPlan,
    message: 'Plan updated successfully'
  });
}));

// NOTE: Removed requireAdmin for development purposes
// Update subscription (for use with payment system webhooks)
router.post('/subscription', verifyPaymentSignature, asyncHandler(async (req: Request, res: Response) => {
  const { userId, planId, planName, maxCreditsPerDay, maxCreditsPerMonth } = req.body;
  
  // Validate required fields
  if (!userId || !planName || maxCreditsPerDay === undefined || maxCreditsPerMonth === undefined) {
    return res.status(400).json({
      error: 'Missing required fields: userId, planName, maxCreditsPerDay, maxCreditsPerMonth'
    });
  }

  // Check if the plan details match the plan details on the server
  if (
    planDetailsMap[planId].name != planName || 
    planDetailsMap[planId].creditsPerDay != maxCreditsPerDay || 
    planDetailsMap[planId].creditsPerMonth != maxCreditsPerMonth
  ) {
    return res.status(400).json({
      error: 'Plan details do not match the plan details on the server'
    });
  }
  
  // Update the subscription
  const updatedPlan = await userPlansService.updateUserPlanSubscription(
    userId,
    planName,
    maxCreditsPerDay,
    maxCreditsPerMonth
  );
  
  res.json({
    plan: updatedPlan,
    message: 'Subscription updated successfully'
  });
}));

// Activate a user's plan
router.post('/:userId/activate', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  
  const activatedPlan = await userPlansService.activateUserPlan(userId);
  
  res.json({
    plan: activatedPlan,
    message: 'Plan activated successfully'
  });
}));

// Deactivate a user's plan
router.post('/:userId/deactivate', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  
  const deactivatedPlan = await userPlansService.deactivateUserPlan(userId);
  
  res.json({
    plan: deactivatedPlan,
    message: 'Plan deactivated successfully'
  });
}));

export default router; 