import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';
import logger from '../../../shared/utils/logger';
import { getWildberriesApiKey, handleWildberriesError } from '../wildberries.service';
import { adjustProductDescription } from '../../../shared/utils/text-processing.utils';

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
export function getWildberriesSellerProductCardsTool(userId: string) {
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
  subjectID: z.number().int().min(1).describe("Subject ID from Wildberries API of the product"),
  brand: z.string().optional().describe("Brand of the product"),
  title: z.string().max(60).describe("Title of the product. Must be between 10-60 characters."),
  description: z.string().optional().describe("Description of the product. Must be between 1000-5000 characters."),
  vendorCode: z.string().describe("Vendor code of the product that the user wants to create"),
  productLength: z.number().int().min(0).describe("Length of the product in cm"),
  productWidth: z.number().int().min(0).describe("Width of the product in cm"),
  productHeight: z.number().int().min(0).describe("Height of the product in cm"),
  productWeightBrutto: z.number().min(0).describe("Weight of the product in kg"),
  size: z.number().int().min(0).optional().describe("Russian size of the product, if it is shoes, clothes, or similar products. If you don't know the size, leave it blank."),
  price: z.number().int().min(1).optional().describe("Price of the product in rubles"),
  sku: z.string().optional().describe("SKU of the product (if user doesn't provide, will be generated automatically by wildberries api)"),
});

/**
 * Create a Wildberries Product Card tool for creating a new product card on Wildberries marketplace
 * Based on: https://dev.wildberries.ru/openapi/work-with-products#tag/Sozdanie-kartochek-tovarov/paths/~1content~1v2~1cards~1upload/post
 */
export function createWildberriesProductCardTool(userId: string) {
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

        // Adjust description to meet Wildberries requirements
        const adjustedDescription = input.description ? 
          adjustProductDescription(input.description, input.title) : 
          "";

        // Log description adjustment if it occurred
        if (input.description && input.description !== adjustedDescription) {
          logger.info('Product description was adjusted to meet Wildberries requirements', {
            userId,
            originalLength: input.description.length,
            adjustedLength: adjustedDescription.length,
            productTitle: input.title
          });
        }

        // Build request body from validated input
        const requestBody = [
          {
            subjectID: input.subjectID,
            variants: [
              {
                ...(input.brand !== undefined && { brand: input.brand }),
                title: input.title,
                ...(adjustedDescription !== "" && { description: adjustedDescription }),
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
                    ...(input.sku !== undefined && { skus: [input.sku] }),
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

/**
 * Zod schema for Wildberries product card creation tool parameters
 */
const updateWildberriesProductCardSchema = z.object({
  nmID: z.number().int().min(1).describe("nmId of the product card to update"),
  brand: z.string().optional().describe("Brand of the product"),
  title: z.string().max(60).optional().describe("Title of the product. Must be between 10-60 characters."),
  description: z.string().optional().describe("Description of the product. Must be between 1000-5000 characters."),
  vendorCode: z.string().describe("Vendor code of the product that the user wants to update"),
  productLength: z.number().int().min(0).optional().describe("Length of the product in cm"),
  productWidth: z.number().int().min(0).optional().describe("Width of the product in cm"),
  productHeight: z.number().int().min(0).optional().describe("Height of the product in cm"),
  productWeightBrutto: z.number().min(0).optional().describe("Weight of the product in kg"),
  chrtID: z.number().int().min(0).optional().describe("The chrtID of the size of the product to change. If you don't know the chrtID, leave it blank."),
  size: z.number().int().min(0).optional().describe("Russian size of the product, if it is shoes, clothes, or similar products. If you don't know the size, leave it blank."),
  sku: z.string().describe("SKU of the product to update"),
});

/**
 * Create a Wildberries Product Card tool for updating a product card on Wildberries marketplace
 * Based on: https://dev.wildberries.ru/openapi/work-with-products#tag/Kartochki-tovarov/paths/~1content~1v2~1cards~1update/post
 */
export function updateWildberriesProductCardTool(userId: string) {
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

        // Adjust description to meet Wildberries requirements
        const adjustedDescription = input.description ? 
          adjustProductDescription(input.description, input.title) : 
          "";

        // Log description adjustment if it occurred
        if (input.description && input.description !== adjustedDescription) {
          logger.info('Product description was adjusted to meet Wildberries requirements', {
            userId,
            originalLength: input.description.length,
            adjustedLength: adjustedDescription.length,
            productTitle: input.title
          });
        }

        // Build request body from validated input
        const requestBody = [
          {
            nmID: input.nmID,
            ...(input.brand !== undefined && { brand: input.brand }),
            ...(input.title !== undefined && { title: input.title }),
            ...(adjustedDescription !== "" && { description: adjustedDescription }),
            vendorCode: input.vendorCode,
            dimensions: {
              ...(input.productLength !== undefined && { length: input.productLength }),
              ...(input.productWidth !== undefined && { width: input.productWidth }),
              ...(input.productHeight !== undefined && { height: input.productHeight }),
              ...(input.productWeightBrutto !== undefined && { weightBrutto: input.productWeightBrutto }),
            },
            sizes: [
              {
                ...(input.size !== undefined && { 
                  techSize: input.size,
                  wbSize: input.size 
                }),
                ...(input.sku !== undefined && { skus: [input.sku] }),
                ...(input.chrtID !== undefined && { chrtID: input.chrtID }),
              }
            ],
            // characteristics: [
            //   {
            //     name: input.characteristicName,
            //     value: input.characteristicValue,
            //   }
            // ]
          }
        ];

        logger.info('Making Wildberries Product Card API request', {
          userId,
          endpoint: '/content/v2/get/cards/list',
          requestBody
        });

        // Make POST request to Wildberries Content API
        const response = await axios.post(
          'https://content-api-sandbox.wildberries.ru/content/v2/cards/update',
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
            endpoint: "update_wildberries_product_card",
            rateLimit: "10 requests per minute",
            apiCategory: "Content"
          }
        });

      } catch (error) {
        return handleWildberriesError(error, userId);
      }
    },
    {
      name: "update_wildberries_product_card",
      description: `Update a product card on Wildberries marketplace.
      This tool updates a product card on Wildberries marketplace.
      Use this when users ask about:
      - Updating a product card on Wildberries
      - Changing the characteristics of a product card
      - Changing the size of a product card

      Requires nmID and sku of the product card to update. If the size needs to be changed, you need to provide chrtID of the size.
      You can get them looking up user's products using get_wildberries_seller_product_cards tool.

      If you want to change the price, you need to use set_wildberries_products_price tool.

      If the seller's product has some properties, they have to be included in the request body.
      
      Returns nothing if the product card is updated successfully, otherwise returns an error message.`,
      schema: updateWildberriesProductCardSchema
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
          data: { // In sandbox wildberries returns a mere subjectID, so we return mock data
            subjectID: 397,
            parentID: 786,
            subjectName: input.name,
            parentName: "Весь каталог"
          },
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

const setWildberriesProductsPriceSchema = z.object({
  data: z.array(z.object({
    nmID: z.number().int().min(1).describe("nmId of the product card to update"),
    price: z.number().int().min(1).optional().describe("Price of the product in rubles without discount. The new price can't be lower than 3 times the cost of the product."),
    discount: z.number().int().min(0).max(99).optional().describe("Discount of the product in percent."),
  })),
});

/**
 * Create a Wildberries Subject ID tool for getting a subject ID from Wildberries API
 * Based on: https://dev.wildberries.ru/openapi/work-with-products#tag/Ceny-i-skidki/paths/~1api~1v2~1upload~1task/post
 */
export function setWildberriesProductsPriceTool(userId: string) {
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
          data: input.data,
        }

        logger.info('Making Wildberries Products Price API request', {
          userId,
          endpoint: '/api/v2/upload/task',
          requestBody
        });

        // Make GET request to Wildberries Content API
        const response = await axios.post(
          'https://discounts-prices-api-sandbox.wildberries.ru/api/v2/upload/task',
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

        logger.info('Wildberries Products Price API request successful', {
          userId,
          statusCode: response.status,
        });

        // Return structured response as string (required by LangChain tools)
        return JSON.stringify({
          success: !response.data?.error,
          data: response.data,
          requestBody: requestBody,
          ...(response.data?.errorText && { errorMessage: response.data.errorText }),
          ...(response.data?.additionalErrors && { additionalErrors: response.data.additionalErrors }),
          metadata: {
            endpoint: "set_wildberries_products_price",
            rateLimit: "100 requests per minute",
            apiCategory: "Price"
          }
        });

      } catch (error) {
        return handleWildberriesError(error, userId);
      }
    },
    {
      name: "set_wildberries_products_price",
      description: `Set a price for products on Wildberries marketplace.
      This tool sets a price for products on Wildberries marketplace.
      Use this when users ask about:
      - Setting a price for products on Wildberries
      - Setting a discount for products on Wildberries
      
      Returns nothing if the price is set successfully, otherwise returns an error message.`,
      schema: setWildberriesProductsPriceSchema
    }
  )
}

