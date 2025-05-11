import { Request, Response, NextFunction } from 'express';
import { authService, SignupData, LoginData } from '../services/auth';
import { BadRequestError, UnauthorizedError } from '../utils/errors';
import logger from '../utils/logger';

/**
 * Auth controller for handling authentication endpoints
 */
export const authController = {
  /**
   * User signup endpoint
   */
  signup: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, name } = req.body;
      
      // Basic validation
      if (!email || !password) {
        throw new BadRequestError('Email and password are required');
      }
      
      // Create signup data object
      const signupData: SignupData = {
        email,
        password,
        metadata: {
          name
        }
      };
      
      // Register the user
      const { data, error } = await authService.signup(signupData);
      
      if (error) {
        throw new BadRequestError(error.message);
      }
      
      return res.status(201).json({
        message: 'User registered successfully. Check your email for confirmation.',
        userId: data.user?.id,
        email: data.user?.email
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * User login endpoint
   */
  login: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      
      // Basic validation
      if (!email || !password) {
        throw new BadRequestError('Email and password are required');
      }
      
      // Create login data object
      const loginData: LoginData = {
        email,
        password
      };
      
      // Authenticate the user
      const { data, error } = await authService.login(loginData);
      
      if (error) {
        // Log failed login attempts with IP for security monitoring
        logger.warn('Failed login attempt', {
          email,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          error: error.message
        });
        
        throw new UnauthorizedError('Invalid email or password');
      }
      
      // Log successful login
      logger.info('User logged in successfully', {
        userId: data.user?.id,
        email: data.user?.email,
        ip: req.ip
      });
      
      // Return the user and session info
      return res.status(200).json({
        message: 'Login successful',
        user: data.user,
        session: data.session
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * User logout endpoint
   */
  logout: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error } = await authService.logout();
      
      if (error) {
        throw new BadRequestError(error.message);
      }
      
      return res.status(200).json({
        message: 'Logout successful'
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Password reset endpoint
   */
  resetPassword: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        throw new BadRequestError('Email is required');
      }
      
      const { error } = await authService.resetPassword(email);
      
      if (error) {
        throw new BadRequestError(error.message);
      }
      
      // For security reasons, always return success regardless of whether the email exists
      return res.status(200).json({
        message: 'If your email is registered with us, you will receive password reset instructions'
      });
    } catch (error) {
      // For security reasons, don't reveal specific errors to the client
      logger.error('Password reset error', { 
        error: error instanceof Error ? error.message : String(error)
      });
      
      return res.status(200).json({
        message: 'If your email is registered with us, you will receive password reset instructions'
      });
    }
  },
  
  /**
   * Update password endpoint (after reset)
   */
  updatePassword: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { password } = req.body;
      
      if (!password) {
        throw new BadRequestError('New password is required');
      }
      
      const { error } = await authService.updatePassword(password);
      
      if (error) {
        throw new BadRequestError(error.message);
      }
      
      return res.status(200).json({
        message: 'Password updated successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get user details endpoint
   */
  me: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      
      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      return res.status(200).json({
        message: 'User details retrieved successfully',
        user
      });
    } catch (error) {
      next(error);
    }
  }
}; 