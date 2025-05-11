import cors from 'cors';

/**
 * CORS configuration options
 * Controls which origins, methods, and headers are allowed for cross-origin requests
 */
export const corsOptions = {
  // Allow requests from these origins
  origin: [
    'http://localhost:3000',   // Local development frontend
    'http://localhost:8000',   // Alternative local development port
    'https://mp-bot-frontend.vercel.app', // Production frontend (example)
  ],
  // Set to true if you want to allow credentials (cookies, authorization headers)
  credentials: true,
  // Allowed HTTP methods
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  // Allowed request headers
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-CSRF-Token',
  ],
  // Expose these response headers to the client
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  // Cache preflight requests for 1 hour (3600 seconds)
  maxAge: 3600,
};

/**
 * CORS middleware using the configured options
 */
export const corsMiddleware = cors(corsOptions); 