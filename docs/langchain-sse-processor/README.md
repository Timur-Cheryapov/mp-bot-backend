# langchain-sse-processor

A streamlined Node.js library for processing Langchain streaming responses into clean Server-Sent Events (SSE).

## Overview

When working with Langchain's streaming responses, the output format can be complex and contain additional metadata that isn't needed by the client. This library provides a clean, efficient way to process Langchain's `on_chat_model_stream` events into a simplified SSE stream. This implementation:

1. **Processes Langchain Stream Events** - Handles `on_chat_model_stream` and `on_chat_model_end` events
2. **Maintains SSE Format** - Preserves the standard SSE protocol for compatibility
3. **Preserves Text Formatting** - Handles newlines and special characters properly
4. **Optionally Tracks Token Usage** - Can extract and store token usage from Langchain's metadata
5. **Works with Conversation History** - Handles conversation IDs for multi-turn interactions

## Implementation Options

We provide several implementation options:

1. `stream-processor-full.js` - Complete version with token tracking and conversation ID handling
2. `stream-processor-no-tokens.js` - Simpler version without token usage tracking
3. `stream-processor-basic.js` - Most basic version with just content streaming

## Server-Side Implementation

The server-side implementation uses Node.js streams to process Langchain's SSE events. Here's how it works:

1. Langchain's streaming API returns SSE events with `on_chat_model_stream` type
2. Our `Transform` stream processor intercepts these events
3. It extracts the actual content from `chunk.kwargs.content`
4. It captures token usage from `on_chat_model_end` events
5. It reformats everything into clean SSE events for the client

### Key Features

- **Content Extraction**: Extracts text content from Langchain's response format
- **Token Usage Tracking**: Captures Langchain's token usage metadata
- **Newline Preservation**: JSON-encodes content to preserve formatting
- **Conversation Management**: Handles conversation IDs for stateful chats

## Client-Side Implementation

The client-side implementation handles the simplified SSE stream:

1. Sets up a standard `fetch` request with appropriate headers
2. Processes the SSE events using the browser's built-in stream reader
3. Parses the JSON-encoded content to preserve formatting
4. Provides callbacks for different event types (chunks, completion, etc.)

### Key Features

- **Simple API**: Easy-to-use `streamChat` function with callback options
- **Format Preservation**: Properly handles newlines and special characters
- **Error Handling**: Robust error management and fallbacks
- **Full Message Accumulation**: Maintains the complete response text

## Usage Examples

See the following files for implementation examples:

- `client-side-example.js` - Client-side implementation
- `stream-processor-full.js` - Server-side implementation with all features
- `stream-processor-no-tokens.js` - Server-side implementation without token tracking
- `stream-processor-basic.js` - Minimal server-side implementation

## Getting Started

1. Choose the server-side implementation that fits your needs
2. Integrate it into your Express/Node.js route handlers
3. Use the client-side example for your frontend implementation
4. Customize the callbacks to fit your UI requirements

## License

MIT 