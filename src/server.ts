import express from 'express';
import dotenv from "dotenv";
import cookieParser from 'cookie-parser';
import {
  securityMiddleware,
  customSecurityHeaders,
  corsMiddleware,
  globalRateLimiter,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  handleCsrfError,
} from './shared/middleware';
import logger from './shared/utils/logger';
import { BadRequestError } from './shared/utils/errors';
import apiRoutes from './api';
import { getLangChainService } from './core/ai/langchain.service';

// Load environment variables
dotenv.config();

// Set environment
const NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3001;

// Log the environment
logger.info(`Server starting in ${NODE_ENV} mode...`);

// Apply middleware (order is important)
// 1. Security headers
app.use(securityMiddleware);
app.use(customSecurityHeaders);

// 2. CORS configuration
app.use(corsMiddleware);

// 3. Rate limiting
app.use(globalRateLimiter);

// 4. Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Required for CSRF tokens

// 5. Request logging
app.use((req, res, next) => {
  logger.logRequest(req);
  next();
});

// API routes
app.use('/api', apiRoutes);

// Basic route for testing
app.get('/', (req, res) => {
  res.json({ 
    message: 'API is running',
    env: NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Favicon route
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Error demonstration route
app.get('/api/error-demo', (req, res, next) => {
  try {
    const simulate = req.query.type as string;
    
    switch (simulate) {
      case 'operational':
        throw new BadRequestError('This is a simulated operational error');
      case 'unhandled':
        throw new Error('This is a simulated unhandled error');
      default:
        res.json({ message: 'No error simulation triggered. Use ?type=operational or ?type=unhandled' });
    }
  } catch (error) {
    next(error);
  }
});

// Example route using LangChain with async handler
app.get('/api/joke', asyncHandler(async (req, res) => {
  const langchainService = getLangChainService();
  
  const systemPrompt = 'You are a helpful assistant who tells programming jokes.';
  const userMessage = `Tell me a joke about ${req.query.language || 'TypeScript'}.`;
  
  const joke = await langchainService.generateChatResponse(systemPrompt, userMessage, {
    stream: req.query.stream === 'true'
  });
  
  res.json({ success: true, message: joke });
}));

// 404 handler for undefined routes - must come after all routes
app.use(notFoundHandler);

// CSRF error handler
app.use(handleCsrfError);

// Global error handler - must be the last middleware
app.use(errorHandler);

// Start the server and keep the process alive
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  console.log(`Server running on port ${PORT}`);
  console.log('Press Ctrl+C to stop the server');
});

// Properly handle termination signals
process.on('SIGINT', () => {
  logger.info('Gracefully shutting down from SIGINT (Ctrl+C)');
  console.log('\nGracefully shutting down from SIGINT (Ctrl+C)');
  server.close(() => {
    logger.info('Server closed');
    console.log('Server closed');
    process.exit(0);
  });
  
  // Force close if it takes too long
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise) => {
  logger.error('Unhandled Promise Rejection', { reason, promise });
  console.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
  // Application should continue running in production, but in development we might want to exit
  if (NODE_ENV === 'development') {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  console.error('Uncaught Exception:', error);
  // For uncaught exceptions, it's generally safer to exit the process
  // since the application might be in an inconsistent state
  process.exit(1);
});