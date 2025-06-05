import logger from "../../shared/utils/logger";
import { apiKeysService } from "../apiKeys/apikeys.service";
import axios from 'axios';

export async function getWildberriesApiKey(userId: string): Promise<string | null> {
  logger.info('Attempting to retrieve Wildberries API key', { userId });
        
  const apiKey = await apiKeysService.getApiKey(userId, 'wildberries');
  
  if (!apiKey) {
    logger.warn('No Wildberries API key found for user', { userId });
    return null;
  }

  logger.info('API key retrieved successfully', { userId, keyLength: apiKey.length });

  return apiKey;
}

export function handleWildberriesError(error: any, userId: string) {
  logger.error('Wildberries API request failed', {
    userId,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...(axios.isAxiosError(error) && {
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data
    })
  });

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const responseData = error.response?.data;
    
    switch (status) {
      case 401:
        return JSON.stringify({
          error: "Your Wildberries API key appears to be invalid or expired.",
          success: false,
          statusCode: 401,
        });
      case 403:
        return JSON.stringify({
          error: "Access forbidden. Your API key doesn't have the required permissions.",
          success: false,
          statusCode: 403,
        });
      case 413:
        return JSON.stringify({
          error: "Request entity too large. The request payload is too large.",
          success: false,
          statusCode: 413,
        });
      case 429:
        return JSON.stringify({
          error: "Rate limit exceeded for Wildberries API.",
          success: false,
          statusCode: 429,
        });
      case 400:
        return JSON.stringify({
          error: "Bad request to Wildberries API.",
          success: false,
          statusCode: 400,
          details: responseData,
        });
      default:
        return JSON.stringify({
          error: `Wildberries API returned an error: ${error.response?.statusText || 'Unknown error'}`,
          success: false,
          statusCode: status,
          details: responseData,
        });
    }
  }

  return JSON.stringify({
    error: `Failed to fetch your Wildberries products: ${error instanceof Error ? error.message : String(error)}`,
    success: false,
    type: "network_error",
  });
}
