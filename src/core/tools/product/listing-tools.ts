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
      description: `Fetch seller's own listed product cards from Wildberries.
      This tool retrieves the seller's product inventory, including product details, prices, characteristics, and status.
      Use this when users ask about:
      - Their own products listed on Wildberries
      - Inventory management
      - Product cards and their details
      - Product status and characteristics
      - Managing seller's catalog`,
      schema: getWildberriesSellerProductCardsSchema
    }
  );
}

/**
 * Zod schema for Wildberries product card creation tool parameters
 */
const createWildberriesProductCardSchema = z.object({
  subjectId: z.number().min(1).describe("Subject ID from Wildberries API of the product"),
  brand: z.string().optional().describe("Brand of the product"),
  title: z.string().describe("Title of the product"),
  description: z.string().optional().describe("Description of the product"),
  vendorCode: z.string().describe("Vendor code of the product that the user wants to create"),
  productLength: z.number().int().min(0).describe("Length of the product in cm"),
  productWidth: z.number().int().min(0).describe("Width of the product in cm"),
  productHeight: z.number().int().min(0).describe("Height of the product in cm"),
  productWeightBrutto: z.number().min(0).describe("Weight of the product in kg"),
  size: z.number().int().min(0).optional().describe("Russian size of the product, if it is shoes, clothes, and similar products"),
  price: z.number().int().min(1).optional().describe("Price of the product in rubles"),
  sku: z.string().optional().describe("SKU of the product (if none, will be generated automatically)"),
});

/**
 * Create a Wildberries Product Card tool for creating a new product card on Wildberries marketplace
 * Based on: https://dev.wildberries.ru/openapi/work-with-products#tag/Sozdanie-kartochek-tovarov/paths/~1content~1v2~1cards~1upload/post
 */
export function createCreateWildberriesProductCardTool(userId: string) {
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
        const requestBody = [
          {
            subjectID: input.subjectId,
            variants: [
              {
                ...(input.brand !== undefined && { brand: input.brand }),
                title: input.title,
                ...(input.description !== undefined && { description: input.description }),
                vendorCode: input.vendorCode,
                dimensions: {
                  length: input.productLength,
                  width: input.productWidth,
                  height: input.productHeight,
                  weightBrutto: input.productWeightBrutto,
                },
                sizes: [
                  {
                    ...(input.size !== undefined && { 
                      techSize: input.size,
                      wbSize: input.size 
                    }),
                    ...(input.price !== undefined && { price: input.price }),
                    ...(input.sku !== undefined && { skus: input.sku }),
                  }
                ],
                // characteristics: [
                //   {
                //     name: input.characteristicName,
                //     value: input.characteristicValue,
                //   }
                // ]
              }
            ]
          }
        ];

        logger.info('Making Wildberries Product Card API request', {
          userId,
          endpoint: '/content/v2/get/cards/list',
          requestBody
        });

        // Make POST request to Wildberries Content API
        const response = await axios.post(
          'https://content-api-sandbox.wildberries.ru/content/v2/cards/upload',
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
        });

        // Return structured response as string (required by LangChain tools)
        return JSON.stringify({
          success: !response.data?.error,
          data: response.data,
          requestParams: requestBody,
          ...(response.data?.errorText && { errorMessage: response.data.errorText }),
          ...(response.data?.additionalErrors && { additionalErrors: response.data.additionalErrors }),
          metadata: {
            endpoint: "create_wildberries_product_card",
            rateLimit: "10 requests per minute",
            apiCategory: "Content"
          }
        });

      } catch (error) {
        return handleWildberriesError(error, userId);
      }
    },
    {
      name: "create_wildberries_product_card",
      description: `Create a new product card on Wildberries marketplace.
      This tool creates a new product card on Wildberries marketplace.
      Use this when users ask about:
      - Creating a new product card on Wildberries
      - Adding a new product to the seller's catalog
      
      Keep in mind that this tool requires a valid subjectId from Wildberries API.
      If you don't have a subjectId, you can get it using another tool.
      
      Returns nothing if the product card is created successfully, otherwise returns an error message.`,
      schema: createWildberriesProductCardSchema
    }
  );
}

const getWildberriesSubjectIdSchema = z.object({
  // locale: z.string().optional().describe("Locale of the subject"),
  name: z.string().describe("Name of the subject. Search uses substring matching."),
  parentId: z.number().min(0).optional().describe("Parent ID of the subject"),
  limit: z.number().min(1).max(1000).optional().describe("Number of subjects to fetch (1-1000, default: 30)"),
  offset: z.number().min(0).optional().describe("Offset for pagination (default: 0)"),
});

/**
 * Create a Wildberries Subject ID tool for getting a subject ID from Wildberries API
 * Based on: https://dev.wildberries.ru/openapi/work-with-products#tag/Kategorii-predmety-i-harakteristiki/paths/~1content~1v2~1object~1all/get
 */
export function getWildberriesSubjectIdTool(userId: string) {
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
        const requestParams = {
          // locale: 'ru',
          name: input.name,
          limit: input.limit || 30,
          ...(input.parentId !== undefined && { parentID: input.parentId }),
          ...(input.offset !== undefined && { offset: input.offset }),
        }

        logger.info('Making Wildberries Subject ID API request', {
          userId,
          endpoint: '/content/v2/object/all',
          requestParams
        });

        // Make GET request to Wildberries Content API
        const response = await axios.get(
          'https://content-api-sandbox.wildberries.ru/content/v2/object/all',
          {
            params: requestParams,
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
        });

        // Return structured response as string (required by LangChain tools)
        return JSON.stringify({
          success: !response.data?.error,
          data: response.data,
          requestParams: requestParams,
          ...(response.data?.errorText && { errorMessage: response.data.errorText }),
          ...(response.data?.additionalErrors && { additionalErrors: response.data.additionalErrors }),
          metadata: {
            endpoint: "get_wildberries_subject_id",
            rateLimit: "100 requests per minute",
            apiCategory: "Content"
          }
        });

      } catch (error) {
        return handleWildberriesError(error, userId);
      }
    },
    {
      name: "get_wildberries_subject_id",
      description: `Get a subject ID from Wildberries API.
      This tool gets a subject ID from Wildberries API.
      Use this when users ask about:
      - Getting a subject ID from Wildberries API
      
      Returns subject IDs. You need to decide which one to use.`,
      schema: getWildberriesSubjectIdSchema
    }
  )
}