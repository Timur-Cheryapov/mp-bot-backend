import { Response } from 'express';
import logger from './logger';
import { AppError } from './errors';

/**
 * Handles error responses with consistent format and logging
 * @param error - The error to handle
 * @param res - Express response object
 * @param operation - Description of the operation that failed
 */
export function handleErrorResponse(error: unknown, res: Response, operation: string): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error(`Error in ${operation}: ${errorMessage}`);
  
  // Handle custom app errors
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.message,
      details: errorMessage
    });
    return;
  }
  
  // Determine the appropriate error status code based on error message
  if (errorMessage.includes('Access denied') || errorMessage.includes('permission')) {
    res.status(403).json({ 
      error: 'Access denied',
      details: errorMessage
    });
  } else if (errorMessage.includes('not found')) {
    res.status(404).json({ 
      error: 'Not found',
      details: errorMessage
    });
  } else {
    res.status(500).json({
      error: `Failed to ${operation}`,
      details: errorMessage
    });
  }
}

/**
 * Validates required fields in request body
 * @param body - Request body to validate
 * @param requiredFields - Array of required field names
 * @returns Error message if validation fails, null if valid
 */
export function validateRequiredFields(body: any, requiredFields: string[]): string | null {
  for (const field of requiredFields) {
    if (!body[field]) {
      return `${field} is required`;
    }
  }
  return null;
} 