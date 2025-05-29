import { securityMiddleware, customSecurityHeaders } from './security';
import { corsMiddleware } from './cors';
import { globalRateLimiter, authRateLimiter, apiKeysRateLimiter } from './rateLimiter';
import { errorHandler, notFoundHandler, asyncHandler } from './errorHandler';
import { validate } from './validator';
import { authenticate, requireAdmin, handleAuthError, trackLoginAttempts } from './auth';
import { csrfProtection, handleCsrfError, csrfToken } from './csrf';
import { verifyPaymentSignature } from './payment';

// Export all middleware functions for easy import in server.ts
export {
  // Security middleware
  securityMiddleware,
  customSecurityHeaders,
  
  // CORS middleware
  corsMiddleware,
  
  // Rate limiting middleware
  globalRateLimiter,
  authRateLimiter,
  apiKeysRateLimiter,
  
  // Error handling middleware
  errorHandler,
  notFoundHandler,
  asyncHandler,
  
  // Validation middleware
  validate,
  
  // Authentication middleware
  authenticate,
  requireAdmin,
  handleAuthError,
  trackLoginAttempts,
  
  // CSRF protection
  csrfProtection,
  handleCsrfError,
  csrfToken,
  
  // Payment middleware
  verifyPaymentSignature,
};

// Export auth middleware
export * from './auth';

// Export grouped middleware for convenience
export const rateLimiters = {
  global: globalRateLimiter,
  auth: authRateLimiter,
  apiKeys: apiKeysRateLimiter,
};

export const security = {
  csrf: csrfProtection,
  cors: corsMiddleware,
  headers: customSecurityHeaders,
};

export const auth = {
  authenticate,
  asyncHandler,
  trackLoginAttempts,
}; 