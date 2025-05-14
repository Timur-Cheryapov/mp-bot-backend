import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage } from '@langchain/core/messages';
import logger from './logger';

/**
 * Options for retry operation
 */
export type RetryOptions = {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
};

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffFactor: 2, 
};

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param options Retry options
 * @returns Result of the function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  // Merge with defaults to ensure all values exist
  const config = {
    maxRetries: options.maxRetries ?? DEFAULT_RETRY_OPTIONS.maxRetries,
    initialDelay: options.initialDelay ?? DEFAULT_RETRY_OPTIONS.initialDelay,
    maxDelay: options.maxDelay ?? DEFAULT_RETRY_OPTIONS.maxDelay,
    backoffFactor: options.backoffFactor ?? DEFAULT_RETRY_OPTIONS.backoffFactor
  };

  let lastError: Error | null = null;
  let delay = config.initialDelay;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        logger.debug(`Retry attempt ${attempt}/${config.maxRetries}`);
      }
      
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === config.maxRetries) {
        logger.error(`All retry attempts failed: ${lastError.message}`);
        break;
      }

      logger.warn(`Attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Calculate next delay with exponential backoff
      delay = Math.min(delay * config.backoffFactor, config.maxDelay);
    }
  }

  throw lastError || new Error('Retry operation failed');
}

/**
 * Invoke a model with retry logic
 * @param model ChatOpenAI model
 * @param messages Array of messages to send to the model
 * @param retryOptions Retry options
 * @returns Model response
 */
export async function invokeWithRetry(
  model: ChatOpenAI,
  messages: BaseMessage[],
  retryOptions?: RetryOptions
) {
  return withRetry(
    () => model.invoke(messages),
    retryOptions
  );
}

/**
 * Truncate text to a specified maximum length
 * @param text Text to truncate
 * @param maxLength Maximum length
 * @param addEllipsis Whether to add ellipsis at the end
 * @returns Truncated text
 */
export function truncateText(
  text: string,
  maxLength: number = 100,
  addEllipsis: boolean = true
): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  const truncated = text.slice(0, maxLength);
  return addEllipsis ? `${truncated}...` : truncated;
}

/**
 * Calculate approximate token count (rough estimate)
 * @param text Input text
 * @returns Estimated token count
 */
export function estimateTokenCount(text: string): number {
  // A rough approximation: GPT models use ~4 chars per token on average
  // This is just an estimate and will not be exact
  return Math.ceil(text.length / 4);
}

/**
 * Format chat history for readability
 * @param history Array of messages
 * @returns Formatted history string
 */
export function formatChatHistory(history: { role: string; content: string }[]): string {
  return history
    .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n');
}

/**
 * Clean text for safe use in prompts
 * @param text Text to clean
 * @returns Cleaned text
 */
export function sanitizeText(text: string): string {
  // Remove any potentially problematic characters or patterns
  return text
    .trim()
    .replace(/```/g, '\\`\\`\\`') // Escape backticks to prevent markdown code block interference
    .replace(/\n{3,}/g, '\n\n'); // Replace multiple newlines with just two
} 