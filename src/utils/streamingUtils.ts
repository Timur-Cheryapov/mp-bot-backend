import { Response as ExpressResponse } from 'express';
import { Readable } from 'stream';
import logger from './logger';

/**
 * Sets up server-sent events headers for streaming responses
 * @param res - Express response object
 */
export function setupStreamingHeaders(res: ExpressResponse): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
}

/**
 * Sends a server-sent event to the client
 * @param res - Express response object
 * @param event - Event name
 * @param data - Event data
 */
export function sendServerSentEvent(res: ExpressResponse, event: string, data: string): void {
  res.write(`event: ${event}\ndata: ${data}\n\n`);
}

/**
 * Handles streaming response from AI service
 * @param res - Express response object
 * @param aiResponse - Response from AI service
 * @param conversationId - ID of the conversation
 * @returns Promise that resolves when streaming is complete
 */
export async function handleStreamingResponse(
  res: ExpressResponse, 
  aiResponse: any, 
  conversationId: string
): Promise<void> {
  try {
    setupStreamingHeaders(res);
    sendServerSentEvent(res, 'conversationId', conversationId);
    
    // Check if aiResponse.response is a Response object with a body
    if (aiResponse.response instanceof Response) {
      const responseBody = aiResponse.response.body;
      if (responseBody) {
        const reader = responseBody.getReader();
        const readableStream = new Readable({
          read() {
            reader.read().then(({ done, value }: { done: boolean; value: any }) => {
              if (done) {
                this.push(null);
              } else {
                this.push(value);
              }
            }).catch((err: Error) => {
              this.destroy(err);
            });
          }
        });
        
        // Pipe the stream to the response
        readableStream.pipe(res);
        return;
      }
    }
    
    // If no valid stream body, end the response
    res.end();
  } catch (error) {
    logger.error(`Error handling streaming response: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).end();
  }
} 