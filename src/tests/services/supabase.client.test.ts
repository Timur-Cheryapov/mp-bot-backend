import { supabaseService, getSupabaseClient } from '../../infrastructure/database/supabase.client';

// Mock the Supabase client
jest.mock('@supabase/supabase-js', () => {
  const mockClient = {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      getSession: jest.fn(),
      updateUser: jest.fn(),
    },
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  };
  
  return {
    createClient: jest.fn(() => mockClient),
  };
});

// Mock environment variables
process.env.SUPABASE_URL = 'https://mock-supabase-url.com';
process.env.SUPABASE_ANON_KEY = 'mock-anon-key';

describe('Supabase Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  it('should be initialized', () => {
    expect(supabaseService.isInitialized()).toBe(true);
  });
  
  it('should return the client when getClient is called', () => {
    const client = getSupabaseClient();
    expect(client).toBeDefined();
  });
  
  it('should provide a singleton instance', () => {
    const instance1 = supabaseService;
    const instance2 = supabaseService;
    expect(instance1).toBe(instance2);
  });
  
  it('should be able to reset the connection', () => {
    expect(() => {
      supabaseService.resetConnection();
    }).not.toThrow();
  });
}); 