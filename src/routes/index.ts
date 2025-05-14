import { Router } from 'express';
import { csrfProtection } from '../middleware';
import authRoutes from './auth.routes';
import promptDemoRoutes from './promptDemo';

const router = Router();

// Apply CSRF protection to all API routes
router.use(csrfProtection);

// Route registration
router.use('/auth', authRoutes);
router.use('/prompt-demo', promptDemoRoutes);

export default router; 