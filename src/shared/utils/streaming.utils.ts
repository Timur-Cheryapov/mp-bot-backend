import { Response as ExpressResponse } from 'express';

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

export function createStreamResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
} 