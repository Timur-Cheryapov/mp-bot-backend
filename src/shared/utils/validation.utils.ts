import { body, param } from 'express-validator';

export const validateApiKey = (apiKey?: string) => {
  if (!apiKey) {
    throw new Error('API key is required');
  }
}

export const createApiKeyValidation = [
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

export const serviceParamValidation = [
  param('service')
    .trim()
    .notEmpty()
    .withMessage('Service is required')
    .isIn(['wildberries', 'ozon', 'yandexmarket'])
    .withMessage('Invalid service. Allowed services: wildberries, ozon, yandexmarket')
];