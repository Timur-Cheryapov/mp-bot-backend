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

// Store for failed login attempts
const failedLoginAttempts: { [key: string]: { count: number, lastAttempt: number } } = {};
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

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

/**
 * Track failed login attempts and implement account lockout
 * Should be used as middleware before the login controller
 */
export const trackLoginAttempts = (req: Request, res: Response, next: NextFunction) => {
  const email = req.body.email?.toLowerCase();
  
  // Skip tracking if no email provided
  if (!email) {
    return next();
  }
  
  // Check if account is locked
  const attempts = failedLoginAttempts[email];
  if (attempts && attempts.count >= MAX_FAILED_ATTEMPTS) {
    const timeSinceLast = Date.now() - attempts.lastAttempt;
    
    // If lockout period hasn't expired
    if (timeSinceLast < LOCKOUT_DURATION) {
      const minutesLeft = Math.ceil((LOCKOUT_DURATION - timeSinceLast) / (60 * 1000));
      
      logger.warn('Attempt to access locked account', {
        email,
        ip: req.ip,
        remainingLockTime: minutesLeft
      });
      
      res.status(429).json({
        status: 'error',
        message: `Account temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minutes.`
      });
      return;
    } else {
      // Lockout period expired, reset attempts
      delete failedLoginAttempts[email];
    }
  }
  
  // Store original login function
  const originalSend = res.send;
  
  // Override send to track login failures
  res.send = function(body) {
    // Convert body to string if it's not already
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    
    // Check if response indicates login failure
    if (res.statusCode === 401 || bodyStr.includes('Invalid email or password')) {
      // Track failed attempt
      if (!failedLoginAttempts[email]) {
        failedLoginAttempts[email] = { count: 0, lastAttempt: Date.now() };
      }
      
      failedLoginAttempts[email].count += 1;
      failedLoginAttempts[email].lastAttempt = Date.now();
      
      const attemptsLeft = MAX_FAILED_ATTEMPTS - failedLoginAttempts[email].count;
      
      if (attemptsLeft <= 0) {
        // Account is now locked
        logger.warn('Account locked due to too many failed attempts', {
          email,
          ip: req.ip,
          lockoutDuration: LOCKOUT_DURATION / (60 * 1000)
        });
        
        const response = {
          status: 'error',
          message: `Account temporarily locked due to too many failed attempts. Try again in ${LOCKOUT_DURATION / (60 * 1000)} minutes.`
        };
        
        // Send lockout response
        return originalSend.call(this, JSON.stringify(response));
      } else if (attemptsLeft <= 2) {
        // Warn user about remaining attempts
        const response = JSON.parse(bodyStr);
        response.attemptsLeft = attemptsLeft;
        return originalSend.call(this, JSON.stringify(response));
      }
    } else if (res.statusCode === 200 && bodyStr.includes('Login successful')) {
      // Successful login, reset failed attempts
      delete failedLoginAttempts[email];
    }
    
    // Call the original send method with the original body
    return originalSend.call(this, body);
  };
  
  next();
}; 