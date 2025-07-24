import { describe, test, expect } from '@jest/globals';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InternalServerError,
  ServiceUnavailableError
} from '../../shared/utils/errors';

describe('Error Classes', () => {
  describe('AppError', () => {
    test('should create AppError with message and status code', () => {
      const error = new AppError('Test error message', 418);
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Test error message');
      expect(error.statusCode).toBe(418);
      expect(error.isOperational).toBe(true);
      expect(error.stack).toBeDefined();
    });

    test('should maintain proper prototype chain', () => {
      const error = new AppError('Test', 500);
      
      expect(error.constructor).toBe(AppError);
      expect(Object.getPrototypeOf(error)).toBe(AppError.prototype);
    });

    test('should capture stack trace', () => {
      const error = new AppError('Test error', 500);
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Test error');
    });
  });

  describe('BadRequestError', () => {
    test('should create BadRequestError with default message', () => {
      const error = new BadRequestError();
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(BadRequestError);
      expect(error.message).toBe('Bad request');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
    });

    test('should create BadRequestError with custom message', () => {
      const error = new BadRequestError('Invalid input provided');
      
      expect(error.message).toBe('Invalid input provided');
      expect(error.statusCode).toBe(400);
    });

    test('should maintain proper prototype chain', () => {
      const error = new BadRequestError();
      
      expect(error.constructor).toBe(BadRequestError);
      expect(Object.getPrototypeOf(error)).toBe(BadRequestError.prototype);
      expect(error instanceof AppError).toBe(true);
    });
  });

  describe('UnauthorizedError', () => {
    test('should create UnauthorizedError with default message', () => {
      const error = new UnauthorizedError();
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toBe('Unauthorized access');
      expect(error.statusCode).toBe(401);
      expect(error.isOperational).toBe(true);
    });

    test('should create UnauthorizedError with custom message', () => {
      const error = new UnauthorizedError('Token expired');
      
      expect(error.message).toBe('Token expired');
      expect(error.statusCode).toBe(401);
    });

    test('should maintain proper prototype chain', () => {
      const error = new UnauthorizedError();
      
      expect(error.constructor).toBe(UnauthorizedError);
      expect(Object.getPrototypeOf(error)).toBe(UnauthorizedError.prototype);
      expect(error instanceof AppError).toBe(true);
    });
  });

  describe('ForbiddenError', () => {
    test('should create ForbiddenError with default message', () => {
      const error = new ForbiddenError();
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.message).toBe('Forbidden: insufficient permissions');
      expect(error.statusCode).toBe(403);
      expect(error.isOperational).toBe(true);
    });

    test('should create ForbiddenError with custom message', () => {
      const error = new ForbiddenError('Admin access required');
      
      expect(error.message).toBe('Admin access required');
      expect(error.statusCode).toBe(403);
    });

    test('should maintain proper prototype chain', () => {
      const error = new ForbiddenError();
      
      expect(error.constructor).toBe(ForbiddenError);
      expect(Object.getPrototypeOf(error)).toBe(ForbiddenError.prototype);
      expect(error instanceof AppError).toBe(true);
    });
  });

  describe('NotFoundError', () => {
    test('should create NotFoundError with default message', () => {
      const error = new NotFoundError();
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
      expect(error.isOperational).toBe(true);
    });

    test('should create NotFoundError with custom message', () => {
      const error = new NotFoundError('User not found');
      
      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(404);
    });

    test('should maintain proper prototype chain', () => {
      const error = new NotFoundError();
      
      expect(error.constructor).toBe(NotFoundError);
      expect(Object.getPrototypeOf(error)).toBe(NotFoundError.prototype);
      expect(error instanceof AppError).toBe(true);
    });
  });

  describe('ConflictError', () => {
    test('should create ConflictError with default message', () => {
      const error = new ConflictError();
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ConflictError);
      expect(error.message).toBe('Resource conflict');
      expect(error.statusCode).toBe(409);
      expect(error.isOperational).toBe(true);
    });

    test('should create ConflictError with custom message', () => {
      const error = new ConflictError('Email already exists');
      
      expect(error.message).toBe('Email already exists');
      expect(error.statusCode).toBe(409);
    });

    test('should maintain proper prototype chain', () => {
      const error = new ConflictError();
      
      expect(error.constructor).toBe(ConflictError);
      expect(Object.getPrototypeOf(error)).toBe(ConflictError.prototype);
      expect(error instanceof AppError).toBe(true);
    });
  });

  describe('InternalServerError', () => {
    test('should create InternalServerError with default message', () => {
      const error = new InternalServerError();
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(InternalServerError);
      expect(error.message).toBe('Internal server error');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
    });

    test('should create InternalServerError with custom message', () => {
      const error = new InternalServerError('Database connection failed');
      
      expect(error.message).toBe('Database connection failed');
      expect(error.statusCode).toBe(500);
    });

    test('should maintain proper prototype chain', () => {
      const error = new InternalServerError();
      
      expect(error.constructor).toBe(InternalServerError);
      expect(Object.getPrototypeOf(error)).toBe(InternalServerError.prototype);
      expect(error instanceof AppError).toBe(true);
    });
  });

  describe('ServiceUnavailableError', () => {
    test('should create ServiceUnavailableError with default message', () => {
      const error = new ServiceUnavailableError();
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ServiceUnavailableError);
      expect(error.message).toBe('Service temporarily unavailable');
      expect(error.statusCode).toBe(503);
      expect(error.isOperational).toBe(true);
    });

    test('should create ServiceUnavailableError with custom message', () => {
      const error = new ServiceUnavailableError('Maintenance mode active');
      
      expect(error.message).toBe('Maintenance mode active');
      expect(error.statusCode).toBe(503);
    });

    test('should maintain proper prototype chain', () => {
      const error = new ServiceUnavailableError();
      
      expect(error.constructor).toBe(ServiceUnavailableError);
      expect(Object.getPrototypeOf(error)).toBe(ServiceUnavailableError.prototype);
      expect(error instanceof AppError).toBe(true);
    });
  });

  describe('Error inheritance and polymorphism', () => {
    test('should allow all errors to be caught as AppError', () => {
      const errors = [
        new BadRequestError('Bad request'),
        new UnauthorizedError('Unauthorized'),
        new ForbiddenError('Forbidden'),
        new NotFoundError('Not found'),
        new ConflictError('Conflict'),
        new InternalServerError('Server error'),
        new ServiceUnavailableError('Unavailable')
      ];

      errors.forEach(error => {
        expect(error instanceof AppError).toBe(true);
        expect(error.isOperational).toBe(true);
        expect(error.statusCode).toBeGreaterThan(0);
        expect(error.message).toBeDefined();
        expect(error.stack).toBeDefined();
      });
    });

    test('should allow errors to be caught as native Error', () => {
      const errors = [
        new AppError('Generic app error', 500),
        new BadRequestError(),
        new UnauthorizedError(),
        new NotFoundError()
      ];

      errors.forEach(error => {
        expect(error instanceof Error).toBe(true);
        expect(error.name).toBeDefined();
        expect(error.message).toBeDefined();
        expect(error.stack).toBeDefined();
      });
    });

    test('should differentiate between error types', () => {
      const badRequest = new BadRequestError();
      const notFound = new NotFoundError();
      const serverError = new InternalServerError();

      expect(badRequest instanceof BadRequestError).toBe(true);
      expect(badRequest instanceof NotFoundError).toBe(false);
      expect(badRequest instanceof InternalServerError).toBe(false);

      expect(notFound instanceof NotFoundError).toBe(true);
      expect(notFound instanceof BadRequestError).toBe(false);

      expect(serverError instanceof InternalServerError).toBe(true);
      expect(serverError instanceof BadRequestError).toBe(false);
    });
  });
}); 