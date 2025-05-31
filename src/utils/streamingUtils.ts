import { Response as ExpressResponse } from 'express';
import { Readable } from 'stream';
import logger from './logger';
import { AIMessageChunk } from '@langchain/core/messages';

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

export interface StreamEventData {
  event: string;
  data: any;
}

export class StreamController {
  private encoder = new TextEncoder();
  private controller: ReadableStreamDefaultController;

  constructor(controller: ReadableStreamDefaultController) {
    this.controller = controller;
  }

  sendEvent(event: string, data: any): void {
    const eventData = JSON.stringify(data);
    this.controller.enqueue(
      this.encoder.encode(`event: ${event}\ndata: ${eventData}\n\n`)
    );
  }

  sendChunk(content: string): void {
    this.sendEvent('chunk', content);
  }

  sendToolExecution(toolEvents: Array<{message: string, toolName: string}>): void {
    this.sendEvent('tool_execution', toolEvents);
  }

  sendToolComplete(toolEvents: Array<{message: string, toolName: string, status: 'success' | 'error'}>): void {
    this.sendEvent('tool_complete', toolEvents);
  }

  sendError(error: string): void {
    this.sendEvent('error', { error });
  }

  sendEnd(): void {
    this.sendEvent('end', {});
    this.controller.close();
  }

  close(): void {
    this.controller.close();
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

export function createStreamResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
} 