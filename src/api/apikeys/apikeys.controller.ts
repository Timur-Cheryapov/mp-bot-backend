import { Request, Response, NextFunction } from 'express';
import { apiKeysService, CreateApiKeyData } from '../../core/apiKeys/apikeys.service';
import { BadRequestError, UnauthorizedError, NotFoundError } from '../../shared/utils/errors';
import logger from '../../shared/utils/logger';

/**
 * API Keys controller for handling user API keys endpoints
 */
export const apiKeysController = {
  /**
   * Create or update an API key for a user
   * POST /api/api-keys
   */
  upsertApiKey: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      
      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      const { service, api_key } = req.body;
      
      // Basic validation
      if (!service || !api_key) {
        throw new BadRequestError('Service and API key are required');
      }
      
      // Create the API key data object
      const apiKeyData: CreateApiKeyData = {
        service: service.trim(),
        api_key: api_key.trim()
      };
      
      // Upsert the API key
      const result = await apiKeysService.upsertApiKey(user.id, apiKeyData);
      
      logger.info('API key upserted via controller', {
        userId: user.id,
        service: service.trim(),
        ip: req.ip
      });
      
      return res.status(200).json({
        message: 'API key saved successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error in upsertApiKey controller', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id,
        ip: req.ip
      });
      next(error);
    }
  },

  /**
   * Get a specific API key for a user and service
   * GET /api/api-keys/:service
   */
  getApiKey: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      
      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      const { service } = req.params;
      
      if (!service) {
        throw new BadRequestError('Service parameter is required');
      }
      
      // Get the API key
      const apiKey = await apiKeysService.getApiKey(user.id, service.trim());
      
      if (!apiKey) {
        throw new NotFoundError(`No API key found for service: ${service}`);
      }
      
      return res.status(200).json({
        message: 'API key retrieved successfully',
        data: {
          service: service.toLowerCase(),
          api_key: apiKey
        }
      });
    } catch (error) {
      logger.error('Error in getApiKey controller', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id,
        service: req.params.service,
        ip: req.ip
      });
      next(error);
    }
  },

  /**
   * Get all API key services for a user (without the actual keys)
   * GET /api/api-keys
   */
  getUserApiKeys: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      
      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      // Get all user API keys (without the actual keys)
      const apiKeys = await apiKeysService.getUserApiKeys(user.id);
      
      return res.status(200).json({
        message: 'API keys retrieved successfully',
        data: apiKeys,
        count: apiKeys.length
      });
    } catch (error) {
      logger.error('Error in getUserApiKeys controller', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id,
        ip: req.ip
      });
      next(error);
    }
  },

  /**
   * Delete an API key for a user and service
   * DELETE /api/api-keys/:service
   */
  deleteApiKey: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      
      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      const { service } = req.params;
      
      if (!service) {
        throw new BadRequestError('Service parameter is required');
      }
      
      // Check if the API key exists first
      const hasKey = await apiKeysService.hasApiKey(user.id, service.trim());
      
      if (!hasKey) {
        throw new NotFoundError(`No API key found for service: ${service}`);
      }
      
      // Delete the API key
      await apiKeysService.deleteApiKey(user.id, service.trim());
      
      logger.info('API key deleted via controller', {
        userId: user.id,
        service: service.trim(),
        ip: req.ip
      });
      
      return res.status(200).json({
        message: `API key for ${service} deleted successfully`
      });
    } catch (error) {
      logger.error('Error in deleteApiKey controller', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id,
        service: req.params.service,
        ip: req.ip
      });
      next(error);
    }
  },

  /**
   * Check if user has an API key for a service
   * HEAD /api/api-keys/:service
   */
  hasApiKey: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      
      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      const { service } = req.params;
      
      if (!service) {
        throw new BadRequestError('Service parameter is required');
      }
      
      // Check if the API key exists
      const hasKey = await apiKeysService.hasApiKey(user.id, service.trim());
      
      if (hasKey) {
        return res.status(200).json({
          message: `API key exists for service: ${service}`,
          exists: true
        });
      } else {
        return res.status(404).json({
          message: `No API key found for service: ${service}`,
          exists: false
        });
      }
    } catch (error) {
      logger.error('Error in hasApiKey controller', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id,
        service: req.params.service,
        ip: req.ip
      });
      next(error);
    }
  }
}; 