import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

// Ensure logs directory exists
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log formats
const { combine, timestamp, printf, colorize, json } = winston.format;

// Custom format for console outputs
const consoleFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  printf(({ level, message, timestamp, ...meta }) => {
    return `${timestamp} ${level}: ${message} ${
      Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
    }`;
  })
);

// Format for file outputs (JSON for easier parsing)
const fileFormat = combine(
  timestamp(),
  json()
);

// Extend the winston Logger type with our custom methods
interface CustomLogger extends winston.Logger {
  logRequest: (req: Request, message?: string) => void;
  logError: (err: any, req?: Request) => void;
}

// Create the logger
const winstonLogger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  defaultMeta: { service: 'mp-bot-backend' },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // Error log file (errors only)
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Combined log file (all logs)
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Cast to our extended logger type
const logger = winstonLogger as CustomLogger;

// Helper method to log a request
logger.logRequest = (req: Request, message = 'Incoming request') => {
  if (process.env.NODE_ENV !== 'test') {
    logger.debug(message, {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }
};

// Helper method to log API errors
logger.logError = (err: any, req?: Request) => {
  const errorDetails: any = {
    message: err.message,
    stack: err.stack,
    statusCode: err.statusCode || 500,
  };

  // Add request details if available
  if (req) {
    errorDetails.method = req.method;
    errorDetails.url = req.originalUrl;
    errorDetails.ip = req.ip;
  }

  logger.error('API Error', errorDetails);
};

export default logger; 