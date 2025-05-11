import csrf from 'csurf';
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

// Interface for CSRF errors
interface CSRFError extends Error {
  code?: string;
}

/**
 * CSRF protection middleware configuration
 * Prevents Cross-Site Request Forgery attacks
 */
const csrfProtection = csrf({
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
  }
});

/**
 * Error handler for CSRF errors
 */
export const handleCsrfError = (err: CSRFError, req: Request, res: Response, next: NextFunction) => {
  if (err.code === 'EBADCSRFTOKEN') {
    // Log the CSRF attempt
    logger.warn('CSRF attempt detected', {
      ip: req.ip,
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
    });
    
    res.status(403).json({
      status: 'error',
      message: 'Invalid or missing CSRF token',
    });
    return;
  }
  
  // If it's not a CSRF error, pass it along to the next error handler
  next(err);
};

/**
 * Middleware to provide CSRF token for client
 */
export const csrfToken = (req: Request, res: Response, next: NextFunction) => {
  res.locals.csrfToken = req.csrfToken();
  next();
};

export { csrfProtection }; 