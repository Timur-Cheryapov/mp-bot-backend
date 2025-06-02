import { AuthResponse, AuthError, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../infrastructure/database/supabase.client';
import logger from '../../shared/utils/logger';

// Type for signup data
export interface SignupData {
  email: string;
  password: string;
  metadata?: {
    name?: string;
    [key: string]: any;
  };
}

// Type for login data
export interface LoginData {
  email: string;
  password: string;
}

/**
 * Service for handling authentication-related operations
 */
export class AuthService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = getSupabaseClient();
  }

  /**
   * Register a new user with email and password
   */
  async signup({ email, password, metadata }: SignupData): Promise<AuthResponse> {
    try {
      const response = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
          emailRedirectTo: process.env.AUTH_REDIRECT_URL,
        }
      });

      if (response.error) {
        logger.error('Signup failed', { 
          error: response.error.message,
          email 
        });
        throw response.error;
      }

      logger.info('User registered successfully', { email });
      return response;
    } catch (error) {
      logger.error('Signup error', { 
        error: error instanceof Error ? error.message : String(error),
        email 
      });
      throw error;
    }
  }

  /**
   * Authenticate a user with email and password
   */
  async login({ email, password }: LoginData): Promise<AuthResponse> {
    try {
      const response = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (response.error) {
        logger.error('Login failed', {
          error: response.error.message,
          email
        });
        throw response.error;
      }

      logger.info('User logged in successfully', { email });
      return response;
    } catch (error) {
      logger.error('Login error', {
        error: error instanceof Error ? error.message : String(error),
        email
      });
      throw error;
    }
  }

  /**
   * Sign out a user
   */
  async logout(): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await this.supabase.auth.signOut();
      
      if (error) {
        logger.error('Logout failed', { error: error.message });
        throw error;
      }

      logger.info('User logged out successfully');
      return { error: null };
    } catch (error) {
      logger.error('Logout error', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Send password reset email
   */
  async resetPassword(email: string): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: process.env.PASSWORD_RESET_REDIRECT_URL,
      });

      if (error) {
        logger.error('Password reset request failed', {
          error: error.message,
          email
        });
        throw error;
      }

      logger.info('Password reset email sent successfully', { email });
      return { error: null };
    } catch (error) {
      logger.error('Password reset error', {
        error: error instanceof Error ? error.message : String(error),
        email
      });
      throw error;
    }
  }

  /**
   * Get the current user session
   */
  async getSession() {
    const { data, error } = await this.supabase.auth.getSession();
    
    if (error) {
      logger.error('Get session failed', { error: error.message });
      throw error;
    }
    
    return data;
  }

  /**
   * Update the user password
   */
  async updatePassword(newPassword: string): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await this.supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        logger.error('Password update failed', { error: error.message });
        throw error;
      }

      logger.info('Password updated successfully');
      return { error: null };
    } catch (error) {
      logger.error('Password update error', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}

// Export a singleton instance
export const authService = new AuthService(); 