import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';

/**
 * Security middleware configuration using helmet
 * Sets various HTTP headers to help protect against common web vulnerabilities
 */
export const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  xssFilter: true,
  noSniff: true,
  referrerPolicy: { policy: 'same-origin' },
});

/**
 * Custom security headers middleware
 * Adds additional security headers not covered by helmet
 */
export const customSecurityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Add any additional custom security headers here
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}; 