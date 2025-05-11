import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '../services/supabase';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import logger from '../utils/logger';

// Extend Express Request interface to include user information
declare global {
  namespace Express {
    interface Request {
      user?: any;
      session?: any;
    }
  }
}

/**
 * Middleware to check if user is authenticated
 * Verifies the JWT token and attaches user info to request
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supabase = getSupabaseClient();
    
    // Get the session from cookies or headers
    const { data, error } = await supabase.auth.getSession();
    
    if (error || !data.session) {
      throw new UnauthorizedError('Authentication required');
    }
    
    // Store user info in request
    req.user = data.session.user;
    req.session = data.session;
    
    next();
  } catch (error) {
    logger.error('Authentication error', {
      error: error instanceof Error ? error.message : String(error),
      path: req.originalUrl
    });
    
    next(new UnauthorizedError('Authentication required'));
  }
};

/**
 * Middleware to check if user has admin role
 * Must be used after authenticate middleware
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Ensure user is authenticated first
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }
    
    // Check if user has admin role
    if (req.user.user_metadata?.role !== 'admin') {
      throw new ForbiddenError('Admin access required');
    }
    
    next();
  } catch (error) {
    logger.error('Authorization error', {
      error: error instanceof Error ? error.message : String(error),
      userId: req.user?.id,
      path: req.originalUrl
    });
    
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return next(error);
    }
    
    next(new ForbiddenError('Admin access required'));
  }
};

/**
 * Handle JWT errors from Supabase Auth
 * Can be added as global error handler middleware
 */
export const handleAuthError = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Check if error is from Supabase Auth
  if (err?.message?.includes('JWT')) {
    return next(new UnauthorizedError('Invalid or expired token'));
  }
  
  next(err);
}; 