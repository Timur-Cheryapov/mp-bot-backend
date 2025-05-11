import { createClient, SupabaseClient } from '@supabase/supabase-js';
import logger from '../utils/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define the types for our database tables
export type User = {
  id: string;
  created_at: string;
  email: string;
  role: string;
  last_seen_at?: string;
};

export type Conversation = {
  id: string;
  created_at: string;
  user_id: string;
  title: string;
  updated_at?: string;
  model_name?: string;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  context_length?: number;
  is_archived?: boolean;
  metadata?: Record<string, any>;
};

export type Message = {
  id: string;
  created_at: string;
  conversation_id: string;
  content: string;
  role: 'user' | 'assistant';
  metadata?: Record<string, any>;
};

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Error messages
const ERROR_MISSING_URL = 'Supabase URL is not defined in environment variables';
const ERROR_MISSING_KEY = 'Supabase anonymous key is not defined in environment variables';
const ERROR_INITIALIZATION = 'Failed to initialize Supabase client';

/**
 * Singleton class for Supabase client
 */
class SupabaseService {
  private static instance: SupabaseService;
  private client: SupabaseClient | null = null;
  private connectionAttempts = 0;
  private readonly MAX_RETRY_ATTEMPTS = 3;
  
  private constructor() {
    this.initializeClient();
  }

  /**
   * Initialize the Supabase client with error handling and validation
   */
  private initializeClient(): void {
    try {
      // Validate required environment variables
      if (!SUPABASE_URL) {
        throw new Error(ERROR_MISSING_URL);
      }
      
      if (!SUPABASE_ANON_KEY) {
        throw new Error(ERROR_MISSING_KEY);
      }
      
      // Create the Supabase client
      this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
        global: {
          headers: {
            'x-application-name': 'mp-bot-backend',
          },
        },
      });

      logger.info('Supabase client initialized successfully');
    } catch (error) {
      this.connectionAttempts += 1;
      
      if (this.connectionAttempts < this.MAX_RETRY_ATTEMPTS) {
        logger.warn(`Supabase initialization failed, retrying (${this.connectionAttempts}/${this.MAX_RETRY_ATTEMPTS})...`);
        setTimeout(() => this.initializeClient(), 1000 * this.connectionAttempts);
      } else {
        logger.error(`${ERROR_INITIALIZATION}: ${error instanceof Error ? error.message : String(error)}`);
        this.client = null;
      }
    }
  }

  /**
   * Get the Supabase client instance
   */
  public static getInstance(): SupabaseService {
    if (!SupabaseService.instance) {
      SupabaseService.instance = new SupabaseService();
    }
    
    return SupabaseService.instance;
  }

  /**
   * Get the Supabase client
   * @returns The Supabase client or throws an error if not initialized
   */
  public getClient(): SupabaseClient {
    if (!this.client) {
      logger.error(ERROR_INITIALIZATION);
      throw new Error(ERROR_INITIALIZATION);
    }
    
    return this.client;
  }

  /**
   * Check if the Supabase client is initialized
   * @returns boolean indicating if the client is ready
   */
  public isInitialized(): boolean {
    return this.client !== null;
  }

  /**
   * Reset the connection and try again
   */
  public resetConnection(): void {
    this.connectionAttempts = 0;
    this.initializeClient();
  }
}

// Export a function to get the Supabase client
export const getSupabaseClient = (): SupabaseClient => {
  return SupabaseService.getInstance().getClient();
};

// Export the Supabase service instance
export const supabaseService = SupabaseService.getInstance(); 