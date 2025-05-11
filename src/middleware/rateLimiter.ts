import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Global API rate limiter
 * Limits the number of requests a client can make within a specified time window
 */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 requests per window
  standardHeaders: 'draft-7', // Use draft-7 standard rate limit headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    status: 429,
    message: 'Too many requests, please try again later.',
  },
  // Custom handler for rate limit exceeded
  handler: (
    req: Request,
    res: Response
  ) => {
    res.status(429).json({
      status: 'error',
      message: 'Too many requests, please try again later.',
      retryAfter: Math.ceil(15), // Return minutes to wait
    });
  },
});

/**
 * Authentication rate limiter
 * Stricter limits for authentication endpoints to prevent brute force attacks
 */
export const authRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5, // 5 attempts per hour
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    status: 429,
    message: 'Too many login attempts. Please try again later.',
  },
  handler: (
    req: Request,
    res: Response
  ) => {
    res.status(429).json({
      status: 'error',
      message: 'Too many login attempts. Please try again later.',
      retryAfter: Math.ceil(60), // Return minutes to wait
    });
  },
}); 