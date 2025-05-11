import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import logger from '../utils/logger';

/**
 * Not Found Error Handler
 * Catches 404 errors when no routes match the request
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Global Error Handler
 * Processes all errors that occur in the application
 */
export const errorHandler = (
  err: Error | AppError, 
  req: Request, 
  res: Response, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  // Log the error
  logger.logError(err, req);

  // Determine if this is an operational error (expected) or programming error (unexpected)
  const isOperationalError = err instanceof AppError && err.isOperational;
  
  // Get statusCode from the error if available, otherwise use the response statusCode if it's not 200, or default to 500
  const statusCode = (err as AppError).statusCode || (res.statusCode !== 200 ? res.statusCode : 500);
  
  // Send detailed errors in development, less details in production
  const isDev = process.env.NODE_ENV === 'development';
  
  // Create response object
  const errorResponse: any = {
    status: 'error',
    message: err.message || 'Something went wrong',
  };
  
  // Include stack trace and additional details in development
  if (isDev) {
    errorResponse.stack = err.stack;
    errorResponse.isOperational = isOperationalError;
  }
  
  // If this was an unexpected error in production, use a generic message
  if (!isDev && !isOperationalError) {
    errorResponse.message = 'Something went wrong';
  }
  
  res.status(statusCode).json(errorResponse);
};

/**
 * Async Error Handler Wrapper
 * Wraps async route handlers to catch and forward errors to the error middleware
 */
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}; 