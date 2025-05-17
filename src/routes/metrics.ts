import express, { Request, Response } from 'express';
import { getLangChainService } from '../services/langchain';
import { asyncHandler, authenticate } from '../middleware';

const router = express.Router();
const langchainService = getLangChainService();

// Apply authentication to all metrics routes
router.use(authenticate);

// Get daily usage metrics for the authenticated user
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { date } = req.query;
  const metrics = await langchainService.getMetrics(userId, typeof date === 'string' ? date : undefined);
  res.json({
    usage: metrics
  });
}));

// Reset daily usage metrics for the authenticated user (for today)
router.post('/reset', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  await langchainService.resetMetrics(userId);
  res.json({ 
    success: true, 
    message: 'Metrics reset successfully'
  });
}));

export default router;