import { securityMiddleware, customSecurityHeaders } from './security.middleware';
import { corsMiddleware } from './cors.middleware';
import { globalRateLimiter, authRateLimiter, apiKeysRateLimiter } from './rate-limit.middleware';
import { errorHandler, notFoundHandler, asyncHandler } from './error.middleware';
import { validate } from './validator.middleware';
import { authenticate, requireAdmin, handleAuthError, trackLoginAttempts } from './auth.middleware';
import { csrfProtection, handleCsrfError, csrfToken } from './csrf.middleware';
import { verifyPaymentSignature } from './payment.middleware';

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
export * from './auth.middleware';

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