import express, { Request, Response } from 'express';
import { getLangChainService } from '../services/langchain';
import { getMemoryService } from '../services/memory';
import { asyncHandler } from '../middleware';

const router = express.Router();
const langchainService = getLangChainService();
const memoryService = getMemoryService();

// Get combined metrics for API usage
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const langchainMetrics = langchainService.getMetrics();
  const memoryMetrics = memoryService.getMemoryMetrics();
  
  // Overall API performance metrics
  const metrics = {
    langchain: langchainMetrics,
    memory: memoryMetrics,
    timestamp: new Date().toISOString()
  };
  
  res.json(metrics);
}));

// Get LangChain-specific metrics
router.get('/langchain', asyncHandler(async (req: Request, res: Response) => {
  const metrics = langchainService.getMetrics();
  res.json(metrics);
}));

// Get memory-specific metrics
router.get('/memory', asyncHandler(async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string | undefined;
  const metrics = memoryService.getMemoryMetrics(sessionId);
  res.json(metrics);
}));

// Clear LangChain cache
router.post('/langchain/clear-cache', asyncHandler(async (req: Request, res: Response) => {
  await langchainService.clearCache();
  res.json({ success: true, message: 'Cache cleared successfully' });
}));

// Clear memory for all sessions or a specific session
router.post('/memory/clear', asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.body;
  
  if (sessionId) {
    await memoryService.clearMemory(sessionId);
    res.json({ success: true, message: `Memory cleared for session ${sessionId}` });
  } else {
    // Clear all sessions (would require adding a clearAllMemory method to MemoryService)
    res.status(501).json({ success: false, message: 'Clearing all sessions not implemented yet' });
  }
}));

export default router; 