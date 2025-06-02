import { Router } from 'express';
import { csrfProtection } from '../shared/middleware';
import authRoutes from './auth/auth.routes';
import promptDemoRoutes from './demo/demo.routes';
import metricsRoutes from './metrics/metrics.routes';
import conversationsRoutes from './conversations/conversations.routes';
import plansRoutes from './plans/plans.routes';
import apiKeysRoutes from './apikeys/apikeys.routes';

const router = Router();

// Apply CSRF protection to all API routes
router.use(csrfProtection);

// Route registration
router.use('/auth', authRoutes);
router.use('/prompt-demo', promptDemoRoutes);
router.use('/metrics', metricsRoutes);
router.use('/conversation', conversationsRoutes);
router.use('/plans', plansRoutes);
router.use('/api-keys', apiKeysRoutes);

export default router; 