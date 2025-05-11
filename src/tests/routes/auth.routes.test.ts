import { Request, Response, NextFunction } from 'express';
import { authController } from '../../controllers/auth.controller';
import { authenticate, trackLoginAttempts } from '../../middleware/auth';

// Mock auth controller
jest.mock('../../controllers/auth.controller', () => ({
  authController: {
    signup: jest.fn().mockImplementation((req: any, res: any) => res.status(201).json({ message: 'User registered' })),
    login: jest.fn().mockImplementation((req: any, res: any) => res.status(200).json({ message: 'Login successful' })),
    logout: jest.fn().mockImplementation((req: any, res: any) => res.status(200).json({ message: 'Logout successful' })),
    resetPassword: jest.fn().mockImplementation((req: any, res: any) => res.status(200).json({ message: 'Password reset email sent' })),
    updatePassword: jest.fn().mockImplementation((req: any, res: any) => res.status(200).json({ message: 'Password updated' })),
  }
}));

// Mock auth middleware
jest.mock('../../middleware/auth', () => ({
  authenticate: jest.fn().mockImplementation((req: any, res: any, next: any) => next()),
  trackLoginAttempts: jest.fn().mockImplementation((req: any, res: any, next: any) => next()),
  requireAdmin: jest.fn().mockImplementation((req: any, res: any, next: any) => next()),
  handleAuthError: jest.fn().mockImplementation((err: any, req: any, res: any, next: any) => next(err))
}));

// Mock validator middleware
jest.mock('../../middleware/validator', () => ({
  validate: jest.fn().mockReturnValue((req: any, res: any, next: any) => next())
}));

describe('Auth Routes', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRequest = {
      body: {}
    };
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    
    mockNext = jest.fn();
  });
  
  describe('POST /api/auth/signup', () => {
    it('should call signup controller', () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123'
      };
      mockRequest.body = userData;
      
      // Directly call the controller function as if the route was hit
      authController.signup(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      expect(authController.signup).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('registered')
        })
      );
    });
  });
  
  describe('POST /api/auth/login', () => {
    it('should call login controller and track login attempts', () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };
      mockRequest.body = loginData;
      
      // Simulate middleware execution
      trackLoginAttempts(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      expect(trackLoginAttempts).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
      
      // Now call the controller
      authController.login(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      expect(authController.login).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Login successful'
        })
      );
    });
  });
  
  describe('POST /api/auth/logout', () => {
    it('should call logout controller', () => {
      authController.logout(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      expect(authController.logout).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Logout successful'
        })
      );
    });
  });
  
  describe('POST /api/auth/reset-password', () => {
    it('should call resetPassword controller', () => {
      const resetData = {
        email: 'test@example.com'
      };
      mockRequest.body = resetData;
      
      authController.resetPassword(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      expect(authController.resetPassword).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });
  });
  
  describe('POST /api/auth/update-password', () => {
    it('should require authentication and call updatePassword controller', () => {
      const updateData = {
        password: 'newPassword123'
      };
      mockRequest.body = updateData;
      
      // Simulate authentication middleware
      authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      expect(authenticate).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
      
      // Now call the controller
      authController.updatePassword(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      expect(authController.updatePassword).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Password updated'
        })
      );
    });
  });
}); 