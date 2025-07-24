import request from 'supertest';
import express from 'express';
import plansRoutes, { planDetailsMap } from '../../api/plans/plans.routes';
import * as userPlansService from '../../core/plans/user-plans.service';

// Mock all dependencies
jest.mock('../../core/plans/user-plans.service');
jest.mock('../../shared/middleware', () => ({
  asyncHandler: (fn: any) => fn,
  authenticate: (req: any, res: any, next: any) => {
    req.user = { id: 'user-123', email: 'test@example.com' };
    next();
  },
  requireAdmin: (req: any, res: any, next: any) => {
    // Mock admin check - can be overridden in tests
    if (req.user?.role === 'admin') {
      next();
    } else {
      res.status(403).json({ error: 'Admin access required' });
    }
  },
  verifyPaymentSignature: (req: any, res: any, next: any) => {
    // Mock payment signature verification
    if (req.headers['x-payment-signature'] === 'valid-signature') {
      next();
    } else {
      res.status(401).json({ error: 'Invalid payment signature' });
    }
  }
}));

const mockUserPlansService = userPlansService as jest.Mocked<typeof userPlansService>;

describe('Plans Routes', () => {
  let app: express.Application;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    role: 'user'
  };

  const mockAdminUser = {
    id: 'admin-123',
    email: 'admin@example.com',
    role: 'admin'
  };

  const mockUserPlan = {
    id: 'plan-123',
    user_id: 'user-123',
    plan_name: 'Free',
    max_credits_per_day: 0.50,
    max_credits_per_month: 5.00,
    reset_date: '2024-01-01',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    active: true
  };

  const mockUsageInfo = {
    hasReachedLimit: false,
    dailyUsageCredits: 0.25,
    dailyLimitCredits: 0.50,
    remainingDailyCredits: 0.25,
    monthlyUsageCredits: 2.50,
    monthlyLimitCredits: 5.00,
    remainingMonthlyCredits: 2.50,
    nextResetDate: '2024-01-01'
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Mock authentication to set user
    app.use((req: any, res, next) => {
      req.user = mockUser;
      next();
    });
    
    app.use('/plans', plansRoutes);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('planDetailsMap', () => {
    test('should have correct plan details', () => {
      expect(planDetailsMap).toEqual({
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
      });
    });
  });

  describe('GET /', () => {
    test('should get user plan when plan exists', async () => {
      mockUserPlansService.getUserPlan.mockResolvedValue(mockUserPlan);

      const response = await request(app)
        .get('/plans')
        .expect(200);

      expect(mockUserPlansService.getUserPlan).toHaveBeenCalledWith('user-123');
      expect(response.body).toEqual({
        plan: mockUserPlan
      });
    });

    test('should create default plan when no plan exists', async () => {
      mockUserPlansService.getUserPlan.mockResolvedValue(null);
      mockUserPlansService.upsertUserPlan.mockResolvedValue(mockUserPlan);

      const response = await request(app)
        .get('/plans')
        .expect(200);

      expect(mockUserPlansService.getUserPlan).toHaveBeenCalledWith('user-123');
      expect(mockUserPlansService.upsertUserPlan).toHaveBeenCalledWith('user-123', {
        plan_name: 'Free',
        max_credits_per_day: 0.50,
        max_credits_per_month: 5.00,
        active: true
      });
      expect(response.body).toEqual({
        plan: mockUserPlan,
        message: 'Default plan created'
      });
    });

    test('should handle service errors', async () => {
      mockUserPlansService.getUserPlan.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/plans')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /usage', () => {
    test('should get user usage information', async () => {
      mockUserPlansService.checkUserDailyUsage.mockResolvedValue(mockUsageInfo);

      const response = await request(app)
        .get('/plans/usage')
        .expect(200);

      expect(mockUserPlansService.checkUserDailyUsage).toHaveBeenCalledWith('user-123');
      expect(response.body).toEqual(mockUsageInfo);
    });

    test('should handle service errors', async () => {
      mockUserPlansService.checkUserDailyUsage.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/plans/usage')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /:userId (admin only)', () => {
    beforeEach(() => {
      // Override middleware mocks for admin tests
      const middleware = require('../../shared/middleware');
      middleware.requireAdmin = jest.fn((req: any, res: any, next: any) => {
        // For these tests, allow admin access
        next();
      });
      
      // Recreate app with admin user
      app = express();
      app.use(express.json());
      app.use((req: any, res, next) => {
        req.user = mockAdminUser;
        next();
      });
      app.use('/plans', plansRoutes);
      jest.clearAllMocks();
    });

    test('should update user plan successfully', async () => {
      const requestBody = {
        planName: 'Standard',
        maxCreditsPerDay: 2.00,
        maxCreditsPerMonth: 20.00,
        active: true
      };

      const updatedPlan = { ...mockUserPlan, ...requestBody };
      mockUserPlansService.upsertUserPlan.mockResolvedValue(updatedPlan);

      const response = await request(app)
        .put('/plans/user-456')
        .send(requestBody)
        .expect(200);

      expect(mockUserPlansService.upsertUserPlan).toHaveBeenCalledWith('user-456', {
        plan_name: 'Standard',
        max_credits_per_day: 2.00,
        max_credits_per_month: 20.00,
        active: true
      });
      expect(response.body).toEqual({
        plan: updatedPlan,
        message: 'Plan updated successfully'
      });
    });

    test('should handle missing required fields', async () => {
      const requestBody = {
        planName: 'Standard'
        // Missing maxCreditsPerDay and maxCreditsPerMonth
      };

      const response = await request(app)
        .put('/plans/user-456')
        .send(requestBody)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Missing required fields: planName, maxCreditsPerDay, maxCreditsPerMonth'
      });
    });

    test('should handle service errors', async () => {
      const requestBody = {
        planName: 'Standard',
        maxCreditsPerDay: 2.00,
        maxCreditsPerMonth: 20.00
      };

      mockUserPlansService.upsertUserPlan.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .put('/plans/user-456')
        .send(requestBody)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    test('should deny access to non-admin users', async () => {
      // Mock regular user
      app = express();
      app.use(express.json());
      app.use((req: any, res, next) => {
        req.user = mockUser;
        next();
      });
      app.use('/plans', plansRoutes);

      const requestBody = {
        planName: 'Standard',
        maxCreditsPerDay: 2.00,
        maxCreditsPerMonth: 20.00
      };

      const response = await request(app)
        .put('/plans/user-456')
        .send(requestBody)
        .expect(403);

      expect(response.body).toEqual({
        error: 'Admin access required'
      });
    });
  });

  describe('POST /subscription', () => {
    test('should update subscription with valid signature', async () => {
      const requestBody = {
        userId: 'user-456',
        planId: 'standard',
        planName: 'Standard',
        maxCreditsPerDay: 2.00,
        maxCreditsPerMonth: 20.00
      };

      const updatedPlan = { ...mockUserPlan, ...requestBody };
      mockUserPlansService.updateUserPlanSubscription.mockResolvedValue(updatedPlan);

      const response = await request(app)
        .post('/plans/subscription')
        .set('x-payment-signature', 'valid-signature')
        .send(requestBody)
        .expect(200);

      expect(mockUserPlansService.updateUserPlanSubscription).toHaveBeenCalledWith(
        'user-456',
        'Standard',
        2.00,
        20.00
      );
      expect(response.body).toEqual({
        plan: updatedPlan,
        message: 'Subscription updated successfully'
      });
    });

    test('should handle missing required fields', async () => {
      const requestBody = {
        userId: 'user-456',
        planId: 'standard'
        // Missing planName, maxCreditsPerDay, maxCreditsPerMonth
      };

      const response = await request(app)
        .post('/plans/subscription')
        .set('x-payment-signature', 'valid-signature')
        .send(requestBody)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Missing required fields: userId, planName, maxCreditsPerDay, maxCreditsPerMonth'
      });
    });

    test('should handle plan details mismatch', async () => {
      const requestBody = {
        userId: 'user-456',
        planId: 'standard',
        planName: 'Premium', // Mismatch - should be Standard
        maxCreditsPerDay: 2.00,
        maxCreditsPerMonth: 20.00
      };

      const response = await request(app)
        .post('/plans/subscription')
        .set('x-payment-signature', 'valid-signature')
        .send(requestBody)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Plan details do not match the plan details on the server'
      });
    });

    test('should deny access with invalid signature', async () => {
      const requestBody = {
        userId: 'user-456',
        planId: 'standard',
        planName: 'Standard',
        maxCreditsPerDay: 2.00,
        maxCreditsPerMonth: 20.00
      };

      const response = await request(app)
        .post('/plans/subscription')
        .set('x-payment-signature', 'invalid-signature')
        .send(requestBody)
        .expect(401);

      expect(response.body).toEqual({
        error: 'Invalid payment signature'
      });
    });

    test('should handle service errors', async () => {
      const requestBody = {
        userId: 'user-456',
        planId: 'standard',
        planName: 'Standard',
        maxCreditsPerDay: 2.00,
        maxCreditsPerMonth: 20.00
      };

      mockUserPlansService.updateUserPlanSubscription.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/plans/subscription')
        .set('x-payment-signature', 'valid-signature')
        .send(requestBody)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /:userId/activate (admin only)', () => {
    beforeEach(() => {
      // Override middleware mocks for admin tests
      const middleware = require('../../shared/middleware');
      middleware.requireAdmin = jest.fn((req: any, res: any, next: any) => {
        next();
      });
      
      // Recreate app with admin user
      app = express();
      app.use(express.json());
      app.use((req: any, res, next) => {
        req.user = mockAdminUser;
        next();
      });
      app.use('/plans', plansRoutes);
      jest.clearAllMocks();
    });

    test('should activate user plan successfully', async () => {
      const activatedPlan = { ...mockUserPlan, active: true };
      mockUserPlansService.activateUserPlan.mockResolvedValue(activatedPlan);

      const response = await request(app)
        .post('/plans/user-456/activate')
        .expect(200);

      expect(mockUserPlansService.activateUserPlan).toHaveBeenCalledWith('user-456');
      expect(response.body).toEqual({
        plan: activatedPlan,
        message: 'Plan activated successfully'
      });
    });

    test('should handle service errors', async () => {
      mockUserPlansService.activateUserPlan.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/plans/user-456/activate')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    test('should deny access to non-admin users', async () => {
      // Mock regular user
      app = express();
      app.use(express.json());
      app.use((req: any, res, next) => {
        req.user = mockUser;
        next();
      });
      app.use('/plans', plansRoutes);

      const response = await request(app)
        .post('/plans/user-456/activate')
        .expect(403);

      expect(response.body).toEqual({
        error: 'Admin access required'
      });
    });
  });

  describe('POST /:userId/deactivate (admin only)', () => {
    beforeEach(() => {
      // Override middleware mocks for admin tests
      const middleware = require('../../shared/middleware');
      middleware.requireAdmin = jest.fn((req: any, res: any, next: any) => {
        next();
      });
      
      // Recreate app with admin user
      app = express();
      app.use(express.json());
      app.use((req: any, res, next) => {
        req.user = mockAdminUser;
        next();
      });
      app.use('/plans', plansRoutes);
      jest.clearAllMocks();
    });

    test('should deactivate user plan successfully', async () => {
      const deactivatedPlan = { ...mockUserPlan, active: false };
      mockUserPlansService.deactivateUserPlan.mockResolvedValue(deactivatedPlan);

      const response = await request(app)
        .post('/plans/user-456/deactivate')
        .expect(200);

      expect(mockUserPlansService.deactivateUserPlan).toHaveBeenCalledWith('user-456');
      expect(response.body).toEqual({
        plan: deactivatedPlan,
        message: 'Plan deactivated successfully'
      });
    });

    test('should handle service errors', async () => {
      mockUserPlansService.deactivateUserPlan.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/plans/user-456/deactivate')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    test('should deny access to non-admin users', async () => {
      // Mock regular user
      app = express();
      app.use(express.json());
      app.use((req: any, res, next) => {
        req.user = mockUser;
        next();
      });
      app.use('/plans', plansRoutes);

      const response = await request(app)
        .post('/plans/user-456/deactivate')
        .expect(403);

      expect(response.body).toEqual({
        error: 'Admin access required'
      });
    });
  });
}); 