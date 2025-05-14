import express, { Request, Response } from 'express';
import { getLangChainService } from '../services/langchain';
import { asyncHandler, authenticate, requireAdmin } from '../middleware';

const router = express.Router();
const langchainService = getLangChainService();

// Apply authentication to all metrics routes
router.use(authenticate);

// Get token usage metrics
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const metrics = langchainService.getMetrics();
  
  res.json({
    ...metrics,
    timestamp: new Date().toISOString()
  });
}));

// Reset metrics
router.post('/reset', asyncHandler(async (req: Request, res: Response) => {
  langchainService.resetMetrics();
  res.json({ 
    success: true, 
    message: 'Metrics reset successfully',
    timestamp: new Date().toISOString()
  });
}));

export default router; 