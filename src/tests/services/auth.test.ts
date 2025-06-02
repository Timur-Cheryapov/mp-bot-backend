import { authService, SignupData, LoginData } from '../../core/auth/auth.service';

// Mock the Supabase client
jest.mock('../../services/supabase', () => {
  const mockClient = {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      getSession: jest.fn(),
      updateUser: jest.fn(),
    }
  };
  
  return {
    getSupabaseClient: jest.fn(() => mockClient),
  };
});

// Mock logger
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

describe('Auth Service', () => {
  let mockSupabaseClient: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient = require('../../services/supabase').getSupabaseClient();
  });
  
  describe('signup', () => {
    it('should successfully register a user', async () => {
      // Prepare test data
      const signupData: SignupData = {
        email: 'test@example.com',
        password: 'password123',
        metadata: { name: 'Test User' }
      };
      
      // Mock successful signup
      const mockResponse = {
        data: {
          user: {
            id: 'user-id',
            email: 'test@example.com'
          },
          session: null
        },
        error: null
      };
      
      mockSupabaseClient.auth.signUp.mockResolvedValue(mockResponse);
      
      // Call the method
      const result = await authService.signup(signupData);
      
      // Assertions
      expect(mockSupabaseClient.auth.signUp).toHaveBeenCalledWith({
        email: signupData.email,
        password: signupData.password,
        options: {
          data: signupData.metadata,
          emailRedirectTo: process.env.AUTH_REDIRECT_URL,
        }
      });
      expect(result).toEqual(mockResponse);
    });
    
    it('should throw an error if signup fails', async () => {
      // Prepare test data
      const signupData: SignupData = {
        email: 'test@example.com',
        password: 'password123'
      };
      
      // Mock failed signup
      const mockError = { message: 'Email already exists' };
      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: mockError
      });
      
      // Call the method and expect it to throw
      await expect(authService.signup(signupData)).rejects.toEqual(mockError);
    });
  });
  
  describe('login', () => {
    it('should successfully log in a user', async () => {
      // Prepare test data
      const loginData: LoginData = {
        email: 'test@example.com',
        password: 'password123'
      };
      
      // Mock successful login
      const mockResponse = {
        data: {
          user: {
            id: 'user-id',
            email: 'test@example.com'
          },
          session: {
            access_token: 'mock-token'
          }
        },
        error: null
      };
      
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue(mockResponse);
      
      // Call the method
      const result = await authService.login(loginData);
      
      // Assertions
      expect(mockSupabaseClient.auth.signInWithPassword).toHaveBeenCalledWith({
        email: loginData.email,
        password: loginData.password
      });
      expect(result).toEqual(mockResponse);
    });
    
    it('should throw an error if login fails', async () => {
      // Prepare test data
      const loginData: LoginData = {
        email: 'test@example.com',
        password: 'wrong-password'
      };
      
      // Mock failed login
      const mockError = { message: 'Invalid login credentials' };
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: mockError
      });
      
      // Call the method and expect it to throw
      await expect(authService.login(loginData)).rejects.toEqual(mockError);
    });
  });
  
  describe('logout', () => {
    it('should successfully log out a user', async () => {
      // Mock successful logout
      mockSupabaseClient.auth.signOut.mockResolvedValue({ error: null });
      
      // Call the method
      const result = await authService.logout();
      
      // Assertions
      expect(mockSupabaseClient.auth.signOut).toHaveBeenCalled();
      expect(result).toEqual({ error: null });
    });
    
    it('should throw an error if logout fails', async () => {
      // Mock failed logout
      const mockError = { message: 'Error logging out' };
      mockSupabaseClient.auth.signOut.mockResolvedValue({ error: mockError });
      
      // Call the method and expect it to throw
      await expect(authService.logout()).rejects.toEqual(mockError);
    });
  });
  
  describe('resetPassword', () => {
    it('should successfully send a password reset email', async () => {
      // Mock successful password reset
      mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
      
      // Call the method
      const result = await authService.resetPassword('test@example.com');
      
      // Assertions
      expect(mockSupabaseClient.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'test@example.com',
        { redirectTo: process.env.PASSWORD_RESET_REDIRECT_URL }
      );
      expect(result).toEqual({ error: null });
    });
  });
}); 