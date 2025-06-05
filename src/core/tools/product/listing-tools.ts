import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';
import logger from '../../../shared/utils/logger';
import { getWildberriesApiKey, handleWildberriesError } from '../wildberries.service';

export const wildberriesToolsMessages = {
  get_wildberries_seller_product_cards: {
    success: "Fetch Wildberries product cards.",
    pending: "Fetching Wildberries product cards..."
  }
}

/**
 * Zod schema for Wildberries seller products tool parameters
 */
const getWildberriesSellerProductCardsSchema = z.object({
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
export function createGetWildberriesSellerProductCardsTool(userId: string) {
  return tool(
    async (input) => {
      try {
        // Get the user's Wildberries API key
        const apiKey = await getWildberriesApiKey(userId);
        if (!apiKey) {
          return JSON.stringify({
            error: "I couldn't find your Wildberries API key.",
            success: false,
          });
        }

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
          'https://content-api-sandbox.wildberries.ru/content/v2/get/cards/list',
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
            endpoint: "get_wildberries_seller_product_cards",
            rateLimit: "100 requests per minute",
            apiCategory: "Content"
          }
        });

      } catch (error) {
        return handleWildberriesError(error, userId);
      }
    },
    {
      name: "get_wildberries_seller_product_cards",
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
      schema: getWildberriesSellerProductCardsSchema
    }
  );
}