const getWildberriesSellerProductsWithPriceSchema = z.object({
  limit: z.number().min(1).max(1000).optional().describe("Number of products to fetch (1-1000, default: 30)"),
  offset: z.number().min(0).optional().describe("Offset for pagination (default: 0)"),
  filterNmID: z.number().int().min(1).optional().describe("nmId of the product to filter by"),
});

/**
 * Create a Wildberries Seller Products with Price tool for getting a seller products with price from Wildberries API
 * Based on: https://dev.wildberries.ru/openapi/work-with-products#tag/Ceny-i-skidki/paths/~1api~1v2~1list~1goods~1filter/get
 */
export function getWildberriesSellerProductsWithPriceTool(userId: string) {
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
          limit: input.limit || 30,
          ...(input.filterNmID !== undefined && { filterNmID: input.filterNmID }),
          ...(input.offset !== undefined && { offset: input.offset }),
        }

        logger.info('Making Wildberries Seller Products with Price API request', {
          userId,
          endpoint: '/api/v2/list/goods/filter',
          requestParams
        });

        // Make GET request to Wildberries Content API
        const response = await axios.get(
          'https://discounts-prices-api-sandbox.wildberries.ru/api/v2/list/goods/filter',
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

        logger.info('Wildberries Seller Products with Price API request successful', {
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
            endpoint: "get_wildberries_seller_products_with_price",
            rateLimit: "100 requests per minute",
            apiCategory: "Content"
          }
        });

      } catch (error) {
        return handleWildberriesError(error, userId);
      }
    },
    {
      name: "get_wildberries_seller_products_with_price",
      description: `Get a seller products with price from Wildberries API.
      This tool gets a seller products with price from Wildberries API.
      Use this when users ask about:
      - Getting a seller products with price from Wildberries API
      
      Returns seller products with price and discount.`,
      schema: getWildberriesSellerProductsWithPriceSchema
    }
  )
}