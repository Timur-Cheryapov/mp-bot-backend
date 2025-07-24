# Middleware Documentation

## Overview

The middleware layer provides cross-cutting concerns like security, authentication, rate limiting, and error handling. Middleware is applied in a specific order to ensure proper request processing.

## Middleware Stack Order

```typescript
// Applied in server.ts
app.use(securityMiddleware);        // 1. Security headers
app.use(customSecurityHeaders);     // 2. Additional security
app.use(corsMiddleware);            // 3. CORS configuration
app.use(globalRateLimiter);         // 4. Rate limiting
app.use(express.json());            // 5. Body parsing
app.use(express.urlencoded());      // 6. URL encoding
app.use(cookieParser());            // 7. Cookie parsing
app.use(requestLogging);            // 8. Request logging

// Route-specific middleware
app.use('/api', csrfProtection);    // CSRF for API routes
app.use('/api/auth', authRateLimiter);  // Auth-specific limits
app.use(authenticate);              // Authentication check
app.use(notFoundHandler);           // 404 handling
app.use(handleCsrfError);           // CSRF error handling
app.use(errorHandler);              // Global error handler
```

---

## Security Middleware (`src/shared/middleware/security.middleware.ts`)

### Helmet Security Headers

```typescript
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
```

**Features:**
- **XSS Protection**: Prevents cross-site scripting attacks
- **MIME Sniffing Prevention**: Blocks content-type confusion attacks
- **Content Security Policy**: Restricts resource loading
- **Referrer Policy**: Controls referrer information

### Custom Security Headers

```typescript
export const customSecurityHeaders = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
};
```

**Additional Headers:**
- **Permissions Policy**: Restricts browser feature access
- Extensible for additional custom headers

---

## CORS Middleware (`src/shared/middleware/cors.middleware.ts`)

### Configuration

```typescript
export const corsOptions = {
  origin: [
    'http://localhost:3000',   // Local development
    'http://localhost:3001',   // Alternative port
    'https://mp-bot-frontend.vercel.app', // Production
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-CSRF-Token',
  ],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 3600, // Cache preflight for 1 hour
};
```

**Features:**
- **Origin Whitelisting**: Only allowed origins can access the API
- **Credential Support**: Enables cookies and authorization headers
- **Header Control**: Specifies allowed request/response headers
- **Preflight Caching**: Reduces OPTIONS request overhead

---

## Rate Limiting Middleware (`src/shared/middleware/rate-limit.middleware.ts`)

### Global Rate Limiter

```typescript
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100,               // 100 requests per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    status: 429,
    message: 'Too many requests, please try again later.',
  }
});
```

### Authentication Rate Limiter

```typescript
export const authRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,                 // 5 attempts per hour
  message: {
    status: 429,
    message: 'Too many login attempts. Please try again later.',
  }
});
```

### API Keys Rate Limiter

```typescript
export const apiKeysRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,                // 20 requests per window
  message: {
    status: 429,
    message: 'Too many API key requests, please try again later.',
  }
});
```

**Rate Limit Tiers:**
- **Global**: 100 requests / 15 minutes
- **Authentication**: 5 attempts / hour (prevents brute force)
- **API Keys**: 20 requests / 15 minutes (prevents key enumeration)

**Headers Sent:**
- `RateLimit-Limit`: Maximum requests in window
- `RateLimit-Remaining`: Requests remaining in current window
- `RateLimit-Reset`: Window reset time

---

## Authentication Middleware (`src/shared/middleware/auth.middleware.ts`)

### Authentication Check

```typescript
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supabase = getSupabaseClient();
    
    // Get session from Supabase
    const { data, error } = await supabase.auth.getSession();
    
    if (error || !data.session) {
      throw new UnauthorizedError('Authentication required');
    }
    
    // Attach user info to request
    req.user = data.session.user;
    req.session = data.session;
    
    next();
  } catch (error) {
    res.status(401);
    next(new UnauthorizedError('Authentication required'));
  }
};
```

### Admin Authorization

```typescript
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }
  
  if (req.user.user_metadata?.role !== 'admin') {
    throw new ForbiddenError('Admin access required');
  }
  
  next();
};
```

### Login Attempt Tracking

```typescript
export const trackLoginAttempts = (req: Request, res: Response, next: NextFunction) => {
  const email = req.body.email?.toLowerCase();
  
  // Check if account is locked
  const attempts = failedLoginAttempts[email];
  if (attempts && attempts.count >= MAX_FAILED_ATTEMPTS) {
    const timeSinceLast = Date.now() - attempts.lastAttempt;
    
    if (timeSinceLast < LOCKOUT_DURATION) {
      const minutesLeft = Math.ceil((LOCKOUT_DURATION - timeSinceLast) / (60 * 1000));
      
      res.status(429).json({
        status: 'error',
        message: `Account temporarily locked. Try again in ${minutesLeft} minutes.`
      });
      return;
    }
  }
  
  // Override response to track failures
  const originalSend = res.send;
  res.send = function(body) {
    // Track failed attempts on 401 responses
    if (res.statusCode === 401) {
      if (!failedLoginAttempts[email]) {
        failedLoginAttempts[email] = { count: 0, lastAttempt: Date.now() };
      }
      failedLoginAttempts[email].count += 1;
      failedLoginAttempts[email].lastAttempt = Date.now();
    }
    
    return originalSend.call(this, body);
  };
  
  next();
};
```

**Features:**
- **JWT Validation**: Verifies Supabase session tokens
- **User Context**: Attaches user info to request object
- **Account Lockout**: Prevents brute force attacks
- **Admin Routes**: Role-based access control
- **Security Logging**: Tracks authentication events

