import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';
import logger from '../utils/logger';
import { apiKeysService } from './apiKeys';

export const wildberriesToolsMessages = {
  wildberries_seller_products: {
    success: "Fetch seller's Wildberries product cards.",
    pending: "Fetching seller's Wildberries product cards..."
  }
}

/**
 * Zod schema for Wildberries seller products tool parameters
 */
const wildberriesSellerProductsSchema = z.object({
  limit: z.number().min(1).max(1000).optional().describe("Number of products to fetch (1-1000, default: 100)"),
  offset: z.number().min(0).optional().describe("Offset for pagination (default: 0)"),
  textSearch: z.string().optional().describe("Search term to filter products"),
  allowedCategoriesOnly: z.boolean().optional().describe("Only show products from allowed categories (default: false)"),
  withPhoto: z.number().min(-1).max(1).optional().describe("Photo filter: -1 = without photos, 0 = any, 1 = with photos only"),
  updatedAt: z.string().optional().describe("Filter by update date (ISO format: 2024-01-01T00:00:00Z)"),
  nmID: z.number().optional().describe("Specific product ID to fetch")
});

/**
 * Create a Wildberries Seller Products tool for fetching seller's listed products
 * Based on: https://dev.wildberries.ru/openapi/work-with-products#tag/Kartochki-tovarov/paths/~1content~1v2~1get~1cards~1list/post
 */
export function createWildberriesSellerProductsTool(userId: string) {
  return tool(
    async (input) => {
      logger.info('Wildberries tool function called', {
        userId,
        inputReceived: input,
        inputType: typeof input
      });

      try {
        // Get the user's Wildberries API key
        logger.info('Attempting to retrieve Wildberries API key', { userId });
        
        const apiKey = await apiKeysService.getApiKey(userId, 'wildberries');
        
        if (!apiKey) {
          logger.warn('No Wildberries API key found for user', { userId });
          return JSON.stringify({
            error: "I couldn't find your Wildberries API key. Please add your Wildberries API key first to fetch your product data.",
            success: false,
            userMessage: "Please add your Wildberries API key to view your products."
          });
        }

        logger.info('API key retrieved successfully', { userId, keyLength: apiKey.length });

        // Build request body from validated input
        const requestBody = {
          settings: {
            cursor: {
              limit: input.limit || 100,
              ...(input.updatedAt && { updatedAt: input.updatedAt }),
              ...(input.nmID && { nmID: input.nmID })
            },
            filter: {
              textSearch: input.textSearch || "",
              allowedCategoriesOnly: input.allowedCategoriesOnly || false
            }
          },
          ...(input.withPhoto !== undefined && { withPhoto: input.withPhoto })
        };

        logger.info('Making Wildberries Seller Products API request', {
          userId,
          endpoint: '/content/v2/get/cards/list',
          requestBody
        });

        // Make POST request to Wildberries Content API
        const response = await axios.post(
          'https://content-api.wildberries.ru/content/v2/get/cards/list',
          requestBody,
          {
            headers: {
              'Authorization': apiKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'MP-Bot/1.0'
            },
            timeout: 30000
          }
        );

        logger.info('Wildberries Seller Products API request successful', {
          userId,
          statusCode: response.status,
          cardsCount: response.data?.cards?.length || 0,
          cursor: response.data?.cursor
        });

        // Return structured response as string (required by LangChain tools)
        return JSON.stringify({
          success: true,
          data: response.data,
          totalCards: response.data?.cards?.length || 0,
          cursor: response.data?.cursor,
          requestParams: requestBody,
          metadata: {
            endpoint: "seller_products_list",
            rateLimit: "100 requests per minute",
            apiCategory: "Content"
          }
        });

      } catch (error) {
        logger.error('Wildberries Seller Products API request failed', {
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
                userMessage: "Please check and update your Wildberries API key. It may be invalid or expired."
              });
            case 403:
              return JSON.stringify({
                error: "Access forbidden. Your API key doesn't have the required permissions.",
                success: false,
                statusCode: 403,
                userMessage: "Your Wildberries API key doesn't have permission to access product data. Please check your API key permissions."
              });
            case 429:
              return JSON.stringify({
                error: "Rate limit exceeded for Wildberries API.",
                success: false,
                statusCode: 429,
                userMessage: "You've made too many requests to Wildberries. Please wait a moment and try again."
              });
            case 400:
              return JSON.stringify({
                error: "Bad request to Wildberries API.",
                success: false,
                statusCode: 400,
                details: responseData,
                userMessage: "There was an issue with the request format. Please try again."
              });
            default:
              return JSON.stringify({
                error: `Wildberries API returned an error: ${error.response?.statusText || 'Unknown error'}`,
                success: false,
                statusCode: status,
                details: responseData,
                userMessage: "There was an issue connecting to Wildberries. Please try again later."
              });
          }
        }

        return JSON.stringify({
          error: `Failed to fetch your Wildberries products: ${error instanceof Error ? error.message : String(error)}`,
          success: false,
          type: "network_error",
          userMessage: "I encountered an error while trying to fetch your Wildberries products. Please try again later."
        });
      }
    },
    {
      name: "wildberries_seller_products",
      description: `Fetch seller's own listed product cards from Wildberries marketplace Content API.
      This tool retrieves the seller's product inventory, including product details, prices, characteristics, and status.
      Use this when users ask about:
      - Their own products listed on Wildberries
      - Inventory management
      - Product cards and their details
      - Product status and characteristics
      - Managing seller's catalog

      Returns JSON data with the seller's product cards from Wildberries Content API.
      Rate limit: 100 requests per minute for Content category.`,
      schema: wildberriesSellerProductsSchema
    }
  );
}