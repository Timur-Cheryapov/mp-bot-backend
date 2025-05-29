import { Router } from 'express';
import { apiKeysController } from '../controllers/apiKeys.controller';
import { 
  asyncHandler, 
  authenticate, 
  csrfProtection,
  apiKeysRateLimiter,
  globalRateLimiter
} from '../middleware';
import { validate } from '../middleware/validator';
import { body, param } from 'express-validator';

const router = Router();

// Validation rules
const createApiKeyValidation = [
  body('service')
    .trim()
    .notEmpty()
    .withMessage('Service is required')
    .isIn(['wildberries', 'ozon', 'yandexmarket'])
    .withMessage('Invalid service. Allowed services: wildberries, ozon, yandexmarket'),
  body('api_key')
    .trim()
    .notEmpty()
    .withMessage('API key is required')
    .isLength({ min: 10 })
    .withMessage('API key must be at least 10 characters long')
    .matches(/^[a-zA-Z0-9\-_\.]+$/)
    .withMessage('API key contains invalid characters')
];

const serviceParamValidation = [
  param('service')
    .trim()
    .notEmpty()
    .withMessage('Service is required')
    .isIn(['wildberries', 'ozon', 'yandexmarket'])
    .withMessage('Invalid service. Allowed services: wildberries, ozon, yandexmarket')
];

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