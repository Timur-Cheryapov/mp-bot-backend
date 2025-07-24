import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import { notFoundHandler, errorHandler, asyncHandler } from '../../shared/middleware/error.middleware';
import { AppError, BadRequestError, UnauthorizedError, NotFoundError } from '../../shared/utils/errors';

// Mock logger
jest.mock('../../shared/utils/logger', () => ({
  logError: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

describe('Error Middleware', () => {
  let mockRequest: any;
  let mockResponse: any;
  let mockNext: any;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset NODE_ENV for each test
    delete (process.env as any).NODE_ENV;
    
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    
    mockRequest = {
      originalUrl: '/api/test',
      method: 'GET',
      url: '/api/test',
      headers: {}
    };
    
    mockResponse = {
      status: mockStatus,
      json: mockJson,
      statusCode: 200
    };
    
    mockNext = jest.fn();
  });

  afterEach(() => {
    // Clean up NODE_ENV after each test
    delete (process.env as any).NODE_ENV;
  });

  describe('notFoundHandler', () => {
    test('should create and pass 404 error to next middleware', () => {
      notFoundHandler(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      
      const passedError = mockNext.mock.calls[0][0];
      expect(passedError.message).toBe('Not Found - /api/test');
    });

    test('should handle requests with different URLs', () => {
      mockRequest.originalUrl = '/api/nonexistent';
      
      notFoundHandler(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      
      const passedError = mockNext.mock.calls[0][0];
      expect(passedError.message).toBe('Not Found - /api/nonexistent');
    });

    test('should handle requests without originalUrl', () => {
      mockRequest.originalUrl = undefined;
      
      notFoundHandler(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      
      const passedError = mockNext.mock.calls[0][0];
      expect(passedError.message).toBe('Not Found - undefined');
    });
  });

  describe('errorHandler', () => {
    const logger = require('../../shared/utils/logger');

    test('should handle AppError with custom status code in development', () => {
      process.env.NODE_ENV = 'development';
      const error = new BadRequestError('Invalid input');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(logger.logError).toHaveBeenCalledWith(error, mockRequest);
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Invalid input',
        stack: error.stack,
        isOperational: true
      });
    });

    test('should handle AppError in production with less details', () => {
      process.env.NODE_ENV = 'production';
      const error = new UnauthorizedError('Access denied');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(logger.logError).toHaveBeenCalledWith(error, mockRequest);
      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Access denied'
      });
    });

    test('should handle regular Error with 500 status code', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Database connection failed');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(logger.logError).toHaveBeenCalledWith(error, mockRequest);
      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Database connection failed',
        stack: error.stack,
        isOperational: false
      });
    });

    test('should use generic message for non-operational errors in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Internal database error');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(logger.logError).toHaveBeenCalledWith(error, mockRequest);
      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Something went wrong'
      });
    });

    test('should use response statusCode when it is not 200', () => {
      process.env.NODE_ENV = 'development';
      mockResponse.statusCode = 422;
      const error = new Error('Validation failed');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockStatus).toHaveBeenCalledWith(422);
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Validation failed',
        stack: error.stack,
        isOperational: false
      });
    });

    test('should handle error without message', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error();
      error.message = '';
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Something went wrong',
        stack: error.stack,
        isOperational: false
      });
    });

    test('should handle NotFoundError correctly', () => {
      process.env.NODE_ENV = 'development';
      const error = new NotFoundError('Resource not found');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Resource not found',
        stack: error.stack,
        isOperational: true
      });
    });

    test('should handle error when NODE_ENV is not set (defaults to production)', () => {
      // NODE_ENV is undefined by default
      const error = new Error('Unhandled error');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Something went wrong' // Generic message for non-operational errors
      });
    });

    test('should include isOperational flag correctly for custom AppErrors', () => {
      process.env.NODE_ENV = 'development';
      
      // Test operational error
      const operationalError = new BadRequestError('Bad request');
      errorHandler(operationalError, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Bad request',
        stack: operationalError.stack,
        isOperational: true
      });
    });
  });

  describe('asyncHandler', () => {
    test('should wrap function and catch async errors', async () => {
      // Test that asyncHandler creates a wrapper function
      const testFunction = async () => 'success';
      const wrappedFunction = asyncHandler(testFunction);
      
      expect(typeof wrappedFunction).toBe('function');
      
      // Test error catching
      const errorFunction = async () => {
        throw new Error('Test error');
      };
      const wrappedErrorFunction = asyncHandler(errorFunction);
      
      // Should not throw when called
      await wrappedErrorFunction(mockRequest, mockResponse, mockNext);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    test('should handle Promise rejection', async () => {
      const errorFunction = () => Promise.reject(new Error('Rejected promise'));
      const wrappedFunction = asyncHandler(errorFunction);
      
      await wrappedFunction(mockRequest, mockResponse, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('integration scenarios', () => {
    test('should work together: notFoundHandler -> errorHandler', () => {
      process.env.NODE_ENV = 'development';
      
      // First, notFoundHandler creates the error
      notFoundHandler(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      
      // Then errorHandler processes the error
      const error = mockNext.mock.calls[0][0];
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Not Found - /api/test',
        stack: error.stack,
        isOperational: false
      });
    });

    test('should work together: asyncHandler catches and forwards error to errorHandler', async () => {
      process.env.NODE_ENV = 'development';
      
      // Create an error that would be caught by asyncHandler
      const error = new BadRequestError('Invalid data');
      
      // Simulate asyncHandler forwarding error to errorHandler
      errorHandler(error, mockRequest, mockResponse, mockNext);
      
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Invalid data',
        stack: error.stack,
        isOperational: true
      });
    });
  });
}); 