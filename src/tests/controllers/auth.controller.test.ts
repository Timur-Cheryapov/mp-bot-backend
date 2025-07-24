import { Request, Response } from 'express';
import { authController } from '../../api/auth/auth.controller';
import { authService } from '../../core/auth/auth.service';

// Mock the auth service
jest.mock('../../core/auth/auth.service', () => ({
  authService: {
    signup: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    resetPassword: jest.fn(),
    updatePassword: jest.fn(),
  },
}));

// Mock the logger
jest.mock('../../shared/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

describe('Auth Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock request and response
    mockRequest = {
      body: {},
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent'
      }
    };
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    
    mockNext = jest.fn();
  });
  
  describe('signup', () => {
    it('should create a new user with valid inputs', async () => {
      // Setup mock request
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      };
      
      // Setup mock successful response
      const mockSignupResponse = {
        data: {
          user: {
            id: 'user-id',
            email: 'test@example.com'
          },
          session: null
        },
        error: null
      };
      
      (authService.signup as jest.Mock).mockResolvedValue(mockSignupResponse);
      
      // Call the controller
      await authController.signup(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Verify service was called with correct params
      expect(authService.signup).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        metadata: {
          name: 'Test User'
        }
      });
      
      // Verify response
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'User registered successfully. Check your email for confirmation.',
        userId: 'user-id',
        email: 'test@example.com'
      });
      
      // Verify next was not called (no error)
      expect(mockNext).not.toHaveBeenCalled();
    });
    
    it('should return an error with missing email or password', async () => {
      // Call the controller with invalid data
      await authController.signup(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Verify next was called with an error
      expect(mockNext).toHaveBeenCalled();
      expect(mockNext.mock.calls[0][0].message).toBe('Email and password are required');
    });
    
    it('should pass service errors to next middleware', async () => {
      // Setup mock request
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123'
      };
      
      // Setup mock error response
      const mockError = { message: 'Signup failed' };
      (authService.signup as jest.Mock).mockResolvedValue({
        data: { user: null },
        error: mockError
      });
      
      // Call the controller
      await authController.signup(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Verify next was called with an error
      expect(mockNext).toHaveBeenCalled();
    });
  });
  
  describe('login', () => {
    it('should authenticate a user with valid credentials', async () => {
      // Setup mock request
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123'
      };
      
      // Setup mock successful response
      const mockUser = { id: 'user-id', email: 'test@example.com' };
      const mockSession = { access_token: 'token' };
      const mockLoginResponse = {
        data: {
          user: mockUser,
          session: mockSession
        },
        error: null
      };
      
      (authService.login as jest.Mock).mockResolvedValue(mockLoginResponse);
      
      // Call the controller
      await authController.login(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Verify service was called with correct params
      expect(authService.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123'
      });
      
      // Verify response
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Login successful',
        user: mockUser,
        session: mockSession
      });
    });
    
    it('should handle invalid credentials', async () => {
      // Setup mock request
      mockRequest.body = {
        email: 'test@example.com',
        password: 'wrongpass'
      };
      
      // Setup mock error response
      const mockError = { message: 'Invalid login credentials' };
      (authService.login as jest.Mock).mockResolvedValue({
        data: { user: null, session: null },
        error: mockError
      });
      
      // Call the controller
      await authController.login(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Verify next was called with an error
      expect(mockNext).toHaveBeenCalled();
    });
  });
  
  describe('logout', () => {
    it('should log out a user successfully', async () => {
      // Setup mock successful response
      (authService.logout as jest.Mock).mockResolvedValue({ error: null });
      
      // Call the controller
      await authController.logout(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Verify service was called
      expect(authService.logout).toHaveBeenCalled();
      
      // Verify response
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Logout successful'
      });
    });
  });
  
  describe('resetPassword', () => {
    it('should send password reset email with valid email', async () => {
      // Setup mock request
      mockRequest.body = {
        email: 'test@example.com'
      };
      
      // Setup mock successful response
      (authService.resetPassword as jest.Mock).mockResolvedValue({ error: null });
      
      // Call the controller
      await authController.resetPassword(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Verify service was called with correct email
      expect(authService.resetPassword).toHaveBeenCalledWith('test@example.com');
      
      // Verify response
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'If your email is registered with us, you will receive password reset instructions'
      });
    });
    
    it('should return friendly message even with invalid email for security', async () => {
      // Setup mock request with no email
      mockRequest.body = {};
      
      // Call the controller
      await authController.resetPassword(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Should not call the service
      expect(authService.resetPassword).not.toHaveBeenCalled();
      
      // Should still return a neutral response directly
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'If your email is registered with us, you will receive password reset instructions'
      });
      
      // next should not be called since we handle the error and return directly
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
}); 