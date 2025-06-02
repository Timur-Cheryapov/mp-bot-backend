import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../infrastructure/database/supabase.client';
import logger from '../../shared/utils/logger';
import crypto from 'crypto';
import { UserApiKey } from '../../infrastructure/database/supabase.client';

export interface CreateApiKeyData {
  service: string;
  api_key: string;
}

export interface UpdateApiKeyData {
  api_key: string;
}

/**
 * Service for handling user API keys operations
 */
export class ApiKeysService {
  private supabase: SupabaseClient;
  private readonly ENCRYPTION_KEY: string;
  private readonly ALGORITHM = 'aes-256-gcm';

  constructor() {
    this.supabase = getSupabaseClient();
    this.ENCRYPTION_KEY = process.env.API_KEYS_ENCRYPTION_KEY || '';
    
    if (!this.ENCRYPTION_KEY) {
      logger.error('API_KEYS_ENCRYPTION_KEY not set in environment variables');
      throw new Error('API_KEYS_ENCRYPTION_KEY not set in environment variables');
    }
  }

  /**
   * Encrypt an API key
   */
  private encryptApiKey(apiKey: string): { encrypted: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(this.ENCRYPTION_KEY, 'hex');
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
    
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  /**
   * Decrypt an API key
   */
  private decryptApiKey(encryptedData: string, iv: string, tag: string): string {
    const key = Buffer.from(this.ENCRYPTION_KEY, 'hex');
    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Validate service name
   */
  private validateService(service: string): boolean {
    const allowedServices = [
      'wildberries',
      'ozon',
      'yandexmarket'
    ];
    
    return allowedServices.includes(service.toLowerCase());
  }

  /**
   * Create or update an API key for a user
   */
  async upsertApiKey(userId: string, data: CreateApiKeyData): Promise<UserApiKey> {
    try {
      // Validate service
      if (!this.validateService(data.service)) {
        throw new Error(`Invalid service: ${data.service}`);
      }

      // Validate API key format (basic validation)
      if (!data.api_key || data.api_key.trim().length < 10) {
        throw new Error('API key must be at least 10 characters long');
      }

      // Encrypt the API key
      const { encrypted, iv, tag } = this.encryptApiKey(data.api_key.trim());
      const encryptedApiKey = `${iv}:${tag}:${encrypted}`;

      // Upsert the API key
      const { data: result, error } = await this.supabase
        .from('user_api_keys')
        .upsert({
          user_id: userId,
          service: data.service.toLowerCase(),
          api_key: encryptedApiKey
        }, {
          onConflict: 'user_id,service'
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to upsert API key', {
          error: error.message,
          userId,
          service: data.service
        });
        throw new Error(`Failed to save API key: ${error.message}`);
      }

      logger.info('API key upserted successfully', {
        userId,
        service: data.service
      });

      // Return without the encrypted API key for security
      return {
        user_id: result.user_id,
        service: result.service,
        api_key: '***ENCRYPTED***',
        created_at: result.created_at
      };
    } catch (error) {
      logger.error('Error upserting API key', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        service: data.service
      });
      throw error;
    }
  }

  /**
   * Get an API key for a user and service
   */
  async getApiKey(userId: string, service: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('user_api_keys')
        .select('api_key')
        .eq('user_id', userId)
        .eq('service', service.toLowerCase())
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned
          return null;
        }
        logger.error('Failed to get API key', {
          error: error.message,
          userId,
          service
        });
        throw new Error(`Failed to retrieve API key: ${error.message}`);
      }

      if (!data || !data.api_key) {
        return null;
      }

      // Decrypt the API key
      const [iv, tag, encrypted] = data.api_key.split(':');
      const decryptedApiKey = this.decryptApiKey(encrypted, iv, tag);

      return decryptedApiKey;
    } catch (error) {
      logger.error('Error getting API key', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        service
      });
      throw error;
    }
  }

  /**
   * Get all API key services for a user (without the actual keys)
   */
  async getUserApiKeys(userId: string): Promise<Omit<UserApiKey, 'api_key'>[]> {
    try {
      const { data, error } = await this.supabase
        .from('user_api_keys')
        .select('user_id, service, created_at, updated_at')
        .eq('user_id', userId)
        .order('service', { ascending: true });

      if (error) {
        logger.error('Failed to get user API keys', {
          error: error.message,
          userId
        });
        throw new Error(`Failed to retrieve API keys: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      logger.error('Error getting user API keys', {
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      throw error;
    }
  }

  /**
   * Delete an API key for a user and service
   */
  async deleteApiKey(userId: string, service: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('user_api_keys')
        .delete()
        .eq('user_id', userId)
        .eq('service', service.toLowerCase());

      if (error) {
        logger.error('Failed to delete API key', {
          error: error.message,
          userId,
          service
        });
        throw new Error(`Failed to delete API key: ${error.message}`);
      }

      logger.info('API key deleted successfully', {
        userId,
        service
      });
    } catch (error) {
      logger.error('Error deleting API key', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        service
      });
      throw error;
    }
  }

  /**
   * Check if user has an API key for a service
   */
  async hasApiKey(userId: string, service: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('user_api_keys')
        .select('user_id')
        .eq('user_id', userId)
        .eq('service', service.toLowerCase())
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('Failed to check API key existence', {
          error: error.message,
          userId,
          service
        });
        throw new Error(`Failed to check API key: ${error.message}`);
      }

      return !!data;
    } catch (error) {
      logger.error('Error checking API key existence', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        service
      });
      throw error;
    }
  }
}

// Export a singleton instance
export const apiKeysService = new ApiKeysService(); 