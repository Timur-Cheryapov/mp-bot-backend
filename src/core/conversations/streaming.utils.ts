import { Response as ExpressResponse } from 'express';
import { setupStreamingHeaders, sendServerSentEvent } from '../../shared/utils/streaming.utils';
import { Readable } from 'stream';
import logger from '../../shared/utils/logger';
import { AIMessageChunk } from '@langchain/core/messages';

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

export async function streamAIResponse(
  chatModel: any,
  messages: any[],
  onChunk?: (chunk: AIMessageChunk) => void
): Promise<AIMessageChunk> {
  const streamResponse = await chatModel.stream(messages);
  let accumulatedResponse: AIMessageChunk | null = null;
  
  for await (const chunk of streamResponse) {
    if (onChunk && chunk.content) {
      onChunk(chunk);
    }
    
    // Accumulate the full response
    if (!accumulatedResponse) {
      accumulatedResponse = chunk;
    } else {
      accumulatedResponse = accumulatedResponse.concat(chunk);
    }
  }
  
  if (!accumulatedResponse) {
    throw new Error('No response received from AI model');
  }
  
  return accumulatedResponse;
}

/**
 * Stream AI response with immediate chunk processing (for real-time streaming)
 * This function processes chunks as they arrive without accumulation
 */
export async function streamAIResponseImmediate(
  chatModel: any,
  messages: any[],
  onChunk: (chunk: AIMessageChunk) => void
): Promise<AIMessageChunk> {
  const streamResponse = await chatModel.stream(messages);
  let accumulatedResponse: AIMessageChunk | null = null;
  
  for await (const chunk of streamResponse) {
    // Process chunk immediately
    if (chunk.content) {
      onChunk(chunk);
    }
    
    // Accumulate for final return
    if (!accumulatedResponse) {
      accumulatedResponse = chunk;
    } else {
      accumulatedResponse = accumulatedResponse.concat(chunk);
    }
  }
  
  if (!accumulatedResponse) {
    throw new Error('No response received from AI model');
  }
  
  return accumulatedResponse;
}