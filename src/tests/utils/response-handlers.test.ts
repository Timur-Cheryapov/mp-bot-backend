import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { Response } from 'express';
import { handleErrorResponse, validateRequiredFields } from '../../shared/utils/response-handlers';
import { AppError, BadRequestError, UnauthorizedError, NotFoundError } from '../../shared/utils/errors';

// Mock logger
jest.mock('../../shared/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

describe('Response Handlers', () => {
  let mockResponse: any;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    
    mockResponse = {
      status: mockStatus,
      json: mockJson
    };
  });

  describe('handleErrorResponse', () => {
    test('should handle AppError with custom status code', () => {
      const error = new BadRequestError('Invalid input provided');
      
      handleErrorResponse(error, mockResponse as Response, 'test operation');
      
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Invalid input provided',
        details: 'Invalid input provided'
      });
    });

    test('should handle UnauthorizedError', () => {
      const error = new UnauthorizedError('Token expired');
      
      handleErrorResponse(error, mockResponse as Response, 'authentication');
      
      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Token expired',
        details: 'Token expired'
      });
    });

    test('should handle access denied errors', () => {
      const error = new Error('Access denied to resource');
      
      handleErrorResponse(error, mockResponse as Response, 'resource access');
      
      expect(mockStatus).toHaveBeenCalledWith(403);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Access denied',
        details: 'Access denied to resource'
      });
    });

    test('should handle permission errors', () => {
      const error = new Error('Insufficient permission to perform action');
      
      handleErrorResponse(error, mockResponse as Response, 'action execution');
      
      expect(mockStatus).toHaveBeenCalledWith(403);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Access denied',
        details: 'Insufficient permission to perform action'
      });
    });

    test('should handle not found errors', () => {
      const error = new Error('Resource not found in database');
      
      handleErrorResponse(error, mockResponse as Response, 'database query');
      
      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Not found',
        details: 'Resource not found in database'
      });
    });

    test('should handle generic errors with 500 status', () => {
      const error = new Error('Database connection failed');
      
      handleErrorResponse(error, mockResponse as Response, 'connect to database');
      
      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Failed to connect to database',
        details: 'Database connection failed'
      });
    });

    test('should handle non-Error instances', () => {
      const error = 'String error message';
      
      handleErrorResponse(error, mockResponse as Response, 'process request');
      
      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Failed to process request',
        details: 'String error message'
      });
    });

    test('should log errors properly', () => {
      const logger = require('../../shared/utils/logger');
      const error = new Error('Test error for logging');
      
      handleErrorResponse(error, mockResponse as Response, 'test logging');
      
      expect(logger.error).toHaveBeenCalledWith('Error in test logging: Test error for logging');
    });
  });

  describe('validateRequiredFields', () => {
    test('should return null for valid body with all required fields', () => {
      const body = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      };
      const requiredFields = ['name', 'email', 'age'];
      
      const result = validateRequiredFields(body, requiredFields);
      
      expect(result).toBeNull();
    });

    test('should return error message for missing field', () => {
      const body = {
        name: 'John Doe',
        age: 30
      };
      const requiredFields = ['name', 'email', 'age'];
      
      const result = validateRequiredFields(body, requiredFields);
      
      expect(result).toBe('email is required');
    });

    test('should return error message for empty string field', () => {
      const body = {
        name: 'John Doe',
        email: '',
        age: 30
      };
      const requiredFields = ['name', 'email', 'age'];
      
      const result = validateRequiredFields(body, requiredFields);
      
      expect(result).toBe('email is required');
    });

    test('should handle empty required fields array', () => {
      const body = {
        name: 'John Doe',
        email: 'john@example.com'
      };
      const requiredFields: string[] = [];
      
      const result = validateRequiredFields(body, requiredFields);
      
      expect(result).toBeNull();
    });

    test('should handle empty body object', () => {
      const body = {};
      const requiredFields = ['name', 'email'];
      
      const result = validateRequiredFields(body, requiredFields);
      
      expect(result).toBe('name is required');
    });

    test('should treat falsy values as missing fields', () => {
      const body = {
        name: 'John Doe',
        age: 0,
        active: false
      };
      const requiredFields = ['name', 'age', 'active'];
      
      const result = validateRequiredFields(body, requiredFields);
      
      expect(result).toBe('age is required'); // 0 is falsy and treated as missing
    });

    test('should accept truthy values', () => {
      const body = {
        name: 'John Doe',
        age: 25,
        active: true,
        count: 1
      };
      const requiredFields = ['name', 'age', 'active', 'count'];
      
      const result = validateRequiredFields(body, requiredFields);
      
      expect(result).toBeNull();
    });
  });
});