---

## CSRF Protection (`src/shared/middleware/csrf.middleware.ts`)

### CSRF Configuration

```typescript
const csrfProtection = csrf({
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
  }
});
```

### Error Handling

```typescript
export const handleCsrfError = (err: CSRFError, req: Request, res: Response, next: NextFunction) => {
  if (err.code === 'EBADCSRFTOKEN') {
    logger.warn('CSRF attempt detected', {
      ip: req.ip,
      method: req.method,
      url: req.originalUrl,
    });
    
    res.status(403).json({
      status: 'error',
      message: 'Invalid or missing CSRF token',
    });
    return;
  }
  
  next(err);
};
```

### Token Provider

```typescript
export const csrfToken = (req: Request, res: Response, next: NextFunction) => {
  res.locals.csrfToken = req.csrfToken();
  next();
};
```

**Features:**
- **State-Changing Protection**: Protects POST, PUT, DELETE operations
- **Secure Cookies**: Uses secure, httpOnly cookies in production
- **Attack Logging**: Logs potential CSRF attempts
- **Token Generation**: Provides tokens for frontend use

---

## Error Handling Middleware (`src/shared/middleware/error.middleware.ts`)

### Async Handler Wrapper

```typescript
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
```

### 404 Handler

```typescript
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};
```

### Global Error Handler

```typescript
export const errorHandler = (
  err: Error | AppError, 
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  // Log the error
  logger.logError(err, req);

  const isOperationalError = err instanceof AppError && err.isOperational;
  const statusCode = (err as AppError).statusCode || 
                    (res.statusCode !== 200 ? res.statusCode : 500);
  
  const isDev = process.env.NODE_ENV === 'development';
  
  const errorResponse: any = {
    status: 'error',
    message: err.message || 'Something went wrong',
  };
  
  // Include stack trace in development
  if (isDev) {
    errorResponse.stack = err.stack;
    errorResponse.isOperational = isOperationalError;
  }
  
  // Use generic message for unexpected errors in production
  if (!isDev && !isOperationalError) {
    errorResponse.message = 'Something went wrong';
  }
  
  res.status(statusCode).json(errorResponse);
};
```

**Features:**
- **Async Error Catching**: Automatically catches promise rejections
- **404 Handling**: Catches unmatched routes
- **Error Classification**: Distinguishes operational vs programming errors
- **Environment-Aware**: Different error details for dev vs production
- **Structured Logging**: Comprehensive error logging

---

## Validation Middleware (`src/shared/middleware/validator.middleware.ts`)

### Express Validator Integration

```typescript
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Execute all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    
    if (errors.isEmpty()) {
      return next();
    }

    // Format errors for response
    const formattedErrors = errors.array().map(err => ({
      field: err.path || 'unknown',
      message: err.msg,
    }));

    const badRequestError = new BadRequestError('Validation failed');
    (badRequestError as any).validationErrors = formattedErrors;
    
    next(badRequestError);
  };
};
```

**Features:**
- **Schema Validation**: Uses express-validator for request validation
- **Error Formatting**: Provides user-friendly validation error messages
- **Field-Specific**: Shows which fields failed validation
- **Integration**: Works with global error handler

### Usage Example

```typescript
import { body } from 'express-validator';
import { validate } from '../middleware/validator.middleware';

const signupValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
];

router.post('/signup', validate(signupValidation), authController.signup);
```

---

## Payment Middleware (`src/shared/middleware/payment.middleware.ts`)

### Payment Signature Verification

```typescript
export const verifyPaymentSignature = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Currently disabled - placeholder for payment webhook verification
    // if (!req.headers['x-payment-signature']) {
    //   throw new ForbiddenError('Payment signature required');
    // }
    
    next();
  } catch (error) {
    logger.error('Payment signature verification error', {
      error: error instanceof Error ? error.message : String(error),
      path: req.originalUrl
    });
    
    next(new ForbiddenError('Payment signature verification failed'));
  }
};
```

**Purpose:** Verifies webhook signatures from payment providers (placeholder implementation)

---

## Middleware Usage Patterns

### Route-Specific Middleware

```typescript
// Authentication required
router.get('/protected', authenticate, handler);

// Admin only
router.delete('/admin-only', authenticate, requireAdmin, handler);

// Rate limiting
router.post('/limited', apiKeysRateLimiter, handler);

// Validation
router.post('/validated', validate(schema), handler);

// Multiple middleware
router.post('/secure', 
  authRateLimiter,
  authenticate, 
  csrfProtection,
  validate(schema),
  asyncHandler(handler)
);
```

### Global Middleware

```typescript
// Applied to all routes
app.use(securityMiddleware);
app.use(corsMiddleware);
app.use(globalRateLimiter);

// Applied to API routes only
app.use('/api', csrfProtection);
```

### Error Middleware

```typescript
// Must be last middleware
app.use(notFoundHandler);
app.use(handleCsrfError);
app.use(errorHandler);
```

---

## Security Considerations

### Request Processing Security
1. **Security headers** applied first
2. **CORS** validates origins
3. **Rate limiting** prevents abuse
4. **CSRF protection** on state-changing operations
5. **Authentication** validates users
6. **Validation** sanitizes input

### Error Handling Security
- Production errors don't expose stack traces
- Operational vs programming error classification
- Comprehensive logging for security monitoring
- Rate limiting on authentication attempts

### Headers and Cookies
- Secure cookies in production
- HttpOnly flags to prevent XSS
- SameSite strict for CSRF protection
- Proper Content Security Policy 