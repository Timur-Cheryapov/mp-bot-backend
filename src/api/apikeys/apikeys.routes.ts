import { Router } from 'express';
import { apiKeysController } from './apikeys.controller';
import { 
  asyncHandler, 
  authenticate, 
  csrfProtection,
  apiKeysRateLimiter,
  globalRateLimiter
} from '../../shared/middleware';
import { validate } from '../../shared/middleware/validator.middleware';
import { createApiKeyValidation, serviceParamValidation } from '../../shared/utils/validation.utils';

const router = Router();

/**
 * @route POST /api/api-keys
 * @desc Create or update an API key for a user
 * @access Private
 */
router.post(
  '/', 
  authenticate, 
  apiKeysRateLimiter,
  csrfProtection, 
  validate(createApiKeyValidation), 
  asyncHandler(apiKeysController.upsertApiKey)
);

/**
 * @route GET /api/api-keys
 * @desc Get all API key services for a user (without the actual keys)
 * @access Private
 */
router.get(
  '/', 
  authenticate, 
  apiKeysRateLimiter,
  asyncHandler(apiKeysController.getUserApiKeys)
);

// /**
//  * @route GET /api/api-keys/:service
//  * @desc Get a specific API key for a user and service
//  * @access Private
//  */
// router.get(
//   '/:service', 
//   authenticate, 
//   apiKeysRateLimiter,
//   validate(serviceParamValidation), 
//   asyncHandler(apiKeysController.getApiKey)
// );

/**
 * @route DELETE /api/api-keys/:service
 * @desc Delete an API key for a user and service
 * @access Private
 */
router.delete(
  '/:service', 
  authenticate, 
  apiKeysRateLimiter,
  csrfProtection, 
  validate(serviceParamValidation), 
  asyncHandler(apiKeysController.deleteApiKey)
);

/**
 * @route HEAD /api/api-keys/:service
 * @desc Check if user has an API key for a service
 * @access Private
 */
router.head(
  '/:service', 
  authenticate, 
  globalRateLimiter,
  validate(serviceParamValidation), 
  asyncHandler(apiKeysController.hasApiKey)
);

export default router; 